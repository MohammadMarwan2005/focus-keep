"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
};

type Coords = { left: number; top: number; maxH: number };

/**
 * A small dropdown menu. The panel is rendered in a fixed-position portal on
 * <body> so it can never be clipped by a scroll container (N1), and it is
 * shifted/flipped to always stay inside the viewport (N2). Closes on
 * outside-click / Escape / scroll / pick (N5).
 */
export default function Menu({
  items,
  children,
  triggerClassName,
  triggerLabel,
  align = "end",
  stopPointer = false,
}: {
  items: MenuItem[];
  children: React.ReactNode; // trigger contents (an icon)
  triggerClassName?: string;
  triggerLabel: string;
  align?: "start" | "end";
  stopPointer?: boolean; // stop pointerdown so it doesn't start a drag
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the panel from the trigger's rect, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const M = 8; // viewport margin
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    // horizontal: "end" anchors the panel's right edge to the trigger's right
    // edge (opens leftwards, correct for RTL); "start" anchors the left edge.
    let left = align === "end" ? r.right - mw : r.left;
    left = Math.max(M, Math.min(left, vw - M - mw));

    // vertical: below the trigger, or above if it doesn't fit.
    const below = r.bottom + 4;
    const spaceBelow = vh - M - below;
    let top: number;
    let maxH: number;
    if (mh <= spaceBelow || spaceBelow >= vh / 2) {
      top = below;
      maxH = spaceBelow;
    } else {
      const spaceAbove = r.top - 4 - M;
      top = Math.max(M, r.top - 4 - Math.min(mh, spaceAbove));
      maxH = spaceAbove;
    }
    setCoords({ left, top, maxH: Math.max(120, maxH) });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={stopPointer ? (e) => e.stopPropagation() : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={triggerClassName}
      >
        {children}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              left: coords ? coords.left : -9999,
              top: coords ? coords.top : -9999,
              maxHeight: coords ? coords.maxH : undefined,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[80] min-w-44 overflow-y-auto rounded-xl border border-line bg-surface shadow-pop p-1"
          >
            {items.map((it, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 min-h-11 text-sm text-start transition ${
                  it.danger ? "text-q-do-ink hover:bg-q-do-bg" : "text-ink hover:bg-surface-2"
                }`}
              >
                {it.icon && <span className="shrink-0 grid place-items-center">{it.icon}</span>}
                <span className="flex-1 min-w-0">{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
