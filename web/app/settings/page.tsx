import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadUserTimezone } from "@/lib/data";
import SettingsView from "@/components/SettingsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الإعدادات — يومي" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <SettingsView name={session.name} timezone={await loadUserTimezone(session.uid)} />;
}
