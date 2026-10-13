"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Music, Loader2, Check, AlertTriangle } from "lucide-react";
import { useSound } from "@/components/SoundManager";
import { useToast } from "@/components/Toast";

/** Popover combining the mute toggle and the background-tone upload. */
export default function SoundMenu() {
  const { muted, toggleMute } = useSound();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const wrap = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUp("busy");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/theme-music", { method: "POST", body: fd });
    if (res.ok) {
      setUp("ok");
      toast.show("تم رفع نغمة الخلفية");
      setTimeout(() => setUp("idle"), 2000);
    } else {
      setUp("err");
      toast.show("تعذّر رفع النغمة");
      setTimeout(() => setUp("idle"), 2500);
    }
    e.target.value = "";
  }

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="إعدادات الصوت"
        title="إعدادات الصوت"
        className="tap-target grid place-items-center size-9 rounded-full bg-surface-2 text-ink border border-line hover:border-accent transition"
      >
        {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
      </button>

      {open && (
        <div role="menu" className="absolute z-[60] end-0 mt-1 w-56 rounded-xl border border-line bg-surface shadow-pop p-1">
          <button
            role="menuitemcheckbox"
            aria-checked={!muted}
            onClick={toggleMute}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-start text-ink hover:bg-surface-2 transition"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <span className="flex-1">{muted ? "تشغيل الصوت" : "كتم الصوت"}</span>
          </button>
          <button
            role="menuitem"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-start text-ink hover:bg-surface-2 transition"
          >
            {up === "busy" ? <Loader2 size={16} className="animate-spin" /> : up === "ok" ? <Check size={16} /> : up === "err" ? <AlertTriangle size={16} /> : <Music size={16} />}
            <span className="flex-1">رفع نغمة الخلفية</span>
          </button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onFile} />
        </div>
      )}
    </div>
  );
}
