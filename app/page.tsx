import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main id="main" className={styles.main} tabIndex={-1}>
      <section className={styles.intro} aria-labelledby="page-title">
        <p className={styles.eyebrow}>
          Tailoring orders and agreements
        </p>
        <h1 id="page-title" className={styles.title}>
          StitchTrack
        </h1>
        <p className={styles.description}>
          StitchTrack is a tailoring order and agreement management platform for
          small fashion studios in Nigeria.
        </p>
      </section>
    </main>
  );
}
