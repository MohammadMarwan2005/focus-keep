# يومي (Yawmi) — Daily Eisenhower Matrix + Ideas

**يومي** ("my day") is a personal Arabic-first productivity web app. You plan each
day on an **Eisenhower matrix** (2×2 urgency/importance board), keep a persistent
**ideas / notes inbox** on the side, jot free-form notes in a built-in **notepad**,
and **archive** notes you want to keep but not see every day. Fully right-to-left
(`<html lang="ar" dir="rtl">`), with a day/night theme and an ambient sound engine.

- **Live:** https://focuskeep.duckdns.org
- **Host:** shared Hetzner box, pm2 app `yawmi` on port **8014**
- **Code:** `/var/www/yawmi/web`

---

## What it does

### The day board (`/`)
A 2×2 Eisenhower matrix for the selected day. The four quadrants:

| Quadrant (key) | Arabic | Meaning |
|---|---|---|
| `urgent_important` | عاجل ومهم | Do now |
| `important` | مهم غير عاجل | Schedule |
| `urgent` | عاجل غير مهم | Delegate |
| `neither` | لا مهم ولا عاجل | Drop |

- Add a task to any quadrant, check it off (plays a chime; completed tasks sink to
  the bottom), reorder within a quadrant, and drag between quadrants or days.
- Day navigation (أمس / غدًا / date picker) with numeric dates like `21/9`; each
  day's tasks are isolated.
- **Copy from yesterday** pulls forward unfinished tasks, preserving quadrant.
- **Ideas rail** sits on the **right** (under RTL): drag an idea onto a quadrant to
  turn it into a task for the current day.

### Notepad (`/notepad`)
A tabbed notepad (المفكرة) for free-form notes. Notes are stored as rows in the
`ideas` table, so a note and an inbox idea are the same thing. Supports per-line
text direction (mixed Arabic/Latin). From a saved note you can **archive** it
(📦) or delete it, both with a 5-second undo toast.

### Archive (`/archived`)
Notes you archive disappear from the inbox and the notepad list but live here on
الأرشيف. Each archived note can be **restored** (استعادة) back to the active list or
**deleted permanently** (حذف نهائي) — both undoable. Archiving is a soft-delete
flag (`ideas.archived`), not a separate table.

### Habits (`/habits`, and the left rail on the day board)
Track daily habits, either yes/no or measured against a goal (e.g. sleep at least
7.5 hours, screen time at most 2 hours). Log from the **habits rail** on the left of
the board, which follows the day navigation. Each day can carry notes and
**mistakes** picked from a per-habit catalog. A **catch-up sheet** asks once per
session about unlogged days from the last 14. Each habit has an **analytics** page
(`/habits/[id]`) with streaks, success rate, a 3-month heatmap, a value chart with
the goal line, a weekday breakdown and the mistake correlation. The catalog lives
at `/habits/mistakes`, and the timezone is set at `/settings`. Habit days are
calendar dates in the user's timezone (`users.timezone`), and success is always
derived, never stored.

### Across the app
- **Auth:** single password-protected user now (JWT via `jose` + `bcryptjs`), but
  every row carries `user_id` so multi-user is a later flip. Routes are protected by
  `middleware.ts` (login/signup/api/auth excluded).
- **Dark mode:** class-based theme toggle, persisted in `localStorage`, defaulting to
  `prefers-color-scheme`; night palette is genuinely darker.
- **Sound:** reused omama `SoundManager` — looping uploaded theme + chime on
  complete + whoosh on day change; muteable and remembered.

---

## Tech stack

- **Next.js 15** (App Router, React 19, server components + server actions)
- **Tailwind CSS v4**
- **Drizzle ORM** + **mysql2** pool → MySQL
- **@dnd-kit** (core / sortable / utilities) for touch-friendly drag & drop
- **framer-motion**, **lucide-react** icons
- Fonts: **Aref Ruqaa** (headings) + **IBM Plex Sans Arabic** (body)

## Data model (MySQL, see `web/db/schema.ts`)

- **`users`** — id, username (unique), password_hash, name, role (`admin`/`user`), created_at
- **`tasks`** — id, user_id, day (DATE), quadrant (enum), title, note, line_dirs,
  done, done_at, position, timestamps; indexed on (user_id, day)
- **`ideas`** — id, user_id, title, note, line_dirs, **archived**, position,
  timestamps; indexed on user_id. (Backs both the inbox and the notepad.)
- **`settings`** — simple k/v (theme music path, sound default)
- **`habits`**, **`habit_goals`** (versioned by `effective_from`), **`habit_entries`**
  (one per habit and day), **`mistakes`**, **`entry_mistakes`**, plus
  `users.timezone`. They are created by `web/scripts/migrate-habits.mjs`. Habit
  icons are stored under `data/habits/<user_id>/`.

---

## Project layout

```
/var/www/yawmi/
├── web/
│   ├── app/            # routes: / , /notepad , /archived , /login , /signup , /api/*
│   ├── components/     # DayView, Notepad, ArchivedList, SoundManager, Toast, ...
│   ├── db/             # index.ts (pool), schema.ts
│   ├── lib/            # auth.ts, data.ts (loaders), actions.ts (server actions), settings.ts
│   ├── scripts/        # seed.ts, one-off migrations (e.g. add-archived-col.mjs)
│   └── .env            # JWT_SECRET, DB creds
├── ecosystem.config.js # pm2 (port 8014)
└── build-safe.sh       # RAM-capped build (required on this box)
```

## Development & scripts

From `web/`:

```bash
npm run dev        # next dev
npm run build      # next build  (on the server use ./build-safe.sh instead — see below)
npm run start      # next start
npm run db:push    # drizzle-kit push (sync schema to MySQL)
npm run seed       # create/seed the single user
npm test           # unit tests for lib/habits (node:test via tsx)
npm run seed:habits  # demo user test2 with 60 days of habits (needs SEED_TEST2_PASSWORD)
```

## Deploy (on the shared box)

The box is tight on RAM/disk, so **never run a bare `next build`** there. Pull,
install, migrate, then use the RAM-capped wrapper and restart pm2:

```bash
cd /var/www/yawmi && git pull
cd web && npm ci
node scripts/migrate-habits.mjs
SEED_TEST2_PASSWORD=... npm run seed:habits    # optional, test data only
../build-safe.sh
pm2 restart yawmi && pm2 save
```

- `migrate-habits.mjs` is idempotent (`CREATE TABLE IF NOT EXISTS` plus a guarded
  `ADD COLUMN`), so re-running it on every deploy is safe. Don't use
  `npm run db:push` against the live DB.
- `seed:habits` replaces the `test2` user's habit data; skip it in production
  unless you want the demo account.

`build-safe.sh` adds temporary swap, caps the Node heap
(`NODE_OPTIONS=--max-old-space-size=1536`), runs the build niced under a memory-limited
cgroup, and cleans up swap afterward.
