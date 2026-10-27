"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { codeFormatError, EMAIL_VERIFICATION_UNAVAILABLE } from "../../../lib/auth/email-code";
import EmailCodeField from "./EmailCodeField";
import styles from "../auth.module.css";

// Cancel native submission before reading anything. No server action or authentication call.
export function readVerificationSubmission(
  event: Pick<FormEvent<HTMLFormElement>, "preventDefault" | "currentTarget">, ready: boolean,
): string | null {
  event.preventDefault();
  if (!ready) return null;
  return (event.currentTarget.elements.namedItem("code") as HTMLInputElement | null)?.value ?? "";
}

export default function EmailVerificationForm() {
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [focusInvalid, setFocusInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setReady(true); heading.current?.focus({ preventScroll: true }); }, []);
  // Focus after the associated error has committed, rather than before React renders it.
  useEffect(() => {
    if (focusInvalid) { input.current?.focus(); setFocusInvalid(false); }
  }, [focusInvalid]);

  function submit(event: FormEvent<HTMLFormElement>) {
    const code = readVerificationSubmission(event, ready);
    if (code === null) return;
    const nextError = codeFormatError(code);
    setTouched(true);
    setError(nextError);
    setUnavailable(!nextError);
    if (nextError) setFocusInvalid(true);
  }

  return (
    <>
      <h1 ref={heading} id="auth-title" tabIndex={-1} className={styles.title}>Verify your email</h1>
      <form method="post" noValidate onSubmit={submit} aria-busy={!ready}
        aria-describedby={unavailable ? "verification-feedback" : undefined}>
        <fieldset disabled={!ready} className={styles.fields}>
          <legend className={styles.visuallyHidden}>Email verification</legend>
          <EmailCodeField inputRef={input} error={error}
            onChange={event => {
              setUnavailable(false);
              if (touched) setError(codeFormatError(event.currentTarget.value));
            }}
            onBlur={event => {
              setTouched(true);
              setError(codeFormatError(event.currentTarget.value));
            }} />
          <button type="submit" className={styles.submit}>Verify email</button>
        </fieldset>
        <div id="verification-feedback" className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
          {unavailable && <p>{EMAIL_VERIFICATION_UNAVAILABLE}</p>}
        </div>
      </form>
      <nav className={styles.navigation} aria-label="Account options">
        <p><Link href="/auth?login" prefetch={false} scroll={false}>Back to login</Link></p>
      </nav>
    </>
  );
}
