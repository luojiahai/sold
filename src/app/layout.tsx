import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "./nav";
import { LiveRunSlot } from "./live-run-slot";
import { ThemeToggle } from "./theme-toggle";
import { readTheme } from "./theme";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SOLD — Social-Origin Listing Discovery",
  description:
    "Discover Australian property listing posts on social media before they reach the portals.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // `system` leaves the attribute off entirely, so `prefers-color-scheme`
  // decides. Stamping "system" would break the CSS, which keys off its absence.
  const theme = await readTheme();

  return (
    <html
      lang="en-AU"
      data-theme={theme === "system" ? undefined : theme}
      className={`${archivo.variable} ${plexMono.variable}`}
    >
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <b>SOLD</b>
              <span>Social-Origin Listing Discovery</span>
            </div>
            <Nav />
            <div className="sidebar-foot">
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
