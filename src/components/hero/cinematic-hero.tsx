"use client";

import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import type { ScenePreset } from "@/components/hero/editor/scene-preset";
import { sceneDraftKey } from "@/components/hero/scene-assets";
import type { SceneController } from "@/components/hero/scene-runtime";

const SceneInspector = dynamic(
  () => import("@/components/hero/editor/scene-inspector").then((module) => module.SceneInspector),
  { ssr: false },
);

/** The hero is always the live scene. Controls never replace or unmount it. */
export function CinematicHero({
  controls = false,
  editor = false,
}: {
  controls?: boolean;
  editor?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const syncInspector = useRef<((preset: ScenePreset) => void) | null>(null);
  const [controller, setController] = useState<SceneController | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const abort = new AbortController();
    let runtime: SceneController | undefined;
    let intersecting = true;
    const visible = () => intersecting && document.visibilityState === "visible";
    const syncVisibility = () => runtime?.setVisible(visible());
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries)
        if (entry.target === element) intersecting = entry.isIntersecting;
      syncVisibility();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", syncVisibility);
    // Background tabs can suspend resource initialization; allow a visible retry.
    const timeout = setInterval(() => {
      if (document.visibilityState === "visible") abort.abort("scene-load-timeout");
    }, 120000);
    const fail = () => {
      if (abort.signal.reason === "component-unmounted") return;
      setFailed(true);
      setController(null);
      runtime?.dispose();
    };
    void (async () => {
      try {
        const { createScene } = await import("@/components/hero/scene-runtime");
        abort.signal.throwIfAborted();
        runtime = await createScene(element, {
          signal: abort.signal,
          editor: true,
          onFailure: fail,
          onPlaying: () => undefined,
          restoreTuning: (defaults) => {
            try {
              const saved = localStorage.getItem(sceneDraftKey(defaults.asset));
              return saved && saved.length < 120_000 ? JSON.parse(saved) : null;
            } catch {
              return null;
            }
          },
          onTuningChange: (preset) => syncInspector.current?.(preset),
        });
        abort.signal.throwIfAborted();
        clearInterval(timeout);
        runtime.setVisible(visible());
        setController(runtime);
      } catch (error) {
        clearInterval(timeout);
        runtime?.dispose();
        fail();
        if (abort.signal.reason !== "component-unmounted")
          console.warn("KELD live 3D scene could not start.", error);
      }
    })();
    return () => {
      abort.abort("component-unmounted");
      clearInterval(timeout);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      runtime?.dispose();
    };
  }, [attempt]);

  return (
    <div
      className="cinematic-stage"
      data-scene-state={failed ? "error" : controller ? "live" : "loading"}
    >
      <div
        className="scene-viewport"
        data-ready={!!controller && !failed}
        ref={host}
        role="img"
        aria-label="Live 3D KELD sculpture with physical lighting, reflections and shadows."
      />
      {!controller && (
        <div className="scene-launcher">
          <span role="status">
            {failed
              ? "The live 3D scene could not load on this device."
              : "Rendering live 3D scene…"}
          </span>
          {failed && (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry 3D
            </button>
          )}
        </div>
      )}
      <noscript>
        <p className="scene-launcher">Enable JavaScript to view the live 3D scene.</p>
      </noscript>
      {(editor || controls) && controller && !failed && (
        <SceneInspector controller={controller} initiallyOpen={controls} syncRef={syncInspector} />
      )}
    </div>
  );
}
