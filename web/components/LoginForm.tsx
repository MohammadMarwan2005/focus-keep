"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CloudSun, Eye, EyeOff } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userErr, setUserErr] = useState("");
  const [passErr, setPassErr] = useState("");
  const [formErr, setFormErr] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const uErr = username.trim() ? "" : "أدخل اسم المستخدم";
    const pErr = password ? "" : "أدخل كلمة المرور";
    setUserErr(uErr);
    setPassErr(pErr);
    setFormErr("");
    if (uErr || pErr) return;

    setBusy(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.replace(next);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setFormErr(j.error || "تعذّر تسجيل الدخول");
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl bg-bg border px-4 py-3 text-base text-ink outline-none transition";

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-sm rounded-3xl bg-surface shadow-pop border border-line p-8">
      <div className="text-center mb-6">
        <CloudSun size={44} className="text-accent mx-auto mb-1" aria-hidden />
        <h1 className="font-heading text-3xl text-ink mb-1">يومي</h1>
        <p className="text-ink-soft text-sm">مصفوفة أيزنهاور لمهامك اليومية</p>
      </div>

      {/* reserved space keeps the card from jumping when a message appears */}
      <div className="min-h-[1.5rem] mb-2 text-center">
        {formErr && <p className="text-q-do-ink text-sm">{formErr}</p>}
      </div>

      <label className="block text-sm text-ink-soft mb-1" htmlFor="lf-user">اسم المستخدم</label>
      <input
        id="lf-user"
        className={`${field} mb-1 ${userErr ? "border-q-do-ink" : "border-line focus:border-accent"}`}
        placeholder="اسم المستخدم"
        value={username}
        onChange={(e) => { setUsername(e.target.value); if (userErr) setUserErr(""); }}
        autoFocus
      />
      <div className="min-h-[1.1rem] mb-2">
        {userErr && <p className="text-q-do-ink text-xs">{userErr}</p>}
      </div>

      <label className="block text-sm text-ink-soft mb-1" htmlFor="lf-pass">كلمة المرور</label>
      <div className="relative">
        <input
          id="lf-pass"
          type={show ? "text" : "password"}
          className={`${field} ps-12 ${passErr ? "border-q-do-ink" : "border-line focus:border-accent"}`}
          placeholder="كلمة المرور"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (passErr) setPassErr(""); }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          className="absolute inset-y-0 start-0 grid place-items-center w-12 text-ink-soft hover:text-ink"
        >
          {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      <div className="min-h-[1.1rem] mb-3">
        {passErr && <p className="text-q-do-ink text-xs">{passErr}</p>}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-accent text-white py-3 font-medium disabled:opacity-60 transition hover:brightness-105"
      >
        {busy ? "…" : "دخول"}
      </button>

      <p className="text-center text-sm text-ink-soft mt-5">
        ليس لديك حساب؟{" "}
        <Link
          href={next && next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="text-accent font-medium hover:underline underline-offset-2"
        >
          إنشاء حساب
        </Link>
      </p>
    </form>
  );
}
