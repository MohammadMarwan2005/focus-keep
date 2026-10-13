import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { isValidTimezone } from "@/lib/date";
import { COOKIE_NAME, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { username, password, timezone } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const [u] = await db.select().from(users).where(eq(users.username, String(username).trim()));
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) {
    return NextResponse.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  // first login from a browser: remember its zone so habit days line up with the user's calendar
  if (!u.timezone && typeof timezone === "string" && isValidTimezone(timezone)) {
    await db.update(users).set({ timezone }).where(eq(users.id, u.id));
  }

  const token = await signSession({
    uid: u.id,
    username: u.username,
    role: u.role,
    name: u.name ?? u.username,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
