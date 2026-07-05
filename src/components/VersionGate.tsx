"use client";

import { useEffect } from "react";

// The commit SHA baked into THIS JS bundle at build time (next.config env).
const BOOT = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
// Remember the version we last reloaded toward, so a stuck deploy never loops.
const TARGET_KEY = "shift_version_target";

/**
 * Self-heal for stale tabs (a Shift-family standard): polls /api/version (the live
 * deploy's commit SHA) and, if it no longer matches the SHA baked into the running
 * bundle, reloads the page to pick up the latest build. Keeps a long-lived tab — or
 * a demo left open across deploys — from ever running old code.
 *
 * Never interrupts an active demo tour, and won't loop if a reload fails to land
 * the newer build.
 */
export default function VersionGate() {
  useEffect(() => {
    if (BOOT === "dev") return; // local/dev — nothing deployed to compare against

    let stopped = false;

    const inDemo = () => {
      try {
        return document.documentElement.classList.contains("demo-mode")
          || /[?&]demo=/.test(window.location.search);
      } catch { return false; }
    };

    const check = async () => {
      if (stopped || inDemo()) return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { v } = (await r.json()) as { v?: string };
        if (!v || v === "dev" || v === BOOT) return;
        // A newer build is live but this tab is on old JS.
        let target: string | null = null;
        try { target = sessionStorage.getItem(TARGET_KEY); } catch { /* ignore */ }
        if (target === v) return; // already tried reloading to this build — avoid a loop
        try { sessionStorage.setItem(TARGET_KEY, v); } catch { /* ignore */ }
        window.location.reload();
      } catch { /* offline / transient — ignore */ }
    };

    const iv = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", () => void check());
    const t = setTimeout(() => void check(), 4_000);

    return () => {
      stopped = true;
      clearInterval(iv);
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
