import Link from "next/link";
import { notFound } from "next/navigation";

import { CinematicHero } from "@/components/hero/cinematic-hero";

export const metadata = {
  title: "KELD — Live scene controls",
  robots: { index: false, follow: false },
};

export default function MotionControls() {
  // The lab is a development tool, not a public-facing product route.
  // eslint-disable-next-line no-restricted-properties -- Next.js defines NODE_ENV at build time.
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="motion-page">
      <Link className="button-text" href="/">
        ← Back to KELD
      </Link>
      <p className="eyebrow">CONTROLLED VELOCITY / SCENE LAB</p>
      <h1>
        Shape the light.
        <br />
        <span>Keep the intent.</span>
      </h1>
      <p className="motion-description">
        Adjust the live scene: lighting, camera, metallic finishes and atmosphere. Window shadows
        follow the actual geometry. Drag to orbit. Export your exact setup as a reusable JSON
        preset. Original Blender assets remain unchanged.
      </p>
      <div className="motion-frame">
        <CinematicHero controls />
      </div>
      <p className="motion-note">
        Live scene lab · edit without reload · reset to XL PBR · download/import presets. The live
        3D scene loads automatically. Hide the controls to see the scene unobstructed; lighting and
        camera changes remain live.
      </p>
    </main>
  );
}
