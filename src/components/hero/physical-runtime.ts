import type { Material, Object3D } from "three";
import {
  AgXToneMapping,
  AnimationMixer,
  BoxGeometry,
  Color,
  HemisphereLight,
  LoopOnce,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RectAreaLight,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { FogVolumeMaterial, PhysicalCamera, WebGLPathTracer } from "three-gpu-pathtracer";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { ScenePreset, Vec3 } from "@/components/hero/_types/scene-preset";
import type { SceneController } from "@/components/hero/_types/scene-runtime";
import { createSceneTuner, type SceneTuner } from "@/components/hero/editor/scene-bindings";
import { createPhysicalDenoiser } from "@/components/hero/physical-denoiser";
import { HERO_ASSET_ROOT, HERO_COMPACT_QUERY } from "@/components/hero/scene-assets";
import { readConfig } from "@/components/hero/scene-config";

type Options = {
  editor?: boolean;
  onFailure(): void;
  onPlaying(value: boolean): void;
  onProgress?(value: number): void;
  onSamples?(samples: number, target: number): void;
  onTuningChange?(preset: ScenePreset): void;
  restoreTuning?(defaults: ScenePreset): unknown;
  signal: AbortSignal;
};

function disposeAsset(root: Object3D) {
  const geometry = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
    }
  });
  geometry.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  textures.forEach((item) => {
    if (typeof ImageBitmap !== "undefined" && item.image instanceof ImageBitmap) item.image.close();
    item.dispose();
  });
}

/** Geometry-occluded area lights, indirect paths and a homogeneous scattering volume. */
export async function createScene(host: HTMLElement, options: Options): Promise<SceneController> {
  const { signal } = options;
  signal.throwIfAborted();
  const root = HERO_ASSET_ROOT;
  const [manifest, asset] = await Promise.all([
    fetch(root + "scene-config.json", { signal }),
    fetch(root + "keld-hero.glb", { signal }),
  ]);
  if (!manifest.ok || !asset.ok) throw new Error("Physical scene assets could not be loaded.");
  const config = readConfig(await manifest.json());
  if (config.renderMode !== "pathtraced" || !config.volume)
    throw new Error("The scene is not authored for physical rendering.");
  const buffer = await asset.arrayBuffer();
  signal.throwIfAborted();
  let model: GLTF | undefined;
  let renderer: WebGLRenderer | undefined;
  let tracer: WebGLPathTracer | undefined;
  let tuner: SceneTuner | undefined;
  let controls: OrbitControls | undefined;
  let observer: ResizeObserver | undefined;
  let mixer: AnimationMixer | undefined;
  let volume: Mesh<BoxGeometry, FogVolumeMaterial> | undefined;
  let denoiser: ReturnType<typeof createPhysicalDenoiser> | undefined;
  let denoise = true;
  let frame = 0;
  let disposed = false;
  let visible = true;
  let capturing = false;
  let captureCancelled = false;
  let cameraEdited = false;
  let syncingOrbit = false;
  let ready = false;
  let elapsed = config.durationSeconds;
  let lastReported = -1;
  let targetSamples = 1024;
  let lastPresentedSample = -1;
  let presentationRequested = true;
  let viewportWidth = 0;
  let viewportHeight = 0;
  const scene = new Scene();
  const camera = new PhysicalCamera(26.5, 16 / 9, 0.1, 120);
  const lights: RectAreaLight[] = [];
  let resolveFirst: (() => void) | undefined;
  let rejectFirst: ((error: unknown) => void) | undefined;
  const firstFrame = new Promise<void>((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  // Avoid an unhandled rejection if setup fails before the first-frame wait.
  void firstFrame.catch(() => undefined);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    controls?.dispose();
    tuner?.dispose();
    mixer?.stopAllAction();
    if (model) mixer?.uncacheRoot(model.scene);
    tracer?.dispose();
    denoiser?.dispose();
    if (model) disposeAsset(model.scene);
    volume?.geometry.dispose();
    volume?.material.dispose();
    renderer?.domElement.removeEventListener("webglcontextlost", lost);
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    signal.removeEventListener("abort", abort);
    if (!ready) rejectFirst?.(new Error("Physical scene initialization was interrupted."));
  };
  const abort = () => dispose();
  function lost(event: Event) {
    event.preventDefault();
    options.onFailure();
    dispose();
  }
  function fail(error: unknown) {
    if (!ready) rejectFirst?.(error);
    else {
      console.warn("KELD live physical rendering stopped.", error);
      options.onFailure();
    }
    dispose();
  }

  try {
    model = await new GLTFLoader().parseAsync(buffer, root);
    signal.throwIfAborted();
    scene.background = new Color(config.background);
    // No raster fog, captured reflection probe, hemisphere fill or emissive haze cards.
    scene.environment = null;
    scene.fog = null;
    scene.add(model.scene);
    model.scene.traverse((object) => {
      if (object instanceof Mesh) {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (material instanceof MeshStandardMaterial) {
            (material as MeshStandardMaterial & { castShadow: boolean }).castShadow = true;
          }
        }
      }
    });
    for (const spec of config.lights) {
      if (spec.type !== "area") throw new Error("The physical scene expects area emitters.");
      const light = new RectAreaLight(spec.color, spec.intensity, spec.width, spec.height);
      light.name = spec.name;
      light.position.fromArray(spec.position);
      light.lookAt(...spec.target);
      scene.add(light);
      lights.push(light);
    }
    const fogMaterial = new FogVolumeMaterial({ color: config.fog?.color ?? "#ffffff" });
    fogMaterial.density = config.fog?.density ?? 0;
    fogMaterial.emissiveIntensity = 0;
    volume = new Mesh(new BoxGeometry(...config.volume.size), fogMaterial);
    volume.name = "PhysicalAtmosphere";
    volume.position.fromArray(config.volume.position);
    scene.add(volume);
    renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = config.exposure;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.addEventListener("webglcontextlost", lost);
    host.appendChild(renderer.domElement);
    signal.addEventListener("abort", abort, { once: true });
    tuner = createSceneTuner({
      source: config,
      scene,
      model,
      renderer,
      hemisphere: new HemisphereLight(0, 0, 0),
      lights,
      volume: fogMaterial,
    });
    const clip = model.animations.find((item) => item.name === config.animation);
    if (!clip) throw new Error("The assembled physical pose is missing.");
    mixer = new AnimationMixer(model.scene);
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(elapsed);
    scene.updateMatrixWorld(true);
    const windowMesh = model.scene.getObjectByName("BlueDaylightAperture");
    const windowSpec = config.lights.find((item) => item.name === "WindowEmitter");
    const windowLight = lights.find((item) => item.name === "WindowEmitter");
    const windowRelation =
      windowMesh && windowLight
        ? windowLight.matrixWorld.clone().invert().multiply(windowMesh.matrixWorld)
        : null;

    function syncEmitter() {
      if (!windowMesh || !windowSpec || !windowLight || !windowRelation) return;
      windowLight.updateMatrixWorld(true);
      const world = windowLight.matrixWorld
        .clone()
        .multiply(
          new Matrix4().makeScale(
            windowLight.width / windowSpec.width,
            windowLight.height / windowSpec.height,
            1,
          ),
        )
        .multiply(windowRelation);
      const local = windowMesh.parent
        ? windowMesh.parent.matrixWorld.clone().invert().multiply(world)
        : world;
      local.decompose(windowMesh.position, windowMesh.quaternion, windowMesh.scale);
      windowMesh.visible = windowLight.visible;
      windowMesh.traverse((object) => {
        if (object instanceof Mesh)
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (material instanceof MeshStandardMaterial) {
              material.emissive.copy(windowLight.color);
              material.emissiveIntensity = windowLight.intensity;
            }
          }
      });
      windowMesh.updateMatrixWorld(true);
    }
    // Restore before camera setup, BVH construction and the first traced frame.
    // Reapplying a draft from the inspector used to reset the image twice.
    const initialPreset = options.restoreTuning?.(tuner.getDefaults());
    if (initialPreset) {
      try {
        await tuner.apply(initialPreset);
        cameraEdited =
          JSON.stringify(tuner.get().camera) !== JSON.stringify(tuner.getDefaults().camera);
      } catch {
        // Invalid drafts retain the authored scene without deleting user data.
      }
      signal.throwIfAborted();
    }
    syncEmitter();

    function updateCamera(
      mode?: "desktop" | "mobile",
      width = host.clientWidth,
      height = host.clientHeight,
    ) {
      const compact = mode ? mode === "mobile" : matchMedia(HERO_COMPACT_QUERY).matches;
      const authored = config.cameras[compact ? "mobile" : "desktop"];
      const spec = !mode && cameraEdited ? tuner!.get().camera : authored;
      camera.position.fromArray(spec.position);
      camera.lookAt(...spec.target);
      const aspect = Math.max(1, width) / Math.max(1, height);
      const contain = Math.max(1, (compact ? 0.8 : 16 / 9) / aspect);
      camera.fov = (2 * Math.atan(Math.tan((spec.fov * Math.PI) / 360) * contain) * 180) / Math.PI;
      camera.aspect = aspect;
      camera.filmGauge = 32 * Math.max(aspect, 1);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const effects = tuner!.get().effects;
      camera.fStop =
        effects.depthOfFieldEnabled && effects.aperture > 0
          ? Math.sqrt(0.008 / effects.aperture)
          : Infinity;
      camera.focusDistance = Math.max(
        0.1,
        -new Vector3(...(config.depthOfField?.target ?? authored.target)).applyMatrix4(
          camera.matrixWorldInverse,
        ).z,
      );
      if (controls && !mode) {
        syncingOrbit = true;
        controls.target.fromArray(spec.target);
        controls.update();
        syncingOrbit = false;
      }
    }
    updateCamera();
    // The pinned WebGL backend is used because release 0.0.27's WebGPU backend
    // does not yet implement FogVolumeMaterial. No raster fallback is displayed.
    tracer = new WebGLPathTracer(renderer);
    tracer.rasterizeScene = false;
    tracer.rasterizeSceneCallback = () => undefined;
    tracer.dynamicLowRes = false;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 8;
    tracer.bounces = 12;
    tracer.transmissiveBounces = 10;
    tracer.filterGlossyFactor = 0;
    tracer.multipleImportanceSampling = true;
    tracer.renderScale = matchMedia(HERO_COMPACT_QUERY).matches ? 0.7 : 0.75;
    tracer.textureSize.set(1024, 1024);
    // One complete sample per animation frame. Four tiles previously imposed
    // four frame waits and four display filters for every accumulated sample.
    tracer.tiles.set(1, 1);
    viewportWidth = Math.max(1, host.clientWidth);
    viewportHeight = Math.max(1, host.clientHeight);
    renderer.setSize(viewportWidth, viewportHeight, false);
    tracer.setScene(scene, camera);

    // Display denoising only: ray intersections and light transport stay unchanged.
    denoiser = createPhysicalDenoiser(renderer, scene, camera, [volume]);
    host.dataset.noiseFilter = "geometry-guided";
    const presentRaw = tracer.renderToCanvasCallback;
    tracer.renderToCanvasCallback = (target, outputRenderer, quad) => {
      const samples = Math.floor(tracer?.samples ?? 0);
      const interval = samples <= 32 ? 1 : samples <= 256 ? 4 : 16;
      if (
        !presentationRequested &&
        samples - lastPresentedSample < interval &&
        !(samples === targetSamples && samples !== lastPresentedSample)
      )
        return;
      presentationRequested = false;
      lastPresentedSample = samples;
      if (!denoise || !denoiser) {
        presentRaw(target, outputRenderer, quad);
        return;
      }
      denoiser.render(target, samples);
    };

    function requestFrame() {
      if (!disposed && visible && !capturing && !frame) frame = requestAnimationFrame(tick);
    }
    function tick() {
      frame = 0;
      if (disposed || !visible || capturing || !tracer) return;
      try {
        // Repainting a denoising/exposure change must not exceed the budget.
        tracer.pausePathTracing = tracer.samples >= targetSamples;
        tracer.renderSample();
        const samples = Math.floor(tracer.samples);
        if (
          samples === targetSamples ||
          Math.floor(samples / 16) !== Math.floor(lastReported / 16)
        ) {
          lastReported = samples;
          options.onSamples?.(samples, targetSamples);
        }
        host.dataset.samples = String(samples);
        host.dataset.sampleBudget = String(targetSamples);
        if (!ready && samples >= 32) {
          ready = true;
          resolveFirst?.();
        }
        if (samples < targetSamples) requestFrame();
      } catch (error) {
        fail(error);
      }
    }
    function restart() {
      if (!tracer || disposed) return;
      tracer.reset();
      denoiser?.invalidate();
      lastPresentedSample = -1;
      presentationRequested = true;
      host.dataset.samples = "0";
      lastReported = -1;
      requestFrame();
    }
    function resize() {
      if (disposed || capturing || !renderer || !tracer) return;
      const width = Math.max(1, host.clientWidth),
        height = Math.max(1, host.clientHeight);
      if (width === viewportWidth && height === viewportHeight) return;
      viewportWidth = width;
      viewportHeight = height;
      renderer.setSize(width, height, false);
      updateCamera(undefined, width, height);
      tracer.updateCamera();
      restart();
    }
    observer = new ResizeObserver(resize);
    observer.observe(host);
    if (options.editor) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.fromArray(
        cameraEdited
          ? tuner.get().camera.target
          : config.cameras[matchMedia(HERO_COMPACT_QUERY).matches ? "mobile" : "desktop"].target,
      );
      controls.enableDamping = false;
      controls.minDistance = 0.7;
      controls.maxDistance = 38;
      controls.update();
      controls.addEventListener("change", () => {
        if (disposed || syncingOrbit || capturing || !controls || !tuner || !tracer) return;
        cameraEdited = true;
        tuner.syncOrbit(camera.position.toArray() as Vec3, controls.target.toArray() as Vec3);
        options.onTuningChange?.(tuner.get());
        camera.updateMatrixWorld();
        tracer.updateCamera();
        restart();
      });
    }
    requestFrame();
    await firstFrame;
    signal.throwIfAborted();

    return {
      renderMode: "pathtraced",
      getTuning: () => tuner?.get() ?? null,
      getDefaultTuning: () => tuner?.getDefaults() ?? null,
      getDenoising: () => denoise,
      getSampleBudget: () => targetSamples,
      setSampleBudget(value) {
        if (disposed || capturing || ![64, 256, 1024, 4096].includes(value)) return;
        targetSamples = value;
        lastReported = -1;
        presentationRequested = true;
        requestFrame();
      },
      cancelCapture() {
        captureCancelled = true;
      },
      setDenoising(value) {
        denoise = value;
        host.dataset.noiseFilter = value ? "geometry-guided" : "off";
        presentationRequested = true;
        requestFrame();
      },
      dispose,
      play() {
        options.onPlaying(false);
        restart();
      },
      pause() {
        cancelAnimationFrame(frame);
        frame = 0;
        options.onPlaying(false);
      },
      replay() {
        options.onPlaying(false);
        restart();
      },
      seek(progress) {
        if (disposed || !mixer || !tracer) return;
        elapsed = Math.max(0, Math.min(1, progress)) * config.durationSeconds;
        action.paused = false;
        mixer.setTime(elapsed);
        tracer.setScene(scene, camera);
        options.onProgress?.(progress);
        restart();
      },
      setEnergy(value) {
        if (!windowLight || disposed || !tracer) return;
        windowLight.visible = value;
        syncEmitter();
        tracer.setScene(scene, camera);
        restart();
      },
      setVisible(value) {
        visible = value;
        if (!visible) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else requestFrame();
      },
      async applyTuning(preset) {
        if (disposed || !tuner || !tracer || capturing) return false;
        const previous = tuner.get();
        if (!(await tuner.apply(preset))) return false;
        const next = tuner.get();
        if (JSON.stringify(previous) === JSON.stringify(next)) return true;
        const previousTransport = structuredClone(previous);
        previousTransport.atmosphere.exposure = next.atmosphere.exposure;
        if (JSON.stringify(previousTransport) === JSON.stringify(next)) {
          // Exposure maps already accumulated light to the display; it does
          // not alter paths and should never discard the clean image.
          presentationRequested = true;
          requestFrame();
          return true;
        }
        const baseline = tuner.getDefaults().camera;
        cameraEdited = JSON.stringify(next.camera) !== JSON.stringify(baseline);
        updateCamera();
        syncEmitter();
        scene.updateMatrixWorld(true);
        const moved =
          JSON.stringify(previous.objects) !== JSON.stringify(next.objects) ||
          JSON.stringify(previous.lights) !== JSON.stringify(next.lights);
        if (moved) tracer.setScene(scene, camera);
        else {
          tracer.updateMaterials();
          tracer.updateCamera();
          tracer.updateLights();
          tracer.updateEnvironment();
        }
        restart();
        return true;
      },
      async capturePoster(mode) {
        if (disposed || !renderer || !tracer || capturing)
          throw new Error("A physical render is already in progress or unavailable.");
        capturing = true;
        captureCancelled = false;
        cancelAnimationFrame(frame);
        frame = 0;
        const currentScale = tracer.renderScale;
        if (controls) controls.enabled = false;
        const width = mode === "mobile" ? 1080 : 1920,
          height = mode === "mobile" ? 1350 : 1080;
        try {
          renderer.setSize(width, height, false);
          updateCamera(mode, width, height);
          tracer.renderScale = 1;
          tracer.tiles.set(3, 3);
          tracer.pausePathTracing = false;
          tracer.updateCamera();
          tracer.reset();
          denoiser?.invalidate();
          lastPresentedSample = -1;
          presentationRequested = true;
          const started = performance.now();
          const exportSamples = Math.max(512, targetSamples);
          let reported = -1;
          while (tracer.samples < exportSamples) {
            signal.throwIfAborted();
            if (captureCancelled) throw new Error("Image export cancelled. Preview restored.");
            if (disposed) throw new Error("The render was interrupted.");
            if (performance.now() - started > 600000)
              throw new Error(
                "The image export exceeded ten minutes. Use the native Blender scene for an offline render.",
              );
            tracer.renderSample();
            const samples = Math.floor(tracer.samples);
            if (
              samples === exportSamples ||
              Math.floor(samples / 16) !== Math.floor(reported / 16)
            ) {
              reported = samples;
              options.onSamples?.(samples, exportSamples);
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
          presentationRequested = true;
          tracer.pausePathTracing = true;
          tracer.renderSample();
          return renderer.domElement.toDataURL("image/png");
        } finally {
          capturing = false;
          if (!disposed) {
            tracer.renderScale = currentScale;
            tracer.tiles.set(1, 1);
            if (controls) controls.enabled = true;
            viewportWidth = 0;
            viewportHeight = 0;
            resize();
          }
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
