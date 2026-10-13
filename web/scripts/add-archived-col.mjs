import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

// Load .env manually (this script runs outside Next).
const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const conn = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
});

const [cols] = await conn.query("SHOW COLUMNS FROM ideas LIKE 'archived'");
if (cols.length) {
  console.log("archived column already exists — nothing to do");
} else {
  await conn.query(
    "ALTER TABLE ideas ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER line_dirs"
  );
  console.log("added ideas.archived column");
}
await conn.end();
