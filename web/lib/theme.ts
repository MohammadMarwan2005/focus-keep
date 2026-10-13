"use client";

const KEY = "yawmi_theme";

export function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function applyDark(v: boolean): void {
  document.documentElement.classList.toggle("dark", v);
  try {
    localStorage.setItem(KEY, v ? "dark" : "light");
  } catch {}
}

export function toggleDark(): boolean {
  const next = !isDark();
  applyDark(next);
  return next;
}
