import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, DM_Mono, Figtree } from "next/font/google";
import { Nav } from "./nav";
import { LiveRunSlot } from "./live-run-slot";
import { ThemeToggle } from "./theme-toggle";
import { readTheme } from "./theme";
import { shellSummary, type ShellSummary } from "./shell-queries";
import "./globals.css";

// Display face for titles and figures. The optical-size axis is what lets one
// family read as a headline at 26px and as a tabular number at 17px.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SOLD — Social-Origin Listing Discovery",
  description:
    "Discover Australian property listing posts on social media before they reach the portals.",
};

const SESSION_TONE: Record<string, string> = {
  active: "ok",
  untested: "warn",
  expired: "bad",
  challenged: "bad",
};

/** Session health, pinned to the bottom of the sidebar. Session death is the most common way a run fails. */
function SessionPill({ session }: { session: ShellSummary["session"] }) {
  if (!session) {
    return (
      <Link href="/sessions" className="session-pill bad">
        <i aria-hidden="true" />
        <span>
          <b>No session</b> · add one to collect
        </span>
      </Link>
    );
  }
  return (
    <Link href="/sessions" className={`session-pill ${SESSION_TONE[session.status] ?? ""}`}>
      <i aria-hidden="true" />
      <span>
        <b>{session.label}</b> · {session.status}
      </span>
    </Link>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // `system` leaves the attribute off entirely, so `prefers-color-scheme`
  // decides. Stamping "system" would break the CSS, which keys off its absence.
  const theme = await readTheme();
  const summary = shellSummary();

  return (
    <html
      lang="en-AU"
      data-theme={theme === "system" ? undefined : theme}
      className={`${bricolage.variable} ${figtree.variable} ${dmMono.variable}`}
    >
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <i aria-hidden="true">S</i>
              <div>
                <b>SOLD</b>
                <span>Listing discovery</span>
              </div>
            </Link>
            <Nav
              badges={{
                "/": summary.verified.toLocaleString("en-AU"),
                "/runs": summary.liveRuns > 0 ? `${summary.liveRuns} live` : undefined,
                "/keywords": summary.enabledTerms.toLocaleString("en-AU"),
                "/sessions": summary.session?.status === "active" ? "active" : undefined,
              }}
            />
            <div className="sidebar-foot">
              <SessionPill session={summary.session} />
              <ThemeToggle current={theme} />
            </div>
          </aside>
          <main className="main">
            <LiveRunSlot />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
