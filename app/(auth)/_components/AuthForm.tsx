"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import styles from "../auth.module.css";

type AuthFormProps = {
  children: ReactNode;
  buttonLabel: string;
  unavailableMessage: string;
  legend: string;
};

export default function AuthForm({
  children, buttonLabel, unavailableMessage, legend,
}: AuthFormProps) {
  const [ready, setReady] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // UI foundation only: do not read, send, persist or log form values.
    event.preventDefault();
    setAttempted(true);
  }

  return (
    <form method="post" noValidate onSubmit={handleSubmit}
      aria-describedby={attempted ? "auth-feedback" : undefined} aria-busy={!ready}>
      {/* SSR and JavaScript-disabled controls stay inert. No legend inputs. */}
      <fieldset className={styles.fields} disabled={!ready}>
        <legend className={styles.legend}>{legend}</legend>
        {children}
        <button className={styles.submit} type="submit">{buttonLabel}</button>
      </fieldset>
      <div id="auth-feedback" className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
        {attempted && <p>{unavailableMessage}</p>}
      </div>
    </form>
  );
}
