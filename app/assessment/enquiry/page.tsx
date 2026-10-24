import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { assessmentEnabled, isLocalHost } from "../../../lib/assessment/config";
import EnquiryForm from "./EnquiryForm";
import styles from "./enquiry.module.css";

export const metadata: Metadata = {
  title: "Assessment enquiry | StitchTrack",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AssessmentEnquiryPage() {
  if (!assessmentEnabled()) notFound();
  if (!isLocalHost((await headers()).get("host"))) notFound();
  return (
    <main id="main" tabIndex={-1} className={styles.main}>
      <section className={styles.panel} aria-labelledby="enquiry-title">
        <p className={styles.eyebrow}>Task Two assessment</p>
        <h1 id="enquiry-title" className={styles.title}>Tailoring enquiry</h1>
        <p id="assessment-note" className={styles.note}>
          Temporary persistence experiment. Use invented names and synthetic enquiries only.
          This form does not create a customer, order or agreement.
        </p>
        <EnquiryForm />
      </section>
    </main>
  );
}
