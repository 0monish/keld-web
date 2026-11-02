import type { StoneTuning } from "@/components/hero/_types/scene-preset";

export type StoneTextures = {
  dispose(): void;
  select(tuning: StoneTuning): Promise<boolean>;
};
