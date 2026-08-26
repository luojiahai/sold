"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/runs", label: "Runs" },
  { href: "/keywords", label: "Keywords" },
  { href: "/sessions", label: "Sessions" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-active={
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
