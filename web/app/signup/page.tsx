import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SignupForm from "@/components/SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "إنشاء حساب — يومي" };

export default async function SignupPage() {
  // already signed in? no need for the signup form
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="hour-glow min-h-screen grid place-items-center px-6">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  );
}
