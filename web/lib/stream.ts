import { createReadStream, statSync, existsSync } from "fs";
import path from "path";
import { Readable } from "stream";

// data/ lives at the repo root, one level above web/
export const DATA_DIR = path.resolve(process.cwd(), "..", "data");

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

export function safeDataPath(rel: string): string | null {
  const abs = path.resolve(DATA_DIR, rel.replace(/^\/+/, ""));
  if (!abs.startsWith(DATA_DIR + path.sep)) return null; // traversal guard
  if (!existsSync(abs)) return null;
  return abs;
}

/** Stream a file from data/ with full Range (206) support so iOS can scrub. */
export function streamFile(abs: string, rangeHeader: string | null, mimeOverride?: string): Response {
  const stat = statSync(abs);
  const mime = mimeOverride || MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  const common = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      }
      const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          ...common,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: { ...common, "Content-Length": String(stat.size) },
  });
}
