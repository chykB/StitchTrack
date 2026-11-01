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

export default function EmailVerificationForm({controller:provided}:{controller?:RegistrationController}={}) {
  const [disabled]=useState(()=>createRegistrationController(createRegistrationClient()));
  const controller=provided??disabled;
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  const live=controller.enabled,busy=live&&state.pending!==null,verified=live&&state.phase==="verified";
  const retry=live&&state.retryUntil!==null&&state.retryUntil>Date.now();
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    const code = readVerificationSubmission(event, ready);
    if (code === null || busy || retry) return;
    const nextError = codeFormatError(code);
    setTouched(true);
    setError(nextError);
    setUnavailable(!live&&!nextError);
    if(live&&!nextError) {
      if(await controller.verify(code)){if(input.current)input.current.value="";}
      else if(controller.getSnapshot().codeError){setError(controller.getSnapshot().codeError!);setFocusInvalid(true);}
    }
    if (nextError) setFocusInvalid(true);
  }

  return (
    <>
      <h1 ref={heading} id="auth-title" tabIndex={-1} className={styles.title}>Verify your email</h1>
      {!verified&&<form method="post" noValidate onSubmit={event=>{void submit(event);}} aria-busy={!ready}
        aria-describedby={live || unavailable ? "verification-feedback" : undefined}>
        <fieldset disabled={!ready||busy||retry} aria-busy={busy||undefined} className={styles.fields}>
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
          {live&&<p className={styles.hint}>Codes expire after five minutes and allow three incorrect attempts.</p>}
          <button type="submit" className={styles.submit}>{state.pending==="verify"?"Checking code...":"Verify email"}</button>
          {live&&<button type="button" className={styles.submit} disabled={state.resendAt!==null&&state.resendAt>Date.now()}
            onClick={()=>{void controller.resend().then(ok=>{if(ok){if(input.current)input.current.value="";setError(undefined);setTouched(false);}});}}>Request another code</button>}
          {live&&state.resendAt!==null&&<p className={styles.hint}>Wait at least 60 seconds before requesting another code.</p>}
        </fieldset>
      </form>}
        <div id="verification-feedback" className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
          {live?<p>{state.message}</p>:unavailable&&<p>{EMAIL_VERIFICATION_UNAVAILABLE}</p>}
        </div>
      <nav className={styles.navigation} aria-label="Account options">
        <p><Link href="/auth?login" prefetch={false} scroll={false}>Back to login</Link></p>
      </nav>
    </>
  );
}
