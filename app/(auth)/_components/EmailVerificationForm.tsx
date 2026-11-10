"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { codeFormatError, EMAIL_VERIFICATION_UNAVAILABLE } from "../../../lib/auth/email-code";
import {createRegistrationClient} from "../../../lib/auth/registration-client.ts";
import {createRegistrationController,type RegistrationController} from "../../../lib/auth/registration-controller.ts";
import EmailCodeField from "./EmailCodeField";
import styles from "../auth.module.css";

// Cancel native submission before reading anything, including before hydration.
export function readVerificationSubmission(
  event: Pick<FormEvent<HTMLFormElement>, "preventDefault" | "currentTarget">, ready: boolean,
): string | null {
  event.preventDefault();
  if (!ready) return null;
  return (event.currentTarget.elements.namedItem("code") as HTMLInputElement | null)?.value ?? "";
}

export default function EmailVerificationForm({controller:provided,inline=false,onReturnToSignup}:{controller?:RegistrationController;inline?:boolean;onReturnToSignup?:()=>void}={}) {
  const [disabled]=useState(()=>createRegistrationController(createRegistrationClient()));
  const controller=provided??disabled;
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  const live=controller.enabled,busy=live&&state.pending!==null,verified=live&&state.phase==="verified";
  const retry=live&&state.retryUntil!==null&&state.retryUntil>Date.now();
  const [ready, setReady] = useState(false);
  const [codeValid,setCodeValid]=useState(false);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    const code = readVerificationSubmission(event, ready);
    if (code === null || busy || retry) return;
    const nextError = codeFormatError(code);
    setTouched(true);
    setError(nextError);
    setUnavailable(!live&&!nextError);
    if(live&&!nextError) {
      if(await controller.verify(code)){if(input.current)input.current.value="";setCodeValid(false);}
      else if(controller.getSnapshot().codeError){setError(controller.getSnapshot().codeError!);setFocusInvalid(true);}
    }
    if (nextError) setFocusInvalid(true);
  }

  const headingId="auth-title";
  const feedback=<div id="verification-feedback" className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
    {live?<p>{state.message}</p>:unavailable&&<p>{EMAIL_VERIFICATION_UNAVAILABLE}</p>}
  </div>;
  return (
    <section className={inline?styles.inlineVerification:undefined} aria-labelledby={headingId}>
      {!inline&&<h1 ref={heading} id={headingId} tabIndex={-1} className={styles.title}>Verify your email</h1>}
      {inline&&feedback}
      {!verified&&<form method="post" noValidate onSubmit={event=>{void submit(event);}} aria-busy={!ready}
        aria-describedby={live || unavailable ? "verification-feedback" : undefined}>
        <fieldset disabled={!ready||busy||retry} aria-busy={busy||undefined} className={styles.fields}>
          <legend className={styles.visuallyHidden}>Email verification</legend>
          <EmailCodeField inputRef={input} error={error}
            onChange={event => {
              setUnavailable(false);
              setCodeValid(!codeFormatError(event.currentTarget.value));
              if (touched) setError(codeFormatError(event.currentTarget.value));
            }}
            onBlur={event => {
              setTouched(true);
              setCodeValid(!codeFormatError(event.currentTarget.value));
              setError(codeFormatError(event.currentTarget.value));
            }} />
          <div className={styles.verificationActions}>
            <button type="submit" className={styles.submit} disabled={!ready||!live||busy||retry||!codeValid}>{state.pending==="verify"?"Checking code...":"Verify email"}</button>
            {live&&<button type="button" className={styles.submit} disabled={!ready||busy||retry||state.resendAt!==null&&state.resendAt>Date.now()}
              onClick={()=>{void controller.resend().then(ok=>{if(ok){if(input.current)input.current.value="";setCodeValid(false);setError(undefined);setTouched(false);}});}}>Request another code</button>}
          </div>
          {live&&state.resendAt!==null&&<p className={styles.hint}>Wait at least 60 seconds before requesting another code.</p>}
        </fieldset>
      </form>}
      {!inline&&feedback}
      <nav className={styles.navigation} aria-label="Account options">
        {inline&&!verified&&onReturnToSignup&&<p><button type="button" className={styles.documentLink} disabled={busy} onClick={onReturnToSignup}>Back to signup</button></p>}
        <p>{inline?<>Already have an account? <Link href="/auth?login" prefetch={false} scroll={false}>Sign in</Link>.</>:<Link href="/auth?login" prefetch={false} scroll={false}>Back to login</Link>}</p>
      </nav>
    </section>
  );
}
