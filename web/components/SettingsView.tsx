"use client";

import { useMemo, useState } from "react";
import { Globe, ListChecks, Settings2 } from "lucide-react";
import { setTimezone } from "@/lib/habit-actions";
import { isoInTz } from "@/lib/date";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export default function SettingsView({ name, timezone }: { name: string; timezone: string }) {
  const toast = useToast();
  const [tz, setTz] = useState(timezone);
  const [saved, setSaved] = useState(timezone);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => {
    try {
      const all = Intl.supportedValuesOf("timeZone");
      return all.includes(tz) ? all : [tz, ...all];
    } catch {
      return [tz];
    }
  }, [tz]);
  const device = deviceZone();

  async function save(zone: string) {
    setBusy(true);
    const res = await setTimezone(zone);
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error);
      return;
    }
    setTz(res.data);
    setSaved(res.data);
    toast.show("تم حفظ المنطقة الزمنية");
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <PageHeader
        icon={<Settings2 size={24} aria-hidden />}
        title="الإعدادات"
        subtitle={name}
        links={[{ href: "/habits", label: "العادات", icon: <ListChecks size={16} aria-hidden /> }]}
      />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="font-heading text-lg text-ink flex items-center gap-2">
            <Globe size={18} className="text-accent" aria-hidden /> المنطقة الزمنية
          </h2>
          <p className="text-sm text-ink-soft">
            تُحسب أيام العادات و«اليوم» في لوحتك بحسب هذه المنطقة. التاريخ الآن فيها: {" "}
            <span dir="ltr" className="tabular-nums">{isoInTz(new Date(), saved)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              dir="ltr"
              aria-label="المنطقة الزمنية"
              className="min-w-0 flex-1 rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <button
              onClick={() => void save(tz)}
              disabled={busy || tz === saved}
              className="rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:brightness-105 transition"
            >
              حفظ
            </button>
          </div>
          {device && device !== saved && (
            <button
              onClick={() => void save(device)}
              disabled={busy}
              className="self-start text-sm text-accent hover:underline underline-offset-2"
            >
              استخدم منطقة هذا الجهاز ({device})
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
