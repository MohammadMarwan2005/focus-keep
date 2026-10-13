"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudSun, Eye, EyeOff } from "lucide-react";

const browserTimezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
};

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userErr, setUserErr] = useState("");
  const [passErr, setPassErr] = useState("");
  const [formErr, setFormErr] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const uErr = username.trim().length < 3 ? "اسم المستخدم ٣ أحرف على الأقل" : "";
    const pErr = password.length < 6 ? "كلمة المرور ٦ أحرف على الأقل" : "";
    setUserErr(uErr);
    setPassErr(pErr);
    setFormErr("");
    if (uErr || pErr) return;

    setBusy(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password, timezone: browserTimezone() }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      if (j.field === "username") setUserErr(j.error || "تعذّر إنشاء الحساب");
      else if (j.field === "password") setPassErr(j.error || "تعذّر إنشاء الحساب");
      else setFormErr(j.error || "تعذّر إنشاء الحساب");
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl bg-bg border px-4 py-3 text-base text-ink outline-none transition";

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-sm rounded-3xl bg-surface shadow-pop border border-line p-8">
      <div className="text-center mb-6">
        <CloudSun size={44} className="text-accent mx-auto mb-1" aria-hidden />
        <h1 className="font-heading text-3xl text-ink mb-1">إنشاء حساب</h1>
        <p className="text-ink-soft text-sm">ابدأ يومك مع مصفوفة أيزنهاور</p>
      </div>

      {/* reserved space keeps the card from jumping when a message appears */}
      <div className="min-h-[1.5rem] mb-2 text-center">
        {formErr && <p className="text-q-do-ink text-sm">{formErr}</p>}
      </div>

      <label className="block text-sm text-ink-soft mb-1" htmlFor="sf-name">الاسم</label>
      <input
        id="sf-name"
        dir="auto"
        className={`${field} mb-3 border-line focus:border-accent`}
        placeholder="اسمك كما تريد أن يظهر"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      <label className="block text-sm text-ink-soft mb-1" htmlFor="sf-user">اسم المستخدم</label>
      <input
        id="sf-user"
        className={`${field} mb-1 ${userErr ? "border-q-do-ink" : "border-line focus:border-accent"}`}
        placeholder="اسم المستخدم"
        value={username}
        onChange={(e) => { setUsername(e.target.value); if (userErr) setUserErr(""); }}
      />
      <div className="min-h-[1.1rem] mb-2">
        {userErr && <p className="text-q-do-ink text-xs">{userErr}</p>}
      </div>

      <label className="block text-sm text-ink-soft mb-1" htmlFor="sf-pass">كلمة المرور</label>
      <div className="relative">
        <input
          id="sf-pass"
          type={show ? "text" : "password"}
          className={`${field} ps-12 ${passErr ? "border-q-do-ink" : "border-line focus:border-accent"}`}
          placeholder="٦ أحرف على الأقل"
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
        {busy ? "…" : "إنشاء الحساب"}
      </button>

      <p className="text-center text-sm text-ink-soft mt-5">
        لديك حساب؟{" "}
        <Link href="/login" className="text-accent font-medium hover:underline underline-offset-2">
          تسجيل الدخول
        </Link>
      </p>
    </form>
  );
}
