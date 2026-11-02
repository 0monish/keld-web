import type { MeshStandardMaterial, Texture, Vector2 } from "three";
import {
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type WebGLRenderer,
} from "three";

import type { StoneTuning } from "@/components/hero/editor/scene-preset";
import { type StoneMaterialId, stonePaths } from "@/components/hero/editor/stone-catalog";
import { HERO_COMPACT_QUERY } from "@/components/hero/scene-assets";

type Maps = { color: Texture; normal: Texture; roughness: Texture };
type Original = {
  material: MeshStandardMaterial;
  map: Texture | null;
  normalMap: Texture | null;
  roughnessMap: Texture | null;
  normalX: number;
  normalY: number;
};

/** At most one selected texture set remains resident on the GPU. */
import type { StoneTextures } from "@/components/hero/_types/stone-textures";
export type { StoneTextures } from "@/components/hero/_types/stone-textures";

export function createStoneTextures(
  materials: MeshStandardMaterial[],
  renderer: WebGLRenderer,
  embeddedId?: StoneMaterialId,
): StoneTextures {
  const originals: Original[] = materials.map((material) => ({
    material,
    map: material.map,
    normalMap: material.normalMap,
    roughnessMap: material.roughnessMap,
    normalX: material.normalScale.x,
    normalY: material.normalScale.y,
  }));
  const originalTransforms = new Map<Texture, { repeat: Vector2; offset: Vector2 }>();
  for (const original of originals) {
    for (const texture of [original.map, original.normalMap, original.roughnessMap]) {
      if (texture && !originalTransforms.has(texture)) {
        originalTransforms.set(texture, {
          repeat: texture.repeat.clone(),
          offset: texture.offset.clone(),
        });
      }
    }
  }
  const loader = new TextureLoader();
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  let active: { id: string; compact: boolean; maps: Maps } | null = null;
  let revision = 0;
  let disposed = false;

  const destroy = (maps: Maps) =>
    [maps.color, maps.normal, maps.roughness].forEach((texture) => texture.dispose());

  function applyTextureMaps(maps: Maps | null, tuning: StoneTuning) {
    const tile = tuning.tiling;
    if (maps) {
      // UV transforms apply uniformly to the aligned PBR maps.
      [maps.color, maps.normal, maps.roughness].forEach((texture) =>
        texture.repeat.set(tile, tile),
      );
    }
    for (const original of originals) {
      const { material } = original;
      material.map = maps?.color ?? original.map;
      material.normalMap = maps?.normal ?? original.normalMap;
      material.roughnessMap = maps?.roughness ?? original.roughnessMap;
      if (maps || tuning.id === embeddedId)
        material.normalScale.set(tuning.normalStrength, tuning.normalStrength);
      else material.normalScale.set(original.normalX, original.normalY);
      material.needsUpdate = true;
    }
    if (!maps) {
      for (const [texture, original] of originalTransforms) {
        if (tuning.id === embeddedId && texture.channel === 0) {
          texture.repeat.set(tile, tile);
          // Match Blender's UV transform after conversion to glTF's UV origin.
          texture.offset.set(0, 1 - tile);
        } else {
          texture.repeat.copy(original.repeat);
          texture.offset.copy(original.offset);
        }
      }
    }
  }

  async function load(tuning: StoneTuning, compact: boolean): Promise<Maps> {
    if (tuning.id === "authored") throw new Error("Cannot fetch the authored Blender material.");
    const paths = stonePaths(tuning.id, compact);
    const files = [paths.color, paths.normal, paths.roughness];
    // TextureLoader works with the project's same-origin Next.js static assets.
    // Use allSettled so a failed asset does not leak earlier successful loads.
    const results = await Promise.allSettled(files.map((url) => loader.loadAsync(url)));
    const ready: Texture[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") ready.push(result.value);
    }
    if (results.some((item) => item.status === "rejected")) {
      ready.forEach((texture) => texture.dispose());
      throw new Error("This stone texture could not be loaded; the prior material was retained.");
    }
    const [color, normal, roughness] = ready;
    color.colorSpace = SRGBColorSpace;
    normal.colorSpace = NoColorSpace;
    roughness.colorSpace = NoColorSpace;
    for (const texture of ready) {
      // GLTFLoader uses flipY=false. TextureLoader defaults true; use the same
      // glTF UV orientation or material alignment will visibly change.
      texture.flipY = false;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
    return { color, normal, roughness };
  }

  async function select(tuning: StoneTuning): Promise<boolean> {
    if (disposed) return false;
    const request = ++revision;
    const compact = matchMedia(HERO_COMPACT_QUERY).matches;
    if (tuning.id === "authored" || tuning.id === embeddedId) {
      applyTextureMaps(null, tuning);
      if (active) destroy(active.maps);
      active = null;
      return true;
    }
    if (active?.id === tuning.id && active.compact === compact) {
      applyTextureMaps(active.maps, tuning);
      return true;
    }
    // Load the requested set before touching the displayed material.
    // Rapid selections or unmount make the old request stale (last wins).
    const next = await load(tuning, compact).catch((error: unknown) => {
      // A stale failed download must not roll back the newer selection's GUI.
      if (disposed || request !== revision) return null;
      throw error;
    });
    if (!next) return false;
    if (disposed || request !== revision) {
      destroy(next);
      return false;
    }
    const old = active;
    applyTextureMaps(next, tuning);
    active = { id: tuning.id, compact, maps: next };
    if (old) destroy(old.maps);
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    revision++;
    // Restore authored maps before the parent GLTF renderer disposes all its
    // original material/bitmap resources. Our new maps are ours to dispose.
    for (const original of originals) {
      const { material } = original;
      material.map = original.map;
      material.normalMap = original.normalMap;
      material.roughnessMap = original.roughnessMap;
      material.normalScale.set(original.normalX, original.normalY);
      material.needsUpdate = true;
    }
    if (active) destroy(active.maps);
    active = null;
    for (const [texture, transform] of originalTransforms) {
      texture.repeat.copy(transform.repeat);
      texture.offset.copy(transform.offset);
    }
  }

  return { select, dispose };
}
