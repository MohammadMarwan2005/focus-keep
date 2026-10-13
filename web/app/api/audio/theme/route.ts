import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSetting, themePathKey } from "@/lib/settings";
import { safeDataPath, streamFile } from "@/lib/stream";

export const dynamic = "force-dynamic";

/** Streams the logged-in user's own theme music from data/ with Range support. */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = (await getSetting(themePathKey(s.uid)))?.trim() || null;
  if (!rel) return NextResponse.json({ error: "no theme configured" }, { status: 404 });

  const abs = safeDataPath(rel);
  if (!abs) return NextResponse.json({ error: "missing" }, { status: 404 });

  // Same URL yields different audio per user, so don't let a shared browser
  // cache one user's track and replay it for another.
  const res = streamFile(abs, req.headers.get("range"));
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}
