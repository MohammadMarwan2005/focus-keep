import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { requireSession } from "@/lib/auth";
import { DATA_DIR } from "@/lib/stream";
import { MAX_IMAGE_BYTES, MAX_SVG_BYTES, checkSvg, sniffImage } from "@/lib/habits/files";

export const dynamic = "force-dynamic";

/**
 * Upload a habit icon into data/habits/<uid>/. `kind` = "image" (png / jpg /
 * webp, already resized to <= 256px by the browser) or "svg". The type is
 * decided by magic bytes / content, never by the reported MIME or filename.
 * Returns the relative path to store in habits.image_path.
 */
export async function POST(req: NextRequest) {
  let uid: number;
  try {
    uid = (await requireSession()).uid;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File)) return NextResponse.json({ error: "لا يوجد ملف" }, { status: 400 });
  if (kind !== "image" && kind !== "svg") return NextResponse.json({ error: "نوع الملف غير محدد" }, { status: 400 });

  // check the declared size before buffering anything big
  const limit = kind === "svg" ? MAX_SVG_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return NextResponse.json(
      { error: kind === "svg" ? "ملف SVG كبير جداً (الحد ١٠٠ كيلوبايت)" : "الصورة كبيرة جداً (الحد ٣٠٠ كيلوبايت)" },
      { status: 413 },
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > limit) return NextResponse.json({ error: "الملف كبير جداً" }, { status: 413 });

  let ext: string;
  if (kind === "svg") {
    if (sniffImage(buf)) return NextResponse.json({ error: "الملف ليس SVG" }, { status: 415 });
    const text = new TextDecoder("utf-8").decode(buf);
    const err = checkSvg(text, buf.length);
    if (err) return NextResponse.json({ error: err }, { status: 415 });
    ext = "svg";
  } else {
    const t = sniffImage(buf);
    if (!t) return NextResponse.json({ error: "الملف ليس صورة PNG أو JPG أو WebP" }, { status: 415 });
    ext = t;
  }

  const dir = path.join(DATA_DIR, "habits", String(uid));
  await mkdir(dir, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, name), buf);

  return NextResponse.json({ ok: true, path: `habits/${uid}/${name}` });
}
