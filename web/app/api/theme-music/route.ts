import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readdir, unlink } from "fs/promises";
import path from "path";
import { requireSession } from "@/lib/auth";
import { getSetting, setSetting, themePathKey, soundDefaultKey } from "@/lib/settings";
import { DATA_DIR } from "@/lib/stream";

export const dynamic = "force-dynamic";

// Extensions we can stream back with a correct Content-Type (see lib/stream.ts).
const ALLOWED_EXT = new Set([".mp3", ".m4a", ".ogg", ".oga", ".opus", ".wav", ".webm", ".aac"]);

// Fallback: guess an extension from the reported MIME when the filename lacks one.
const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
  "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac",
  "audio/ogg": ".ogg", "audio/opus": ".opus",
  "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
  "audio/webm": ".webm",
};

/** Upload a looping theme track (max ~15MB). Stored in data/audio/. */
export async function POST(req: NextRequest) {
  let uid: number;
  try {
    uid = (await requireSession()).uid;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لا يوجد ملف" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "الملف كبير جداً (الحد ١٥ ميغابايت)" }, { status: 413 });
  }

  // Pick the extension from the filename first, then from the MIME type.
  let ext = path.extname(file.name || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) ext = EXT_BY_MIME[file.type] || "";
  const looksAudio = ext !== "" || file.type.startsWith("audio/");
  if (!looksAudio) {
    return NextResponse.json({ error: "الرجاء اختيار ملف صوتي" }, { status: 415 });
  }
  if (!ALLOWED_EXT.has(ext)) ext = ".mp3"; // audio/* with an odd extension — store as mp3

  const dir = path.join(DATA_DIR, "audio");
  await mkdir(dir, { recursive: true });

  // remove this user's previous theme-<uid>.* so the stored path is unambiguous
  try {
    for (const f of await readdir(dir)) {
      if (f.startsWith(`theme-${uid}.`)) await unlink(path.join(dir, f));
    }
  } catch {}

  const name = `theme-${uid}${ext}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  const rel = path.join("audio", name);
  await setSetting(themePathKey(uid), rel);
  await setSetting(soundDefaultKey(uid), "1");

  return NextResponse.json({ ok: true, path: rel });
}

export async function GET() {
  let uid: number;
  try {
    uid = (await requireSession()).uid;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rel = await getSetting(themePathKey(uid));
  return NextResponse.json({ hasTheme: !!rel });
}
