import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db, users } from "@/db";
import { isValidTimezone } from "@/lib/date";
import { COOKIE_NAME, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { username, password, timezone } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  // explicit columns: login must keep working on a DB where migrate-habits.mjs hasn't run yet
  const [u] = await db
    .select({ id: users.id, username: users.username, password_hash: users.password_hash, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.username, String(username).trim()));
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) {
    return NextResponse.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  // first login from a browser: remember its zone so habit days line up with the user's calendar
  if (typeof timezone === "string" && isValidTimezone(timezone)) {
    await rememberTimezone(u.id, timezone);
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

/** Store the browser zone only when none is set yet; a no-op before the habits migration. */
async function rememberTimezone(uid: number, timezone: string) {
  try {
    await db.update(users).set({ timezone }).where(and(eq(users.id, uid), isNull(users.timezone)));
  } catch (e) {
    console.error("could not store timezone (run scripts/migrate-habits.mjs?)", e);
  }
}
