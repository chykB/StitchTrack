"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { confirmedReceipt } from "../../../lib/assessment/enquiry";
import type { Receipt } from "../../../lib/assessment/enquiry";
import styles from "./enquiry.module.css";

type Failure = { message: string; requestId?: string; fields?: Record<string, string> };

export default function EnquiryForm() {
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setReceipt(null);
    setFailure(null);
    try {
      const response = await fetch("/api/assessment/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), enquiry: data.get("enquiry") }),
        cache: "no-store",
      });
      const body: unknown = await response.json();
      const confirmed = confirmedReceipt(response.status, body);
      if (confirmed) {
        setReceipt(confirmed);
      } else {
        const error = body && typeof body === "object"
          ? body as { error?: unknown; requestId?: unknown; fields?: unknown } : {};
        const fields: Record<string, string> = {};
        if (error.fields && typeof error.fields === "object") {
          for (const key of ["name", "enquiry"]) {
            const message = (error.fields as Record<string, unknown>)[key];
            if (typeof message === "string") fields[key] = message;
          }
        }
        setFailure({
          message: typeof error.error === "string" ? error.error : "Success could not be confirmed. Check the request before retrying.",
          requestId: typeof error.requestId === "string" ? error.requestId : undefined,
          fields,
        });
      }
    } catch {
      setFailure({ message: "Success could not be confirmed. Check server logs before retrying." });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} aria-describedby="assessment-note" aria-busy={pending}>
      <fieldset className={styles.fields} disabled={pending}>
        <legend className={styles.legend}>Synthetic enquiry details</legend>
        <div className={styles.field}>
          <label htmlFor="assessment-name">Name</label>
          <input id="assessment-name" name="name" autoComplete="off" required minLength={2} maxLength={80}
            aria-invalid={Boolean(failure?.fields?.name)}
            aria-describedby={failure?.fields?.name ? "name-error" : undefined} />
          {failure?.fields?.name && <p id="name-error" className={styles.fieldError}>{failure.fields.name}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="assessment-enquiry">Tailoring enquiry</label>
          <textarea id="assessment-enquiry" name="enquiry" rows={5} required minLength={10} maxLength={500}
            aria-invalid={Boolean(failure?.fields?.enquiry)}
            aria-describedby={failure?.fields?.enquiry ? "enquiry-error" : undefined} />
          {failure?.fields?.enquiry && <p id="enquiry-error" className={styles.fieldError}>{failure.fields.enquiry}</p>}
        </div>
        <button className={styles.submit} type="submit">{pending ? "Saving..." : "Save test enquiry"}</button>
      </fieldset>
      <div aria-live="polite" aria-atomic="true">
        {receipt && <div className={styles.success} role="status">
          <strong>Test enquiry saved.</strong>
          <dl>
            <dt>Database ID</dt><dd>{receipt.id}</dd>
            <dt>Request ID</dt><dd>{receipt.requestId}</dd>
            <dt>Created at (UTC)</dt><dd><time dateTime={receipt.createdAt}>{receipt.createdAt}</time></dd>
          </dl>
        </div>}
      </div>
      {failure && <div className={styles.error} role="alert">
        <p>{failure.message}</p>
        {failure.requestId && <p>Request ID: {failure.requestId}</p>}
      </div>}
    </form>
  );
}
