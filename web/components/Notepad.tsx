"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, NotebookPen, Save, Trash2, Plus, X, Lightbulb, ChevronDown, Archive } from "lucide-react";
import type { NoteRow } from "@/lib/data";
import { createNote, updateIdea, updateTask, deleteIdea, restoreIdea, archiveIdea, unarchiveIdea } from "@/lib/actions";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

/* --------------------------------------------------------------------------
 * Notepad: tabbed plain-text editor. Each line is its own <div> so it carries
 * its own direction — dir="auto" aligns by first character; Ctrl+Left/Right
 * Shift (or the toolbar) forces a line LTR/RTL. Notes are ideas; a tab opened
 * from a task (?task=) saves back to that task instead.
 * ------------------------------------------------------------------------ */

type Dir = "ltr" | "rtl";
type LineDirs = Record<string, Dir>;
type Content = { text: string; lineDirs: LineDirs };
type Kind = "idea" | "task";
type Tab = { key: string; id: number | null; kind: Kind; title: string; content: Content; dirty: boolean };

const UNTITLED = "بدون عنوان";
const AUTOSAVE_MS = 700;
const newKey = () => Math.random().toString(36).slice(2, 10);

function parseDirs(json: string | null): LineDirs {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    const out: LineDirs = {};
    for (const k of Object.keys(o)) if (o[k] === "ltr" || o[k] === "rtl") out[k] = o[k];
    return out;
  } catch {
    return {};
  }
}
const serializeDirs = (m: LineDirs): string | null => (Object.keys(m).length ? JSON.stringify(m) : null);
const contentOf = (n: NoteRow): Content => ({ text: n.note ?? "", lineDirs: parseDirs(n.line_dirs) });

/* ---- DOM <-> content helpers (editor is uncontrolled; DOM is truth) ---- */
function renderContent(el: HTMLElement, c: Content) {
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
function readContent(el: HTMLElement): Content {
  const lines: string[] = [];
  const lineDirs: LineDirs = {};
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length === 0) return { text: el.textContent ?? "", lineDirs: {} };
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
    const forced = c.getAttribute("data-forced");
    c.setAttribute("dir", forced || "auto");
    if (c.childNodes.length === 0) c.appendChild(document.createElement("br"));
  });
}
function lineDivOf(node: Node | null, el: HTMLElement): HTMLElement | null {
  if (!node || node === el) return null;
  let n: Node | null = node;
  while (n && n.parentNode && n.parentNode !== el) n = n.parentNode;
  return n && n.parentNode === el ? (n as HTMLElement) : null;
}

export default function Notepad({
  name,
  initialNotes,
  openId,
  initialTask,
  uid,
}: {
  name: string;
  initialNotes: NoteRow[];
  openId: number | null;
  initialTask: NoteRow | null;
  uid: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const STORE_KEY = `yawmi_np_${uid}`;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tabs, setTabs] = useState<Tab[]>(() => {
    const target = openId != null ? initialNotes.find((n) => n.id === openId) : undefined;
    if (initialTask) return [{ key: newKey(), id: initialTask.id, kind: "task", title: initialTask.title, content: contentOf(initialTask), dirty: false }];
    if (target) return [{ key: newKey(), id: target.id, kind: "idea", title: target.title, content: contentOf(target), dirty: false }];
    return [{ key: newKey(), id: null, kind: "idea", title: "", content: { text: "", lineDirs: {} }, dirty: false }];
  });
  const [activeKey, setActiveKey] = useState("");
  const [notes, setNotes] = useState<NoteRow[]>(initialNotes);
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [titleErr, setTitleErr] = useState("");
  const [curDir, setCurDir] = useState<"auto" | Dir>("auto");
  const [listOpen, setListOpen] = useState(false);
  const [confirmCloseKey, setConfirmCloseKey] = useState<string | null>(null);

  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeKey);
  tabsRef.current = tabs;
  activeRef.current = activeKey;

  const findTab = useCallback((key: string) => tabsRef.current.find((t) => t.key === key), []);

  useEffect(() => {
    if (!activeKey && tabs.length) setActiveKey(tabs[0].key);
  }, [activeKey, tabs]);

  /* ------------------------- restore from storage ------------------------ */
  useEffect(() => {
    let restored: Tab[] = [];
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs: Tab[]; activeKey: string };
        const byId = new Map(initialNotes.map((n) => [n.id, n]));
        restored = (parsed.tabs || [])
          .map((t) => {
            if (t.kind === "task") return null; // task tabs aren't reconcilable across reloads
            if (t.id != null) {
              const n = byId.get(t.id);
              if (!n) return null;
              return { ...t, kind: "idea" as const, title: n.title, content: contentOf(n), dirty: false };
            }
            return { ...t, kind: "idea" as const };
          })
          .filter(Boolean) as Tab[];
      }
    } catch {}

    let nextActive = "";
    const target = openId != null ? initialNotes.find((n) => n.id === openId) : undefined;
    if (initialTask) {
      const tab: Tab = { key: newKey(), id: initialTask.id, kind: "task", title: initialTask.title, content: contentOf(initialTask), dirty: false };
      restored.push(tab);
      nextActive = tab.key;
    } else if (target) {
      const existing = restored.find((t) => t.id === target.id && t.kind === "idea");
      if (existing) nextActive = existing.key;
      else {
        const tab: Tab = { key: newKey(), id: target.id, kind: "idea", title: target.title, content: contentOf(target), dirty: false };
        restored.push(tab);
        nextActive = tab.key;
      }
    }

    if (restored.length) {
      setTabs(restored);
      setActiveKey(nextActive || restored[0].key);
    }
    if (openId != null || initialTask) router.replace("/notepad", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------- render active tab into editor -------------------- */
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !activeKey) return;
    const tab = findTab(activeKey);
    renderContent(el, tab ? tab.content : { text: "", lineDirs: {} });
    el.focus();
    const sel = window.getSelection();
    if (sel && el.lastChild) {
      const r = document.createRange();
      r.selectNodeContents(el.lastChild);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return () => {
      const c = readContent(el);
      setTabs((prev) => prev.map((t) => (t.key === activeKey ? { ...t, content: c } : t)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ tabs, activeKey }));
    } catch {}
  }, [tabs, activeKey, STORE_KEY]);

  // flush the active tab on unmount / tab-hide
  useEffect(() => {
    const flush = () => {
      const el = editorRef.current;
      if (!el) return;
      const tab = tabsRef.current.find((t) => t.key === activeRef.current);
      if (!tab || tab.id == null) return;
      const c = readContent(el);
      if (tab.kind === "task") void updateTask(tab.id, { note: c.text, line_dirs: serializeDirs(c.lineDirs) });
      else void updateIdea(tab.id, { note: c.text, line_dirs: serializeDirs(c.lineDirs) });
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
    };
  }, []);

  const markDirty = useCallback((key: string) => {
    setTabs((prev) => prev.map((t) => (t.key === key && !t.dirty ? { ...t, dirty: true } : t)));
  }, []);

  const persist = useCallback(async () => {
    const el = editorRef.current;
    if (!el) return;
    const key = activeRef.current;
    const tab = tabsRef.current.find((t) => t.key === key);
    if (!tab) return;
    const c = readContent(el);
    setTabs((prev) => prev.map((t) => (t.key === key ? { ...t, content: c, dirty: t.id == null ? t.dirty : false } : t)));
    if (tab.id != null) {
      if (tab.kind === "task") await updateTask(tab.id, { note: c.text, line_dirs: serializeDirs(c.lineDirs) });
      else await updateIdea(tab.id, { note: c.text, line_dirs: serializeDirs(c.lineDirs) });
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
  }, [persist]);

  /* --------------------------- direction control ------------------------- */
  const applyDir = useCallback(
    (mode: "auto" | Dir) => {
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const kids = Array.from(el.children) as HTMLElement[];
      const start = lineDivOf(range.startContainer, el) ?? kids[0];
      const end = lineDivOf(range.endContainer, el) ?? start;
      let i0 = kids.indexOf(start);
      let i1 = kids.indexOf(end);
      if (i0 < 0) i0 = 0;
      if (i1 < 0) i1 = i0;
      if (i0 > i1) [i0, i1] = [i1, i0];
      for (let i = i0; i <= i1; i++) {
        const d = kids[i];
        if (mode === "auto") {
          d.removeAttribute("data-forced");
          d.setAttribute("dir", "auto");
        } else {
          d.setAttribute("data-forced", mode);
          d.setAttribute("dir", mode);
        }
      }
      setCurDir(mode);
      markDirty(activeRef.current);
      scheduleSave();
    },
    [markDirty, scheduleSave],
  );

  useEffect(() => {
    const onSel = () => {
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
      const line = lineDivOf(sel.anchorNode, el);
      const f = line?.getAttribute("data-forced");
      setCurDir(f === "ltr" || f === "rtl" ? f : "auto");
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  /* ------------------------------ editing -------------------------------- */
  const insertLineBreak = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();
    const line = lineDivOf(range.startContainer, el) ?? (el.children[0] as HTMLElement | undefined);
    if (!line) return;
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(line, line.childNodes.length);
    const frag = tail.extractContents();
    const div = document.createElement("div");
    div.setAttribute("dir", "auto");
    if (frag.textContent && frag.textContent.length) div.appendChild(frag);
    else div.appendChild(document.createElement("br"));
    if (!line.textContent) {
      line.innerHTML = "";
      line.appendChild(document.createElement("br"));
    }
    line.after(div);
    const r = document.createRange();
    r.setStart(div, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }, []);

  const insertText = useCallback(
    (text: string) => {
      const parts = text.replace(/\r\n?/g, "\n").split("\n");
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      parts.forEach((part, i) => {
        if (i > 0) insertLineBreak();
        if (part) {
          const r = sel.getRangeAt(0);
          const node = document.createTextNode(part);
          r.insertNode(node);
          r.setStartAfter(node);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      });
    },
    [insertLineBreak],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.ctrlKey && (e.code === "ShiftLeft" || e.code === "ShiftRight")) {
        e.preventDefault();
        applyDir(e.code === "ShiftRight" ? "rtl" : "ltr");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveActive();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertLineBreak();
        normalize(editorRef.current!);
        markDirty(activeRef.current);
        scheduleSave();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyDir, insertLineBreak, markDirty, scheduleSave],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      insertText(e.clipboardData.getData("text/plain"));
      normalize(editorRef.current!);
      markDirty(activeRef.current);
      scheduleSave();
    },
    [insertText, markDirty, scheduleSave],
  );

  const onInput = useCallback(() => {
    normalize(editorRef.current!);
    markDirty(activeRef.current);
    scheduleSave();
  }, [markDirty, scheduleSave]);

  /* ------------------------------- tabs ---------------------------------- */
  const switchTo = useCallback((key: string) => {
    if (key !== activeRef.current) setActiveKey(key);
  }, []);

  const openNote = useCallback(
    (n: NoteRow) => {
      setListOpen(false);
      const existing = tabsRef.current.find((t) => t.id === n.id && t.kind === "idea");
      if (existing) return switchTo(existing.key);
      const tab: Tab = { key: newKey(), id: n.id, kind: "idea", title: n.title, content: contentOf(n), dirty: false };
      setTabs((prev) => [...prev, tab]);
      setActiveKey(tab.key);
    },
    [switchTo],
  );

  const newTab = useCallback(() => {
    const tab: Tab = { key: newKey(), id: null, kind: "idea", title: "", content: { text: "", lineDirs: {} }, dirty: false };
    setTabs((prev) => [...prev, tab]);
    setActiveKey(tab.key);
  }, []);

  const doCloseTab = useCallback((key: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (key === activeRef.current) {
        const idx = prev.findIndex((t) => t.key === key);
        const neighbor = next[Math.min(idx, next.length - 1)];
        setActiveKey(neighbor ? neighbor.key : "");
      }
      return next;
    });
  }, []);

  const closeTab = useCallback(
    (key: string) => {
      const tab = tabsRef.current.find((t) => t.key === key);
      if (!tab) return;
      if (tab.id == null) {
        const el = editorRef.current;
        const text = key === activeRef.current && el ? readContent(el).text : tab.content.text;
        if (text.trim()) {
          setConfirmCloseKey(key); // unsaved draft — confirm with an in-app dialog
          return;
        }
      }
      doCloseTab(key);
    },
    [doCloseTab],
  );

  /* ------------------------------ saving --------------------------------- */
  const doCreate = useCallback(
    async (key: string, title: string, c: Content) => {
      const res = await createNote(title, c.text, serializeDirs(c.lineDirs));
      if (!res) return;
      setTabs((prev) => prev.map((t) => (t.key === key ? { ...t, id: res.id, title, content: c, dirty: false } : t)));
      setNotes((prev) => [{ id: res.id, title, note: c.text, line_dirs: serializeDirs(c.lineDirs) }, ...prev]);
      toast.show("تم الحفظ");
    },
    [toast],
  );

  const saveActive = useCallback(async () => {
    const el = editorRef.current;
    if (!el) return;
    const key = activeRef.current;
    const tab = tabsRef.current.find((t) => t.key === key);
    if (!tab) return;
    const c = readContent(el);
    if (tab.id != null) {
      setTabs((prev) => prev.map((t) => (t.key === key ? { ...t, content: c, dirty: false } : t)));
      if (tab.kind === "task") await updateTask(tab.id, { title: tab.title, note: c.text, line_dirs: serializeDirs(c.lineDirs) });
      else {
        await updateIdea(tab.id, { title: tab.title, note: c.text, line_dirs: serializeDirs(c.lineDirs) });
        setNotes((prev) => prev.map((n) => (n.id === tab.id ? { ...n, note: c.text, line_dirs: serializeDirs(c.lineDirs) } : n)));
      }
      toast.show("تم الحفظ");
      return;
    }
    const title = tab.title.trim();
    if (title) await doCreate(key, title, c);
    else {
      setTitleInput("");
      setTitleErr("");
      setAsk(true);
    }
  }, [doCreate, toast]);

  const confirmTitle = useCallback(async () => {
    const t = titleInput.trim();
    if (!t) {
      setTitleErr("اكتب عنواناً");
      return;
    }
    const el = editorRef.current;
    const key = activeRef.current;
    const c = el ? readContent(el) : tabsRef.current.find((x) => x.key === key)?.content ?? { text: "", lineDirs: {} };
    setAsk(false);
    await doCreate(key, t, c);
  }, [titleInput, doCreate]);

  const renameTab = useCallback(async (key: string, title: string) => {
    const t = title.trim();
    setEditingTab(null);
    if (!t) return;
    const tab = tabsRef.current.find((x) => x.key === key);
    if (!tab) return;
    setTabs((prev) => prev.map((x) => (x.key === key ? { ...x, title: t } : x)));
    if (tab.id != null) {
      if (tab.kind === "task") await updateTask(tab.id, { title: t });
      else {
        await updateIdea(tab.id, { title: t });
        setNotes((prev) => prev.map((n) => (n.id === tab.id ? { ...n, title: t } : n)));
      }
    }
  }, []);

  // Close a tab and, if it was the last one, leave a fresh empty tab so the
  // editor never shows orphaned text with no tab above it (N6).
  const closeToFresh = useCallback((key: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (next.length === 0) {
        const fresh: Tab = { key: newKey(), id: null, kind: "idea", title: "", content: { text: "", lineDirs: {} }, dirty: false };
        setActiveKey(fresh.key);
        return [fresh];
      }
      if (key === activeRef.current) {
        const idx = prev.findIndex((t) => t.key === key);
        const neighbor = next[Math.min(idx, next.length - 1)];
        setActiveKey(neighbor.key);
      }
      return next;
    });
  }, []);

  const deleteActive = useCallback(async () => {
    const key = activeRef.current;
    const tab = tabsRef.current.find((t) => t.key === key);
    if (!tab) return;
    if (tab.kind === "task") {
      // tasks are managed on the board — the notepad only closes the tab
      closeToFresh(key);
      return;
    }
    if (tab.id != null) {
      const id = tab.id;
      const el = editorRef.current;
      const c = el && key === activeRef.current ? readContent(el) : tab.content;
      const snap = { title: tab.title, note: c.text, line_dirs: serializeDirs(c.lineDirs), position: 0 };
      await deleteIdea(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.show("تم حذف الملاحظة", {
        action: {
          label: "تراجع",
          onClick: async () => {
            const res = await restoreIdea(snap);
            if (!res) return;
            const row: NoteRow = { id: res.id, title: snap.title, note: snap.note, line_dirs: snap.line_dirs };
            setNotes((prev) => [row, ...prev]);
            // reopen the note's tab with its text (N6)
            const reopened: Tab = { key: newKey(), id: res.id, kind: "idea", title: snap.title, content: contentOf(row), dirty: false };
            setTabs((prev) => [...prev, reopened]);
            setActiveKey(reopened.key);
          },
        },
        duration: 5000,
      });
    }
    closeToFresh(key);
  }, [closeToFresh, toast]);

  // Archive the active note: save any pending edits, hide it from the list,
  // and close its tab. Undoable — restores it back into the active notes.
  const archiveActive = useCallback(async () => {
    const key = activeRef.current;
    const tab = tabsRef.current.find((t) => t.key === key);
    if (!tab || tab.kind === "task" || tab.id == null) return;
    const id = tab.id;
    const el = editorRef.current;
    const c = el && key === activeRef.current ? readContent(el) : tab.content;
    // persist the latest text before archiving so /archived shows what you saw
    await updateIdea(id, { note: c.text, line_dirs: serializeDirs(c.lineDirs) });
    await archiveIdea(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    toast.show("تمت الأرشفة", {
      action: {
        label: "تراجع",
        onClick: async () => {
          await unarchiveIdea(id);
          const row: NoteRow = { id, title: tab.title, note: c.text, line_dirs: serializeDirs(c.lineDirs) };
          setNotes((prev) => [row, ...prev]);
          const reopened: Tab = { key: newKey(), id, kind: "idea", title: tab.title, content: contentOf(row), dirty: false };
          setTabs((prev) => [...prev, reopened]);
          setActiveKey(reopened.key);
        },
      },
      duration: 5000,
    });
    closeToFresh(key);
  }, [closeToFresh, toast]);

  const activeTab = tabs.find((t) => t.key === activeKey) ?? null;

  const dirBtn = (mode: "auto" | Dir, label: string) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => applyDir(mode)}
      className={`px-2.5 py-1 rounded-lg border text-xs transition ${
        curDir === mode ? "bg-accent/20 border-accent/50 text-ink" : "bg-surface border-line text-ink-soft hover:text-ink"
      }`}
      title={mode === "auto" ? "تلقائي حسب أول حرف" : mode === "rtl" ? "من اليمين (Ctrl + Shift الأيمن)" : "من اليسار (Ctrl + Shift الأيسر)"}
    >
      {label}
    </button>
  );

  const NoteList = ({ onPick }: { onPick: (n: NoteRow) => void }) => (
    <div className="flex flex-col gap-1">
      {notes.length === 0 && <p className="text-xs text-ink-soft/70 px-1 py-2">لا ملاحظات بعد.</p>}
      {notes.map((n) => (
        <button
          key={n.id}
          onClick={() => onPick(n)}
          className={`flex items-center gap-2 text-start truncate rounded-lg px-2.5 py-2 text-sm border transition ${
            activeTab?.kind === "idea" && activeTab?.id === n.id
              ? "bg-accent/15 border-accent/40 text-ink"
              : "bg-surface border-line text-ink hover:border-accent-2"
          }`}
          title={n.title}
        >
          <Lightbulb size={14} className="text-accent-2 shrink-0" aria-hidden />
          <span dir="auto" className="truncate">{n.title}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="sticky top-0 z-30 backdrop-blur bg-bg/80 border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <NotebookPen size={24} className="text-accent" aria-hidden />
            <div className="leading-tight">
              <h1 className="font-heading text-xl text-ink">مفكرة</h1>
              <p className="text-[11px] text-ink-soft -mt-0.5">{name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/archived"
              className="flex items-center gap-1.5 rounded-full bg-surface-2 border border-line text-ink px-3 py-2 text-sm hover:border-accent transition whitespace-nowrap"
            >
              <Archive size={16} aria-hidden /> <span className="hidden sm:inline">الأرشيف</span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full bg-surface-2 border border-line text-ink px-3 py-2 text-sm hover:border-accent transition whitespace-nowrap"
            >
              يومي <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-4 grid gap-4 lg:grid-cols-[15rem_1fr]">
        {/* desktop rail */}
        <aside className="hidden lg:block rounded-2xl border border-line bg-surface-2 p-3 h-max">
          <h2 className="font-heading text-sm text-ink-soft mb-2 px-1">الملاحظات المحفوظة</h2>
          <div className="max-h-[70vh] overflow-auto"><NoteList onPick={openNote} /></div>
        </aside>

        <section className="flex flex-col rounded-2xl border border-line bg-surface overflow-hidden">
          {/* mobile: collapsible saved-notes list, above the editor but folded by default */}
          <div className="lg:hidden border-b border-line">
            <button
              onClick={() => setListOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-ink"
            >
              <span>الملاحظات المحفوظة ({notes.length})</span>
              <ChevronDown size={16} className={`transition ${listOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {listOpen && <div className="px-3 pb-3 max-h-[45vh] overflow-auto"><NoteList onPick={openNote} /></div>}
          </div>

          {/* tab strip */}
          <div className="flex items-stretch gap-1 border-b border-line bg-surface-2 px-2 pt-2 overflow-x-auto">
            {tabs.map((t) => (
              <div
                key={t.key}
                onClick={() => switchTo(t.key)}
                onDoubleClick={() => setEditingTab(t.key)}
                className={`group flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm cursor-pointer whitespace-nowrap ${
                  t.key === activeKey ? "bg-surface border-line text-ink" : "bg-transparent border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {t.kind === "task" && <span className="text-[10px] rounded bg-accent/15 text-accent px-1">مهمة</span>}
                {editingTab === t.key ? (
                  <input
                    autoFocus
                    dir="auto"
                    defaultValue={t.title}
                    onBlur={(e) => renameTab(t.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingTab(null);
                    }}
                    className="bg-transparent outline-none border-b border-line w-28 text-ink"
                  />
                ) : (
                  <span dir="auto">{t.title || UNTITLED}</span>
                )}
                {t.dirty && <span className="size-1.5 rounded-full bg-accent-2" title="غير محفوظ" />}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(t.key); }}
                  className="grid place-items-center rounded hover:text-q-do-ink opacity-60 group-hover:opacity-100"
                  aria-label="إغلاق"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
            <button
              onClick={newTab}
              className="self-center ms-1 tap-target grid place-items-center size-7 rounded-lg text-ink-soft hover:text-accent hover:bg-surface transition"
              title="ملاحظة جديدة"
              aria-label="ملاحظة جديدة"
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>

          {/* toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 border-b border-line px-3 py-2 flex-wrap">
            <span className="text-[11px] text-ink-soft hidden sm:inline">اتجاه السطر:</span>
            {dirBtn("auto", "تلقائي")}
            {dirBtn("rtl", "RTL")}
            {dirBtn("ltr", "LTR")}
            <span className="text-[11px] text-ink-soft/80 hidden lg:inline">Ctrl + Shift (يمين/يسار) لفرض الاتجاه</span>
            <div className="flex-1" />
            <button
              onClick={() => void saveActive()}
              className="flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/40 text-ink px-3 py-1.5 text-sm hover:bg-accent/25 transition"
              title="حفظ (Ctrl+S)"
            >
              <Save size={15} aria-hidden /> حفظ
            </button>
            {activeTab?.kind !== "task" && activeTab?.id != null && (
              <button
                onClick={() => void archiveActive()}
                className="tap-target grid place-items-center rounded-lg bg-surface border border-line text-ink-soft px-2.5 py-1.5 hover:text-accent hover:border-accent transition"
                title="أرشفة الملاحظة"
                aria-label="أرشفة الملاحظة"
              >
                <Archive size={15} aria-hidden />
              </button>
            )}
            {activeTab?.kind !== "task" && (
              <button
                onClick={() => void deleteActive()}
                className="tap-target grid place-items-center rounded-lg bg-surface border border-line text-ink-soft px-2.5 py-1.5 hover:text-q-do-ink hover:border-q-do-ink transition"
                title="حذف الملاحظة"
                aria-label="حذف الملاحظة"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            )}
          </div>

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={onInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            dir="auto"
            className="np-editor flex-1 min-h-[55vh] w-full px-4 py-3 outline-none text-ink leading-relaxed text-base whitespace-pre-wrap break-words"
          />
        </section>
      </div>

      {ask && (
        <Modal onClose={() => setAsk(false)} labelledBy="note-title-h">
          <div className="p-4">
            <h3 id="note-title-h" className="font-heading text-ink mb-2">عنوان الملاحظة</h3>
            <p className="text-xs text-ink-soft mb-3">سيظهر هذا العنوان في أفكارك على الشاشة الرئيسية.</p>
            <input
              data-autofocus
              dir="auto"
              value={titleInput}
              onChange={(e) => { setTitleInput(e.target.value); if (titleErr) setTitleErr(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmTitle();
              }}
              placeholder="مثال: خطة السفر"
              className={`w-full rounded-lg bg-surface-2 border px-3 py-2 text-base text-ink outline-none ${titleErr ? "border-q-do-ink" : "border-line focus:border-accent"}`}
            />
            <div className="min-h-[1.1rem] mt-1">{titleErr && <p className="text-q-do-ink text-xs">{titleErr}</p>}</div>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setAsk(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:text-ink">إلغاء</button>
              <button onClick={() => void confirmTitle()} className="rounded-lg bg-accent/20 border border-accent/50 px-3 py-1.5 text-sm text-ink hover:bg-accent/30">حفظ</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmCloseKey && (
        <Modal onClose={() => setConfirmCloseKey(null)} labelledBy="close-h">
          <div className="p-4">
            <h3 id="close-h" className="font-heading text-ink mb-2">إغلاق بدون حفظ؟</h3>
            <p className="text-sm text-ink-soft mb-4">تحتوي هذه الملاحظة على نص لم يُحفظ. سيُفقد إذا أغلقتها.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmCloseKey(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:text-ink">إبقاء</button>
              <button
                onClick={() => { const k = confirmCloseKey; setConfirmCloseKey(null); doCloseTab(k); }}
                className="rounded-lg bg-q-do-bg border border-q-do-ink/40 px-3 py-1.5 text-sm text-q-do-ink"
              >
                إغلاق بدون حفظ
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
