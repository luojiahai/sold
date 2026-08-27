"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const LINKS = [
  {
    href: "/",
    label: "Feed",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON} aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/runs",
    label: "Runs",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON} aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    ),
  },
  {
    href: "/keywords",
    label: "Seed terms",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON} aria-hidden="true">
        <path d="M5 3v18M19 3v18M3 8.5h18M3 15.5h18" />
      </svg>
    ),
  },
  {
    href: "/sessions",
    label: "Sessions",
    icon: (
      <svg viewBox="0 0 24 24" {...ICON} aria-hidden="true">
        <rect x="3" y="10.5" width="18" height="10.5" rx="2" />
        <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
      </svg>
    ),
  },
];

/**
 * Section links with a figure beside each: verified listings, live runs,
 * enabled terms, session health. The figures come from the server so the
 * sidebar is right on first paint.
 */
export function Nav({ badges }: { badges: Record<string, string | undefined> }) {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Sections">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-active={
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
          }
        >
          {link.icon}
          {link.label}
          {badges[link.href] && <span className="count">{badges[link.href]}</span>}
        </Link>
      ))}
    </nav>
  );
}
