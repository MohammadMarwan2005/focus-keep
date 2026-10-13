"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";

/**
 * Sound engine (adapted from the omama site).
 * - Optional looping theme (admin-uploaded) from /api/audio/theme.
 * - Synthesized SFX via Web Audio: chime (task done), whoosh (day change), tick.
 * - Autoplay is unlocked on the first user gesture anywhere on the page.
 * - Mute preference persists in localStorage; music ducks under other media.
 */

type SoundApi = {
  muted: boolean;
  toggleMute: () => void;
  chime: () => void;
  whoosh: () => void;
  tick: () => void;
};

const SoundContext = createContext<SoundApi>({
  muted: true,
  toggleMute: () => {},
  chime: () => {},
  whoosh: () => {},
  tick: () => {},
});

export const useSound = () => useContext(SoundContext);

const MUTE_KEY = "yawmi_muted";
const UNLOCK_KEY = "yawmi_unlocked";

export default function SoundManager({
  defaultOn,
  children,
}: {
  defaultOn: boolean;
  children: React.ReactNode;
}) {
  const [muted, setMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const duckedBy = useRef<Set<EventTarget>>(new Set());

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const ensureMusic = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const el = new Audio("/api/audio/theme");
      el.loop = true;
      el.volume = 0.3;
      el.preload = "none";
      el.addEventListener("ended", () => {
        el.currentTime = 0;
        void el.play().catch(() => {});
      });
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  const applyMute = useCallback(
    (m: boolean) => {
      setMuted(m);
      try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch {}
      const el = ensureMusic();
      if (!el) return;
      if (m) {
        el.pause();
      } else if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
        void el.play().catch(() => {});
      }
    },
    [ensureMusic]
  );

  // initial state from storage / server default
  useEffect(() => {
    let m: boolean;
    try {
      const stored = localStorage.getItem(MUTE_KEY);
      m = stored !== null ? stored === "1" : !defaultOn;
    } catch {
      m = !defaultOn;
    }
    setMuted(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unlock audio on the first user gesture, then start the theme if unmuted
  useEffect(() => {
    function unlock() {
      try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch {}
      getCtx();
      if (!muted) {
        const el = ensureMusic();
        if (el) void el.play().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [muted, getCtx, ensureMusic]);

  // duck under any other media element
  useEffect(() => {
    const music = () => audioRef.current;
    function onPlay(e: Event) {
      const t = e.target;
      if (!(t instanceof HTMLMediaElement) || t === music()) return;
      duckedBy.current.add(t);
      const m = music();
      if (m) m.volume = 0.1;
    }
    function onStop(e: Event) {
      const t = e.target;
      if (!(t instanceof EventTarget) || t === music()) return;
      duckedBy.current.delete(t);
      if (duckedBy.current.size === 0) {
        const m = music();
        if (m) m.volume = 0.3;
      }
    }
    document.addEventListener("play", onPlay, true);
    document.addEventListener("pause", onStop, true);
    document.addEventListener("ended", onStop, true);
    return () => {
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("pause", onStop, true);
      document.removeEventListener("ended", onStop, true);
    };
  }, []);

  // resume music when returning to the tab
  useEffect(() => {
    function onVisible() {
      const el = audioRef.current;
      if (
        document.visibilityState === "visible" &&
        el && el.paused && !muted &&
        sessionStorage.getItem(UNLOCK_KEY) === "1"
      ) {
        void el.play().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [muted]);

  const toggleMute = useCallback(() => applyMute(!muted), [muted, applyMute]);

  // soft rising two-note chime (task completed)
  const chime = useCallback(() => {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [587.33, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + i * 0.08);
      g.gain.linearRampToValueAtTime(0.06, t0 + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.08 + 0.55);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + i * 0.08);
      o.stop(t0 + i * 0.08 + 0.65);
    });
  }, [muted, getCtx]);

  // filtered-noise whoosh (day change)
  const whoosh = useCallback(() => {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const dur = 0.4;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
  }, [muted, getCtx]);

  // tiny tick (add / drop)
  const tick = useCallback(() => {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + 0.14);
  }, [muted, getCtx]);

  return (
    <SoundContext.Provider value={{ muted, toggleMute, chime, whoosh, tick }}>
      {children}
    </SoundContext.Provider>
  );
}
