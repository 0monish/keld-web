import Link from "next/link";

import { CinematicHero } from "@/components/hero/cinematic-hero";

export const metadata = {
  robots: { index: false, follow: false },
  title: "KELD — lighting study",
};

export default function PhysicalPage() {
  return (
    <main className="motion-page">
      <Link className="button-text" href="/">
        ← Back to KELD
      </Link>
      <h1>Lighting study.</h1>
      <p className="motion-description">
        Explore the live scene with geometry-driven window shadows and metallic reflections. Drag to
        change the camera; lighting and materials update as you edit.
      </p>
      <div className="motion-frame">
        <CinematicHero editor />
      </div>
    </main>
  );
}
