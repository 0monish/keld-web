import type { ScenePreset, Vec3 } from "@/components/hero/_types/scene-preset";

export type SceneTuner = {
  apply(input: unknown): Promise<boolean>;
  dispose(): void;
  get(): ScenePreset;
  getDefaults(): ScenePreset;
  syncOrbit(position: Vec3, target: Vec3): void;
};
