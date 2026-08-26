import type { Metadata } from "next";
import { Nav } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOLD — Social-Origin Listing Discovery",
  description:
    "Discover Australian property listing posts on social media before they reach the portals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <b>SOLD</b>
              <span>Social-Origin Listing Discovery</span>
            </div>
            <Nav />
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
