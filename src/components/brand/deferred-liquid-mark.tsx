"use client";

import { useEffect, useRef, useState } from "react";

import Image from "next/image";

import type { LiquidMetal as LiquidMetalComponent } from "@paper-design/shaders-react";

type LiquidMetalRenderer = typeof LiquidMetalComponent;

/**
 * Shared deferred brand mark adapted from CRAZY COLLECTION's GYLDLAB.tsx.
 *
 * The large shader package is NOT imported until the footer approaches the
 * viewport. A real SVG stays available on first paint and whenever the
 * user requests reduced motion or data saving. Crucially, the SVG and
 * liquid-metal canvas must not render simultaneously: the white source glyph
 * underneath the metallic shader creates an unintended bright outer outline.
 * The shader unmounts when the footer leaves the viewport.
 */
export function DeferredLiquidMark({ src }: { src: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [LiquidMetal, setLiquidMetal] = useState<LiquidMetalRenderer | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Do not put a continuous GPU shader on reduced-motion / data-saver users.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean };
      }
    ).connection;
    if (reducedMotion.matches || connection?.saveData) return;
    if (typeof IntersectionObserver === "undefined") return;

    let cancelled = false;
    let loading = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const inRange = Boolean(entry?.isIntersecting);
        setVisible(inRange);
        if (!inRange || loading) return;
        loading = true;

        void import("@paper-design/shaders-react")
          .then((module) => {
            if (!cancelled) setLiquidMetal(() => module.LiquidMetal);
          })
          .catch(() => {
            // The original SVG is a complete static fallback.
          });
      },
      { rootMargin: "240px" },
    );

    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  return (
    <span ref={hostRef} className="relative block h-full w-full">
      {LiquidMetal && visible ? (
        <span className="pointer-events-none block h-full w-full" aria-hidden="true">
          <LiquidMetal
            image={src}
            style={{ width: "100%", height: "100%" }}
            shape="diamond"
            colorBack="rgba(0,0,0,0)"
            colorTint="#ffffff"
            distortion={0.08}
            repetition={1.8}
            shiftRed={0.22}
            shiftBlue={0.22}
            contour={0.45}
            softness={0.12}
            angle={280}
            speed={0.95}
            scale={0.9}
          />
        </span>
      ) : (
        <Image
          alt=""
          aria-hidden="true"
          className="object-contain"
          fill
          loading="lazy"
          sizes="(max-width: 640px) 72px, 128px"
          src={src}
          unoptimized
        />
      )}
    </span>
  );
}
