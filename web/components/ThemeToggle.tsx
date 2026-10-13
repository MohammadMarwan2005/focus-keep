"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { isDark, toggleDark } from "@/lib/theme";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(isDark());
  }, []);

  return (
    <button
      onClick={() => setDark(toggleDark())}
      title={dark ? "الوضع النهاري" : "الوضع الليلي"}
      aria-label="تبديل الوضع"
      aria-pressed={dark}
      className="tap-target grid place-items-center size-9 rounded-full bg-surface-2 text-ink border border-line hover:border-accent transition"
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
