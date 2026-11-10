"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {useStore} from "zustand";
import {createAuthFlowStore} from "../../../lib/auth/auth-flow-store.ts";
import PasswordResetForm from "../_components/PasswordResetForm";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createLocalSessionClient} from "../../../lib/auth/local-session.ts";
import {createSessionController,type SessionController} from "../../../lib/auth/session-controller.ts";
import {createRegistrationClient,type RegistrationFrontendConfig} from "../../../lib/auth/registration-client.ts";
import {createRegistrationController,type RegistrationController} from "../../../lib/auth/registration-controller.ts";
import EmailVerificationForm from "../_components/EmailVerificationForm";
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
    description: "Log in to access your tailor dashboard.",
    legend: "Login details",
    button: "Sign in",
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

export default function AuthScreen({ mode, draftPreview, localSessionOrigin, registration, registrationController,passwordResetOrigin,approvedDocuments,sessionController }: { mode: AuthMode; sessionController?:SessionController; draftPreview?: DraftTermsPreview; approvedDocuments?: DraftTermsPreview; localSessionOrigin?: string; registration?:RegistrationFrontendConfig; registrationController?:RegistrationController;passwordResetOrigin?:string;accountDeletionEnabled?:boolean }) {
  const router=useRouter();
  const navigateAfterLogin=useCallback((path:string)=>router.replace(path),[router]);
  const loginController=useMemo(()=>sessionController??createSessionController(createLocalSessionClient(mode==="login"?localSessionOrigin:undefined)),[sessionController,mode,localSessionOrigin]);
  const session=useSyncExternalStore(loginController.subscribe,loginController.getSnapshot,loginController.getServerSnapshot);
  const signedIn=mode==="login"&&session.status==="authenticated"&&session.session!==null;
  const uncertainSession=mode==="login"&&session.status==="unknown"&&session.session!==null;
  const [flowStore]=useState(()=>createAuthFlowStore());
  const flow=useStore(flowStore);
  // Next preserves this screen across /auth mode navigation. Follow the current
  // server opt-in instead of retaining the disabled controller from Login.
  // Stable configuration values preserve an in-progress OTP flow on refresh.
  const localRegistration=useMemo(()=>createRegistrationController(createRegistrationClient({configuration:registration})),
    [registration?.origin,registration?.developmentConsentDeferred,registration?.terms?.id,registration?.terms?.version,registration?.terms?.path]);
  const signupController=registrationController??localRegistration;
  const signup=useSyncExternalStore(signupController.subscribe,signupController.getSnapshot,signupController.getServerSnapshot);
  const inlineVerification=mode==="signup"&&signupController.enabled&&signup.phase!=="signup";
  const heading = useRef<HTMLHeadingElement>(null);
  const content = copy[mode];
  const [view, setView] = useState<SignupView>("signup");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const previousView = useRef<SignupView>("signup");
  // Draft previews never activate contractual acceptance. Approved content needs a separate server provider.
  const documents=approvedDocuments??draftPreview;
  const activeView = nextSignupView(mode, Boolean(documents), view);
  const documentOpen = activeView !== "signup";

  useEffect(() => {
    if (previousView.current !== "signup" && activeView === "signup") focusViewTarget(trigger.current);
    previousView.current = activeView;
  }, [activeView]);

  function openDocument(kind: DocumentKind, initiatingLink?: HTMLButtonElement) {
    if (initiatingLink) trigger.current = initiatingLink;
    setView(nextSignupView(mode, Boolean(documents), kind));
  }

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [mode,inlineVerification]);

  const formContent = (
    <>
      <h1 ref={heading} id={documentOpen ? "signup-title" : "auth-title"} tabIndex={-1} className={styles.title}>
        {signedIn?"Opening your dashboard":uncertainSession?"Check your session":inlineVerification?"Verify your account":content.heading}
      </h1>
      {(signedIn||uncertainSession||content.description) && <p className={styles.description}>{signedIn?"Your session is confirmed. Taking you to your workspace.":uncertainSession?"Your sign-in status needs to be checked before continuing.":content.description}</p>}
      {/* A mode change discards entered values and the previous unavailable message. */}
      {inlineVerification ? <EmailVerificationForm controller={signupController} inline onReturnToSignup={()=>signupController.returnToSignup()} /> : <AuthForm key={mode} mode={mode} buttonLabel={content.button} legend={content.legend}
        sessionController={mode==="login"?loginController:undefined}
        onLoginConfirmed={mode==="login"?navigateAfterLogin:undefined}
        localSessionOrigin={mode === "login" ? localSessionOrigin : undefined}
        initialEmail={mode==="login"?flow.email:undefined} onEmailDraftChange={mode==="login"?flow.rememberEmail:undefined}
        registrationController={mode === "signup" ? signupController : undefined}
        hideLegend={mode !== "reset"} unavailableMessage={content.unavailable} draftPreview={draftPreview} approvedDocumentsAvailable={Boolean(approvedDocuments)} onOpenDocument={openDocument} />}
      {!signedIn&&!uncertainSession&&!inlineVerification&&<nav className={styles.navigation} aria-label="Account options">
        {mode === "signup" ? (
          <p>Already have an account? <Link href="/auth?login" scroll={false} prefetch={false}>Sign in</Link></p>
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
      </nav>}
    </>
  );
  if(mode==="reset"&&passwordResetOrigin)return <PasswordResetForm store={flowStore} origin={passwordResetOrigin}/>;
  if (mode !== "signup" || !documents) return formContent;
  return <>
    {/* Keep the form mounted: values and validation stay only in browser memory. */}
    <div hidden={documentOpen}>{formContent}</div>
    {documentOpen && <DraftDocument kind={activeView} source={documents[activeView]}
      onBack={() => setView("signup")} onDocument={openDocument} />}
  </>;
}
