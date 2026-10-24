import type { Metadata } from "next";
import styles from "./page.module.css";

// Local assessment origin only. No public deployment URL is approved.
export const metadata: Metadata = {
  title: "StitchTrack | Tailoring orders and agreements",
  description:
    "StitchTrack is a tailoring order and agreement management platform for small fashion studios in Nigeria.",
  metadataBase: new URL("http://127.0.0.1:3000"),
  openGraph: {
    type: "website",
    title: "StitchTrack | Tailoring orders and agreements",
    description: "Order and agreement management for Nigerian tailoring studios",
    siteName: "StitchTrack",
    url: "/",
    images: [{
      url: "/stitchtrack-og.png",
      width: 1200,
      height: 630,
      alt: "StitchTrack - tailoring orders and agreements",
    }],
  },
};

export default function HomePage() {
  return (
    <main id="main" className={styles.main} tabIndex={-1}>
      <section className={styles.intro} aria-labelledby="page-title">
        <h1 id="page-title" className={styles.title}>
          Keep tailoring orders and agreements clear
        </h1>
        <p className={styles.description}>
          Order and agreement management for Nigerian tailoring studios
        </p>
      </section>
    </main>
  );
}
