"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BidiContent, Dir, LineDirs } from "@/lib/habits/bidi";

/* --------------------------------------------------------------------------
 * A small plain-text field with the notepad's per-line direction model: each
 * line is its own <div dir="auto"> (aligns by its first strong character), and
 * Ctrl + Shift (right / left) forces the current line(s) RTL / LTR. Stored as
 * text + line_dirs, exactly like ideas.note / ideas.line_dirs.
 * Uncontrolled: the DOM is the truth; `resetKey` re-renders from `value`.
 * ------------------------------------------------------------------------ */

function render(el: HTMLElement, c: BidiContent) {
  el.innerHTML = "";
  const lines = c.text.length ? c.text.split("\n") : [""];
  lines.forEach((line, i) => {
    const div = document.createElement("div");
    const forced = c.lineDirs[String(i)];
    div.setAttribute("dir", forced || "auto");
    if (forced) div.setAttribute("data-forced", forced);
    if (line) div.textContent = line;
    else div.appendChild(document.createElement("br"));
    el.appendChild(div);
  });
}

function read(el: HTMLElement): BidiContent {
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length === 0) return { text: el.textContent ?? "", lineDirs: {} };
  const lines: string[] = [];
  const lineDirs: LineDirs = {};
  kids.forEach((div, i) => {
    lines.push(div.textContent ?? "");
    const f = div.getAttribute("data-forced");
    if (f === "ltr" || f === "rtl") lineDirs[String(i)] = f;
  });
  return { text: lines.join("\n"), lineDirs };
}

function normalize(el: HTMLElement) {
  Array.from(el.childNodes).forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE || n.nodeName === "BR") {
      const d = document.createElement("div");
      el.insertBefore(d, n);
      d.appendChild(n);
    }
  });
  if (el.childElementCount === 0) {
    const d = document.createElement("div");
    d.appendChild(document.createElement("br"));
    el.appendChild(d);
  }
  Array.from(el.children).forEach((child) => {
    const c = child as HTMLElement;
    c.setAttribute("dir", c.getAttribute("data-forced") || "auto");
    if (c.childNodes.length === 0) c.appendChild(document.createElement("br"));
  });
}

function lineOf(node: Node | null, el: HTMLElement): HTMLElement | null {
  if (!node || node === el) return null;
  let n: Node | null = node;
  while (n && n.parentNode && n.parentNode !== el) n = n.parentNode;
  return n && n.parentNode === el ? (n as HTMLElement) : null;
}

export default function BidiField({
  value,
  resetKey,
  onChange,
  onCommit,
  onEnter,
  singleLine = false,
  placeholder,
  ariaLabel,
  autoFocus,
  className = "",
}: {
  value: BidiContent;
  resetKey?: string | number;
  onChange?: (c: BidiContent) => void;
  /** fires on blur (and Enter in singleLine mode) */
  onCommit?: (c: BidiContent) => void;
  onEnter?: (c: BidiContent) => void;
  singleLine?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const syncEmpty = useCallback(() => {
    const el = ref.current;
    if (el) el.dataset.empty = (el.textContent ?? "").length === 0 ? "true" : "false";
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    render(el, valueRef.current);
    syncEmpty();
    if (autoFocus) el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    normalize(el);
    syncEmpty();
    onChange?.(read(el));
  }, [onChange, syncEmpty]);

  const applyDir = useCallback((mode: Dir) => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const kids = Array.from(el.children) as HTMLElement[];
    const start = lineOf(range.startContainer, el) ?? kids[0];
    const end = lineOf(range.endContainer, el) ?? start;
    let i0 = Math.max(0, kids.indexOf(start));
    let i1 = Math.max(i0, kids.indexOf(end));
    if (i0 > i1) [i0, i1] = [i1, i0];
    for (let i = i0; i <= i1; i++) {
      const d = kids[i];
      // pressing the same direction again returns the line to auto
      if (d.getAttribute("data-forced") === mode) {
        d.removeAttribute("data-forced");
        d.setAttribute("dir", "auto");
      } else {
        d.setAttribute("data-forced", mode);
        d.setAttribute("dir", mode);
      }
    }
    emit();
  }, [emit]);

  const insertPlain = useCallback((text: string) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const clean = singleLine ? text.replace(/\s*[\r\n]+\s*/g, " ") : text.replace(/\r\n?/g, "\n");
    // execCommand keeps the browser's undo stack; the line structure is fixed by normalize()
    if (!document.execCommand("insertText", false, clean)) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(document.createTextNode(clean));
      r.collapse(false);
    }
  }, [singleLine]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline={!singleLine}
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      dir="auto"
      onInput={emit}
      onKeyDown={(e) => {
        if (e.ctrlKey && (e.code === "ShiftLeft" || e.code === "ShiftRight")) {
          e.preventDefault();
          applyDir(e.code === "ShiftRight" ? "rtl" : "ltr");
          return;
        }
        if (e.key === "Enter" && (singleLine || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const el = ref.current;
          if (el) onEnter?.(read(el));
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        insertPlain(e.clipboardData.getData("text/plain"));
        emit();
      }}
      onBlur={() => {
        const el = ref.current;
        if (el) onCommit?.(read(el));
      }}
      className={`bidi-field relative outline-none whitespace-pre-wrap break-words ${className}`}
    />
  );
}

/** Read-only rendering of text + line_dirs with the same per-line direction. */
export function BidiText({ text, lineDirs, className = "" }: { text: string; lineDirs: LineDirs; className?: string }) {
  const lines = text.split("\n");
  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {lines.map((l, i) => (
        <div key={i} dir={lineDirs[String(i)] || "auto"}>{l || <br />}</div>
      ))}
    </div>
  );
}
