import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type HeaderLink = { href: string; label: string; icon: React.ReactNode };

/** Sticky page header used by the habits screens (same look as the archive / notepad headers). */
export default function PageHeader({
  icon,
  title,
  subtitle,
  links = [],
  wide = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  links?: HeaderLink[];
  wide?: boolean;
}) {
  const pill = "flex items-center gap-1.5 rounded-full bg-surface-2 border border-line text-ink px-3 py-2 text-sm hover:border-accent transition whitespace-nowrap";
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-bg/80 border-b border-line">
      <div className={`${wide ? "max-w-5xl" : "max-w-3xl"} mx-auto px-4 py-3 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-accent shrink-0">{icon}</span>
          <div className="leading-tight min-w-0">
            <h1 dir="auto" className="font-heading text-xl text-ink truncate">{title}</h1>
            {subtitle && <p dir="auto" className="text-[11px] text-ink-soft -mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <nav className="flex items-center gap-2 shrink-0">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={pill} title={l.label} aria-label={l.label}>
              {l.icon} <span className="hidden sm:inline">{l.label}</span>
            </Link>
          ))}
          <Link href="/" className={pill}>
            يومي <ArrowRight size={16} aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}
