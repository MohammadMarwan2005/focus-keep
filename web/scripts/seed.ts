import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "../db";

/**
 * Seed / reset the single login. Usage:
 *   tsx scripts/seed.ts <username> <password> [name]
 */
async function main() {
  const [, , username, password, name] = process.argv;
  if (!username || !password) {
    console.error("usage: tsx scripts/seed.ts <username> <password> [name]");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const [existing] = await db.select().from(users).where(eq(users.username, username));
  if (existing) {
    await db.update(users).set({ password_hash: hash, name: name ?? existing.name }).where(eq(users.id, existing.id));
    console.log(`updated user "${username}" (id ${existing.id})`);
  } else {
    await db.insert(users).values({ username, password_hash: hash, name: name ?? username, role: "admin" });
    console.log(`created user "${username}"`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
