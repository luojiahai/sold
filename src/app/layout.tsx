import type { Metadata } from "next";
import Link from "next/link";
import { Fira_Code, Fira_Sans } from "next/font/google";
import { Nav } from "./nav";
import "./globals.css";

// Self-hosted by next/font, so no external request and no layout shift.
const sans = Fira_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SOLD — Social-Origin Listing Discovery",
  description:
    "Discover Australian property listing posts on social media before they reach the portals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                SO
              </span>
              <span className="brand-text">
                <b>SOLD</b>
                <span>Social-Origin Listing Discovery</span>
              </span>
            </Link>

            <div>
              <div className="nav-label">Workspace</div>
              <Nav />
            </div>

            <div className="sidebar-foot">
              Prototype · burner-cookie collection breaches Instagram&apos;s Terms of Use.
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
