"use client";

import { useRef, useState } from "react";

export default function MusicUpload() {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "up" | "ok" | "err">("idle");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("up");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/theme-music", { method: "POST", body: fd });
    setState(res.ok ? "ok" : "err");
    if (res.ok) setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <input ref={ref} type="file" accept="audio/*" hidden onChange={onFile} />
      <button
        onClick={() => ref.current?.click()}
        title="ارفع نغمة الخلفية"
        aria-label="نغمة الخلفية"
        className="grid place-items-center size-9 rounded-full bg-surface-2 text-ink border border-line hover:brightness-105 transition"
      >
        <span className="text-base leading-none">
          {state === "up" ? "…" : state === "ok" ? "✓" : state === "err" ? "!" : "🎼"}
        </span>
      </button>
    </>
  );
}
