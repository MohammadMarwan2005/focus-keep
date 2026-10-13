import { iconUrl } from "@/lib/habits/files";
import type { IconFields } from "@/lib/habits/dto";

/**
 * A habit's icon on its colored circle. SVGs are drawn as a CSS mask filled
 * with fg_color, so any monochrome SVG can be recolored and its markup is
 * never inserted into the DOM.
 */
export default function HabitIcon({ icon, size = 32, className = "" }: { icon: IconFields; size?: number; className?: string }) {
  const bg = icon.bg_color || "var(--surface-2)";
  const url = icon.icon_type === "emoji" ? null : iconUrl(icon.image_path);
  const box = { width: size, height: size, background: bg } as const;
  const cls = `shrink-0 rounded-full grid place-items-center overflow-hidden border border-line ${className}`;

  if (icon.icon_type === "svg" && url) {
    const mask = `url("${url}")`;
    return (
      <span className={cls} style={box} aria-hidden>
        <span
          style={{
            width: "62%",
            height: "62%",
            backgroundColor: icon.fg_color || "var(--ink)",
            maskImage: mask,
            WebkitMaskImage: mask,
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
          }}
        />
      </span>
    );
  }

  if (icon.icon_type === "image" && url) {
    return (
      <span className={cls} style={box} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-[78%] h-[78%] object-contain" draggable={false} />
      </span>
    );
  }

  return (
    <span className={cls} style={{ ...box, fontSize: Math.round(size * 0.55) }} aria-hidden>
      <span className="leading-none">{icon.emoji || "⭐"}</span>
    </span>
  );
}
