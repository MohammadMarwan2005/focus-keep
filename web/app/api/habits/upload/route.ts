import { NextRequest, NextResponse } from "next/server";
import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, habits } from "@/db";
import { requireSession } from "@/lib/auth";
import { DATA_DIR } from "@/lib/stream";
import {
  ICON_FILE_RE, MAX_ICON_FILES, MAX_IMAGE_BYTES, MAX_SVG_BYTES, ORPHAN_GRACE_MS, checkSvg, sniffImage,
} from "@/lib/habits/files";

// multipart framing around the file; anything bigger than limit + this is refused unread
const MULTIPART_SLACK = 16 * 1024;

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

  // formData() buffers the whole body, so refuse oversized (or unsized) bodies first
  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) {
    return NextResponse.json({ error: "حجم الملف غير معروف" }, { status: 411 });
  }
  if (declared > MAX_IMAGE_BYTES + MULTIPART_SLACK) {
    return NextResponse.json({ error: "الملف كبير جداً (الحد ٣٠٠ كيلوبايت)" }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof File)) return NextResponse.json({ error: "لا يوجد ملف" }, { status: 400 });
  if (kind !== "image" && kind !== "svg") return NextResponse.json({ error: "نوع الملف غير محدد" }, { status: 400 });

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
  const kept = await sweepOrphans(uid, dir);
  if (kept >= MAX_ICON_FILES) {
    return NextResponse.json({ error: "وصلت إلى حد الأيقونات المرفوعة؛ حاول لاحقاً" }, { status: 429 });
  }
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, name), buf);

  return NextResponse.json({ ok: true, path: `habits/${uid}/${name}` });
}

/**
 * Delete this user's icon files that no habit references and that are older
 * than the grace period (younger ones may sit in an open, unsaved form or be
 * needed by an Undo). Returns how many files remain.
 */
async function sweepOrphans(uid: number, dir: string): Promise<number> {
  const rows = await db
    .select({ p: habits.image_path })
    .from(habits)
    .where(and(eq(habits.user_id, uid), isNotNull(habits.image_path)));
  const used = new Set(rows.map((r) => r.p?.split("/").pop()));
  let kept = 0;
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!ICON_FILE_RE.test(name)) continue;
    if (!used.has(name)) {
      const st = await stat(path.join(dir, name)).catch(() => null);
      if (st && Date.now() - st.mtimeMs > ORPHAN_GRACE_MS) {
        await unlink(path.join(dir, name)).catch(() => {});
        continue;
      }
    }
    kept++;
  }
  return kept;
}
