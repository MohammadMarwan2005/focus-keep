import { eq } from "drizzle-orm";
import { db, settings } from "@/db";

export async function getSetting(k: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.k, k));
    return row?.v ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(k: string, v: string): Promise<void> {
  await db
    .insert(settings)
    .values({ k, v })
    .onDuplicateKeyUpdate({ set: { v } });
}

// Per-user setting keys. Theme music + its default-on flag are scoped per user.
export const themePathKey = (uid: number) => `theme_music_path:${uid}`;
export const soundDefaultKey = (uid: number) => `sound_default_on:${uid}`;

export async function soundDefaultOn(uid: number): Promise<boolean> {
  const v = await getSetting(soundDefaultKey(uid));
  return v === "1";
}
