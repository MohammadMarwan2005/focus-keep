"use client";

import { useSound } from "@/components/SoundManager";

export default function SoundToggle() {
  const { muted, toggleMute } = useSound();
  return (
    <button
      onClick={toggleMute}
      title={muted ? "تشغيل الصوت" : "كتم الصوت"}
      aria-label="تبديل الصوت"
      className="grid place-items-center size-9 rounded-full bg-surface-2 text-ink border border-line hover:brightness-105 transition"
    >
      <span className="text-lg leading-none">{muted ? "🔇" : "🎵"}</span>
    </button>
  );
}
