"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import AuthForm from "../_components/AuthForm";
import FormField from "../_components/FormField";
import styles from "../auth.module.css";

import type { AuthMode } from "../../../lib/auth/state";

const copy = {
  signup: {
    heading: "Create your tailor account",
    description: null,
    legend: "Account details",
    button: "Create account",
    unavailable: "Account creation is not available yet.",
  },
  login: {
    heading: "Log in to StitchTrack",
    description: "For tailors and fashion studios.",
    legend: "Login details",
    button: "Log in",
    unavailable: "Login is not available yet.",
  },
  reset: {
    heading: "Reset your password",
    description: "Use the email address for your tailor account.",
    legend: "Reset request",
    button: "Request reset link",
    unavailable: "Password reset is not available yet.",
  },
};

export default function AuthScreen({ mode }: { mode: AuthMode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const content = copy[mode];

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [mode]);

  return (
    <>
      <h1 ref={heading} id="auth-title" tabIndex={-1} className={styles.title}>
        {content.heading}
      </h1>
      {content.description && <p className={styles.description}>{content.description}</p>}
      {/* A mode change discards entered values and the previous unavailable message. */}
      <AuthForm key={mode} buttonLabel={content.button} legend={content.legend}
        hideLegend={mode === "signup"}
        unavailableMessage={content.unavailable}>
        <FormField id={mode + "-email"} name="email" label="Email address"
          type="email" autoComplete="email" />
        {mode !== "reset" && (
          <FormField id={mode + "-password"} name="password" label="Password"
            type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        )}
      </AuthForm>
      <nav className={styles.navigation} aria-label="Account options">
        {mode === "signup" ? (
          <p>Already have an account? <Link href="/auth?login" scroll={false} prefetch={false}>Log in</Link></p>
        ) : (
          <>
            <p>{mode === "login" ? (
              <Link href="/auth?reset" scroll={false} prefetch={false}>Forgot your password?</Link>
            ) : (
              <Link href="/auth?login" scroll={false} prefetch={false}>Back to login</Link>
            )}</p>
            <p>New to StitchTrack? <Link href="/auth?signup" scroll={false} prefetch={false}>Create your tailor account</Link></p>
          </>
        )}
      </nav>
      {mode === "signup" && (
        <p className={styles.clientNote}>
          Clients access their orders through a tailor’s invitation, without creating a password.
        </p>
      )}
    </>
  );
}
