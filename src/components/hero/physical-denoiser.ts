import {
  Color,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  MeshNormalMaterial,
  NearestFilter,
  NoBlending,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const guideShader = /* glsl */ `
  uniform sampler2D sourceMap;
  uniform sampler2D normalMap;
  uniform sampler2D depthMap;
  uniform vec2 texel;
  uniform vec2 nearFar;
  uniform float exposure;
  varying vec2 vUv;

  float keldLuminance(vec3 c) {
    return dot(max(c, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
  }
  float viewDepth(vec2 uv) {
    float d = texture2D(depthMap, uv).x;
    return nearFar.x * nearFar.y /
      max(nearFar.y - d * (nearFar.y - nearFar.x), 0.00001);
  }
  float guideWeight(vec2 uv, vec4 centerNormal, float centerDepth, float distance) {
    vec4 n = texture2D(normalMap, uv);
    if (abs(n.a - centerNormal.a) > 0.5) return 0.0;
    if (n.a < 0.5) return 1.0;
    vec3 a = normalize(centerNormal.rgb * 2.0 - 1.0);
    vec3 b = normalize(n.rgb * 2.0 - 1.0);
    float normalWeight = pow(max(dot(a, b), 0.0), 32.0);
    float depthScale = max(0.025, centerDepth * 0.012 * max(distance, 1.0));
    return normalWeight * exp(-abs(viewDepth(uv) - centerDepth) / depthScale);
  }
`;

/**
 * Display-only reconstruction. The normal/depth guide never appears on screen.
 * Filtered pixels never feed the path tracer's accumulated radiance.
 */
export function createPhysicalDenoiser(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  excludedObjects: Object3D[] = [],
) {
  const guide = new WebGLRenderTarget(1, 1, {
    depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    magFilter: NearestFilter,
    minFilter: NearestFilter,
  });
  const makeTarget = () =>
    new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      stencilBuffer: false,
      type: HalfFloatType,
    });
  const buffers = [makeTarget(), makeTarget()];
  const normalMaterial = new MeshNormalMaterial({
    blending: NoBlending,
    toneMapped: false,
  });
  const uniforms = {
    colorSigma: { value: 0.5 },
    depthMap: { value: guide.depthTexture },
    exposure: { value: 1 },
    nearFar: { value: new Vector2(camera.near, camera.far) },
    normalMap: { value: guide.texture },
    sourceMap: { value: buffers[0].texture },
    stepSize: { value: 1 },
    texel: { value: new Vector2(1, 1) },
  };
  const materialOptions = {
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms,
    vertexShader,
  };
  const cleanMaterial = new ShaderMaterial({
    ...materialOptions,
    fragmentShader:
      guideShader +
      /* glsl */ `
      void main() {
        vec4 centerNormal = texture2D(normalMap, vUv);
        float centerDepth = viewDepth(vUv);
        vec3 colors[9];
        float weights[9];
        float lumas[9];
        float total = 0.0;
        float first = 0.0;
        float second = 0.0;
        float maximum = -1.0;
        float maximumWeight = 0.0;
        int index = 0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 uv = clamp(vUv + offset * texel, texel * 0.5, 1.0 - texel * 0.5);
            vec3 c = max(texture2D(sourceMap, uv).rgb, vec3(0.0));
            float w = guideWeight(uv, centerNormal, centerDepth, length(offset));
            float l = keldLuminance(c) * exposure;
            colors[index] = c;
            weights[index] = w;
            lumas[index] = l;
            total += w;
            first += l * w;
            second += l * l * w;
            if (w > 0.1 && l > maximum) {
              maximum = l;
              maximumWeight = w;
            }
            index++;
          }
        }
        // Estimate variance without letting an isolated firefly define an edge.
        // Trim display pixels only; the accumulated transport remains untouched.
        float count = max(total - maximumWeight, 0.0001);
        float mean = max(0.0, (first - maximum * maximumWeight) / count);
        float variance = max(0.0,
          (second - maximum * maximum * maximumWeight) / count - mean * mean);
        float limit = mean + 3.0 * sqrt(variance) + max(0.03, mean * 0.35);
        vec3 result = vec3(0.0);
        float sum = 0.0;
        for (int i = 0; i < 9; i++) {
          float trim = total > 3.0
            ? min(1.0, limit / max(lumas[i], 0.00001)) : 1.0;
          result += colors[i] * trim * weights[i];
          sum += weights[i];
        }
        gl_FragColor = vec4(result / max(sum, 0.0001), 1.0);
      }
    `,
  });
  const filterMaterial = new ShaderMaterial({
    ...materialOptions,
    fragmentShader:
      guideShader +
      /* glsl */ `
      uniform float stepSize;
      uniform float colorSigma;
      void main() {
        vec3 center = texture2D(sourceMap, vUv).rgb;
        vec4 centerNormal = texture2D(normalMap, vUv);
        float centerDepth = viewDepth(vUv);
        float centerLuma = log(0.02 + keldLuminance(center) * exposure);
        vec3 result = vec3(0.0);
        float sum = 0.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)) * stepSize;
            vec2 uv = clamp(vUv + offset * texel, texel * 0.5, 1.0 - texel * 0.5);
            vec3 c = texture2D(sourceMap, uv).rgb;
            float l = log(0.02 + keldLuminance(c) * exposure);
            float spatial = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
            float range = exp(-abs(l - centerLuma) / colorSigma);
            float w = spatial * range *
              guideWeight(uv, centerNormal, centerDepth, length(offset));
            result += c * w;
            sum += w;
          }
        }
        gl_FragColor = vec4(result / max(sum, 0.0001), 1.0);
      }
    `,
  });
  const outputMaterial = new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D sourceMap;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(sourceMap, vUv).rgb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    uniforms: { sourceMap: uniforms.sourceMap },
    vertexShader,
  });
  const quad = new FullScreenQuad(cleanMaterial);
  const viewport = new Vector4();
  const scissor = new Vector4();
  const clearColor = new Color();
  let dirty = true;
  let disposed = false;

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      guide.depthTexture?.dispose();
      guide.dispose();
      buffers.forEach((buffer) => buffer.dispose());
      normalMaterial.dispose();
      cleanMaterial.dispose();
      filterMaterial.dispose();
      outputMaterial.dispose();
      quad.dispose();
    },
    invalidate() {
      dirty = true;
    },
    render(target: WebGLRenderTarget, samples: number) {
      if (disposed) return;
      const originalTarget = renderer.getRenderTarget();
      const cubeFace = renderer.getActiveCubeFace();
      const mipLevel = renderer.getActiveMipmapLevel();
      const originalViewport = renderer.getViewport(viewport);
      const originalScissor = renderer.getScissor(scissor);
      const originalScissorTest = renderer.getScissorTest();
      const originalAutoClear = renderer.autoClear;
      const originalClearColor = renderer.getClearColor(clearColor);
      const originalClearAlpha = renderer.getClearAlpha();
      const originalOverride = scene.overrideMaterial;
      const originalBackground = scene.background;
      const originalVisibility = excludedObjects.map((object) => object.visible);
      try {
        renderer.autoClear = false;
        renderer.setScissorTest(false);
        if (guide.width !== target.width || guide.height !== target.height) {
          guide.setSize(target.width, target.height);
          buffers.forEach((buffer) => buffer.setSize(target.width, target.height));
          uniforms.texel.value.set(1 / target.width, 1 / target.height);
          dirty = true;
        }
        uniforms.nearFar.value.set(camera.near, camera.far);
        uniforms.exposure.value = Math.max(renderer.toneMappingExposure, 0.0001);
        if (dirty) {
          excludedObjects.forEach((object) => {
            object.visible = false;
          });
          scene.overrideMaterial = normalMaterial;
          scene.background = null;
          renderer.setRenderTarget(guide);
          renderer.setClearColor(0, 0);
          renderer.clear(true, true, false);
          renderer.render(scene, camera);
          scene.overrideMaterial = originalOverride;
          scene.background = originalBackground;
          excludedObjects.forEach((object, index) => {
            object.visible = originalVisibility[index];
          });
          dirty = false;
        }
        uniforms.sourceMap.value = target.texture;
        quad.material = cleanMaterial;
        renderer.setRenderTarget(buffers[0]);
        quad.render(renderer);
        quad.material = filterMaterial;
        // Keep a continuous filtering floor instead of switching off at 256.
        uniforms.colorSigma.value = 0.25 + 0.3 / Math.sqrt(Math.max(samples, 1) / 32);
        let sourceIndex = 0;
        for (const step of [1, 2, 4]) {
          uniforms.stepSize.value = step;
          uniforms.sourceMap.value = buffers[sourceIndex].texture;
          sourceIndex = 1 - sourceIndex;
          renderer.setRenderTarget(buffers[sourceIndex]);
          quad.render(renderer);
        }
        uniforms.sourceMap.value = buffers[sourceIndex].texture;
        quad.material = outputMaterial;
        renderer.setRenderTarget(originalTarget, cubeFace, mipLevel);
        renderer.setViewport(originalViewport);
        renderer.setScissor(originalScissor);
        renderer.setScissorTest(originalScissorTest);
        quad.render(renderer);
      } finally {
        scene.overrideMaterial = originalOverride;
        scene.background = originalBackground;
        excludedObjects.forEach((object, index) => {
          object.visible = originalVisibility[index];
        });
        renderer.setRenderTarget(originalTarget, cubeFace, mipLevel);
        renderer.setViewport(originalViewport);
        renderer.setScissor(originalScissor);
        renderer.setScissorTest(originalScissorTest);
        renderer.setClearColor(originalClearColor, originalClearAlpha);
        renderer.autoClear = originalAutoClear;
      }
    },
  };
}
