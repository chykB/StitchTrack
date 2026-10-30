"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthForm from "../_components/AuthForm";
import DraftDocument from "../_components/DraftDocument";
import { focusViewTarget, nextSignupView } from "../../../lib/auth/draft-document";
import type { DocumentKind, SignupView } from "../../../lib/auth/draft-document";
import styles from "../auth.module.css";

import type { DraftTermsPreview } from "../../../lib/auth/terms-preview";
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
    description: null,
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

export default function AuthScreen({ mode, draftPreview }: { mode: AuthMode; draftPreview?: DraftTermsPreview }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const content = copy[mode];
  const [view, setView] = useState<SignupView>("signup");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const previousView = useRef<SignupView>("signup");
  const activeView = nextSignupView(mode, Boolean(draftPreview), view);
  const documentOpen = activeView !== "signup";

  useEffect(() => {
    if (previousView.current !== "signup" && activeView === "signup") focusViewTarget(trigger.current);
    previousView.current = activeView;
  }, [activeView]);

  function openDocument(kind: DocumentKind, initiatingLink?: HTMLButtonElement) {
    if (initiatingLink) trigger.current = initiatingLink;
    setView(nextSignupView(mode, Boolean(draftPreview), kind));
  }

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [mode]);

  const formContent = (
    <>
      <h1 ref={heading} id={documentOpen ? "signup-title" : "auth-title"} tabIndex={-1} className={styles.title}>
        {content.heading}
      </h1>
      {content.description && <p className={styles.description}>{content.description}</p>}
      {/* A mode change discards entered values and the previous unavailable message. */}
      <AuthForm key={mode} mode={mode} buttonLabel={content.button} legend={content.legend}
        hideLegend={mode !== "reset"} unavailableMessage={content.unavailable} draftPreview={draftPreview} onOpenDocument={openDocument} />
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
          Clients access StitchTrack through an invitation from their tailor.
        </p>
      )}
    </>
  );
  if (mode !== "signup" || !draftPreview) return formContent;
  return <>
    {/* Keep the form mounted: values and validation stay only in browser memory. */}
    <div hidden={documentOpen}>{formContent}</div>
    {documentOpen && <DraftDocument kind={activeView} source={draftPreview[activeView]}
      onBack={() => setView("signup")} onDocument={openDocument} />}
  </>;
}
