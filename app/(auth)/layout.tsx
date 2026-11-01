import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={styles.shell}>
      <section className={styles.panel} aria-labelledby="auth-title">
        {children}
      </section>
    </main>
  );
}
