import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "StitchTrack | Tailoring orders and agreements",
  description:
    "StitchTrack is a tailoring order and agreement management platform for small fashion studios in Nigeria.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/DM-Sans-variable.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="site-shell">
            <a className="brand" href="/" aria-label="StitchTrack home">
              <span className="brand-mark" aria-hidden="true">
                ST
              </span>
              StitchTrack
            </a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
