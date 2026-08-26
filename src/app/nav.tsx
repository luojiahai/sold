"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 16px stroke icons, inline so the nav costs no extra request. */
const ICONS: Record<string, React.ReactNode> = {
  feed: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  runs: (
    <>
      <path d="M3 12h4l3 7 4-14 3 7h4" />
    </>
  ),
  keywords: (
    <>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </>
  ),
  sessions: (
    <>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

const LINKS = [
  { href: "/", label: "Feed", icon: "feed" },
  { href: "/runs", label: "Runs", icon: "runs" },
  { href: "/keywords", label: "Keywords", icon: "keywords" },
  { href: "/sessions", label: "Sessions", icon: "sessions" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[link.icon]}
            </svg>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
