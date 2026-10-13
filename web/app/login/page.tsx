import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دخول — يومي" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // already signed in? go to where you were headed instead of showing the form (N7)
  const session = await getSession();
  if (session) {
    const sp = await searchParams;
    const next = sp.next && sp.next.startsWith("/") ? sp.next : "/";
    redirect(next);
  }

  return (
    <main className="hour-glow min-h-screen grid place-items-center px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
