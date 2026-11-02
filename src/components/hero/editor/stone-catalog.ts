/** Explicit local CC0 catalog: presets cannot request arbitrary external URLs. */
export const STONE_MATERIALS = {
  authored: "Original scene stone (unedited)",
  seaside_rock: "Seaside Rock · natural fine stone",
  dark_rock: "Dark Rock · fractured charcoal",
  dark_rock_02: "Dark Rock 02 · layered stone",
  granular_concrete: "Granular Concrete · fine aggregate",
} as const;

import type { StoneMaterialId } from "@/components/hero/_types/stone-catalog";
export type { StoneMaterialId } from "@/components/hero/_types/stone-catalog";
export const STONE_IDS = Object.keys(STONE_MATERIALS) as StoneMaterialId[];

export function isStoneId(value: unknown): value is StoneMaterialId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STONE_MATERIALS, value);
}

/** All selectable browser textures are self-hosted, never fetched from Poly Haven at runtime. */
export function stonePaths(id: Exclude<StoneMaterialId, "authored">, compact: boolean) {
  const root = `/brand/stone-materials/${id}/`;
  return {
    color: `${root}color-${compact ? 1024 : 2048}.webp`,
    normal: `${root}normal-1024.webp`,
    roughness: `${root}roughness-1024.webp`,
  };
}
