import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

/**
 * One-off, idempotent migration for the habit tracker. Runs once locally
 * against the dev DB and once on the server after `git pull`:
 *
 *   node scripts/migrate-habits.mjs
 *
 * Mirrors the Drizzle definitions in db/schema.ts (habits, habit_goals,
 * habit_entries, mistakes, entry_mistakes, users.timezone). Every statement is
 * safe to re-run: CREATE TABLE IF NOT EXISTS, and the column add is guarded by
 * SHOW COLUMNS because MySQL 8 has no ADD COLUMN IF NOT EXISTS.
 */

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
  charset: "utf8mb4",
});

const TABLE_OPTS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

const TABLES = {
  habits: `
    CREATE TABLE IF NOT EXISTS habits (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      line_dirs TEXT,
      icon_type ENUM('emoji','image','svg') NOT NULL DEFAULT 'emoji',
      emoji VARCHAR(16),
      image_path VARCHAR(255),
      bg_color VARCHAR(16),
      fg_color VARCHAR(16),
      progress_type ENUM('boolean','measured') NOT NULL DEFAULT 'boolean',
      unit VARCHAR(32),
      reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
      start_date DATE NOT NULL,
      archived TINYINT(1) NOT NULL DEFAULT 0,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT (now()),
      updated_at TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_habit_user_archived (user_id, archived)
    ) ${TABLE_OPTS}`,

  habit_goals: `
    CREATE TABLE IF NOT EXISTS habit_goals (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      habit_id INT NOT NULL,
      goal_value DECIMAL(10,2) NOT NULL,
      goal_direction ENUM('at_least','at_most') NOT NULL DEFAULT 'at_least',
      effective_from DATE NOT NULL,
      created_at TIMESTAMP NULL DEFAULT (now()),
      PRIMARY KEY (id),
      KEY idx_goal_habit_from (habit_id, effective_from)
    ) ${TABLE_OPTS}`,

  habit_entries: `
    CREATE TABLE IF NOT EXISTS habit_entries (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      habit_id INT NOT NULL,
      day DATE NOT NULL,
      status ENUM('done','missed','skipped') NOT NULL,
      value DECIMAL(10,2) NULL,
      notes TEXT,
      line_dirs TEXT,
      created_at TIMESTAMP NULL DEFAULT (now()),
      updated_at TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_entry_habit_day (habit_id, day),
      KEY idx_entry_user_day (user_id, day)
    ) ${TABLE_OPTS}`,

  mistakes: `
    CREATE TABLE IF NOT EXISTS mistakes (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      habit_id INT NOT NULL,
      text VARCHAR(255) NOT NULL,
      line_dirs TEXT,
      suggest TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NULL DEFAULT (now()),
      PRIMARY KEY (id),
      KEY idx_mistake_habit_suggest (habit_id, suggest)
    ) ${TABLE_OPTS}`,

  entry_mistakes: `
    CREATE TABLE IF NOT EXISTS entry_mistakes (
      user_id INT NOT NULL,
      entry_id INT NOT NULL,
      mistake_id INT NOT NULL,
      PRIMARY KEY (entry_id, mistake_id),
      KEY idx_em_mistake (mistake_id),
      KEY idx_em_user (user_id)
    ) ${TABLE_OPTS}`,
};

try {
  // users.timezone — portable equivalent of ADD COLUMN IF NOT EXISTS.
  const [cols] = await conn.query("SHOW COLUMNS FROM users LIKE 'timezone'");
  if (cols.length) {
    console.log("users.timezone already exists — nothing to do");
  } else {
    await conn.query("ALTER TABLE users ADD COLUMN timezone VARCHAR(64) NULL AFTER role");
    console.log("added users.timezone column");
  }

  for (const [name, ddl] of Object.entries(TABLES)) {
    const [exists] = await conn.query("SHOW TABLES LIKE ?", [name]);
    await conn.query(ddl);
    console.log(exists.length ? `table ${name} already exists — nothing to do` : `created table ${name}`);
  }

  console.log("habits migration complete");
} finally {
  await conn.end();
}
