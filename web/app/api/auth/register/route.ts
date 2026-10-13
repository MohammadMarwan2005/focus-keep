import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { isValidTimezone } from "@/lib/date";
import { COOKIE_NAME, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const timezone = typeof body.timezone === "string" && isValidTimezone(body.timezone) ? body.timezone : null;

  if (!username || !password) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }
  if (username.length < 3) {
    return NextResponse.json({ error: "اسم المستخدم قصير جداً", field: "username" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "كلمة المرور يجب ألا تقل عن ٦ أحرف", field: "password" }, { status: 400 });
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (existing) {
    return NextResponse.json({ error: "اسم المستخدم مستخدم بالفعل", field: "username" }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const [res] = await db.insert(users).values({
    username,
    password_hash,
    name: name || username,
    role: "user",
    timezone,
  });
  const uid = Number((res as { insertId: number }).insertId);

  const token = await signSession({ uid, username, role: "user", name: name || username });
  const out = NextResponse.json({ ok: true });
  out.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return out;
}
