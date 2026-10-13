import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { safeDataPath, streamFile } from "@/lib/stream";
import { ICON_FILE_RE } from "@/lib/habits/files";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Serve one of the logged-in user's habit icons. The file is looked up only
 * inside data/habits/<their uid>/, so another user's icon is a 404.
 * Modeled on app/api/audio/theme/route.ts.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { file } = await params;
  if (!ICON_FILE_RE.test(file)) return NextResponse.json({ error: "missing" }, { status: 404 });

  const abs = safeDataPath(`habits/${s.uid}/${file}`);
  if (!abs) return NextResponse.json({ error: "missing" }, { status: 404 });

  const ext = file.slice(file.lastIndexOf(".") + 1);
  const res = streamFile(abs, req.headers.get("range"), MIME_BY_EXT[ext]);
  res.headers.set("X-Content-Type-Options", "nosniff");
  if (ext === "svg") {
    // never let an uploaded SVG run anything, even if opened directly
    res.headers.set("Content-Security-Policy", "sandbox");
  }
  // names are random and never reused, but they are private to this user
  res.headers.set("Cache-Control", "private, max-age=31536000, immutable");
  res.headers.set("Vary", "Cookie");
  return res;
}
