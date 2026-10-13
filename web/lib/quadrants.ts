import type { Quadrant } from "@/db/schema";

export type QuadrantMeta = {
  key: Quadrant;
  title: string;   // Arabic label
  hint: string;    // action verb (Eisenhower)
  bg: string;      // tailwind class for wash
  ink: string;     // tailwind class for label color
  dot: string;     // css var for the dot color
};

// Display order for a 2×2 grid. In an RTL grid the first item sits top-right.
export const QUADRANT_META: QuadrantMeta[] = [
  { key: "urgent_important", title: "عاجل ومهم", hint: "افعله الآن", bg: "bg-q-do-bg", ink: "text-q-do-ink", dot: "var(--q-do-ink)" },
  { key: "important", title: "مهم غير عاجل", hint: "خطّط له", bg: "bg-q-schedule-bg", ink: "text-q-schedule-ink", dot: "var(--q-schedule-ink)" },
  { key: "urgent", title: "عاجل غير مهم", hint: "فوّضه", bg: "bg-q-delegate-bg", ink: "text-q-delegate-ink", dot: "var(--q-delegate-ink)" },
  { key: "neither", title: "لا مهم ولا عاجل", hint: "أجّله أو احذفه", bg: "bg-q-delete-bg", ink: "text-q-delete-ink", dot: "var(--q-delete-ink)" },
];

export const META_BY_KEY: Record<Quadrant, QuadrantMeta> = Object.fromEntries(
  QUADRANT_META.map((m) => [m.key, m]),
) as Record<Quadrant, QuadrantMeta>;
