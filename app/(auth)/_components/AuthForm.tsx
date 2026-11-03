"use client";

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { AuthMode } from "../../../lib/auth/state";
import {
  initialValidationState, passwordGuidance, passwordSpaceNotice, reduceValidation, validateAssessmentForm, signupSubmissionBlocked, visibleErrors,
} from "../../../lib/auth/validation";
import type { AuthValues, ValidationEvent, ValidationState } from "../../../lib/auth/validation";
import AccountDeletionForm from "./AccountDeletionForm";
import FormField from "./FormField";
import TermsPreview from "./TermsPreview";
import type { DocumentKind } from "../../../lib/auth/draft-document";
import type { DraftTermsPreview } from "../../../lib/auth/terms-preview";
import {createRegistrationClient} from "../../../lib/auth/registration-client.ts";
import {createRegistrationController,type RegistrationController} from "../../../lib/auth/registration-controller.ts";
import type {RegistrationTerms} from "../../../lib/auth/registration-contract.ts";
import { createLocalSessionClient } from "../../../lib/auth/local-session.ts";
import { createSessionController } from "../../../lib/auth/session-controller.ts";
import type { SessionController, SessionSnapshot } from "../../../lib/auth/session-controller.ts";
import styles from "../auth.module.css";

type AuthFormProps = {
  mode: AuthMode;
  buttonLabel: string;
  unavailableMessage: string;
  legend: string;
  hideLegend?: boolean;
  localSessionOrigin?: string;
  accountDeletionEnabled?:boolean;
  initialEmail?:string;onEmailDraftChange?:(email:string)=>void;
  registrationController?: RegistrationController;
  sessionController?: SessionController; // Injection for reviewed composition/offline tests only.
  draftPreview?: DraftTermsPreview;
  onOpenDocument?: (kind: DocumentKind, trigger: HTMLButtonElement) => void;
};

// Cancel native submission first, including any attempt before the hydration guard opens.
// Read values only into local memory; this helper never requests, stores or logs them.
export function readLocalSubmission(
  event: Pick<FormEvent<HTMLFormElement>, "preventDefault" | "currentTarget">,
  ready: boolean,
): AuthValues | null {
  event.preventDefault();
  if (!ready) return null;
  const fields = event.currentTarget.elements;
  const name = (fields.namedItem("name") as HTMLInputElement | null)?.value;
  return {
    ...(name !== undefined ? { name } : {}),
    email: (fields.namedItem("email") as HTMLInputElement | null)?.value ?? "",
    password: (fields.namedItem("password") as HTMLInputElement | null)?.value ?? "",
  };
}

// All native submit activations share this guard, including implicit Enter and button Enter/Space.
export function handleLocalSubmit(
  event: FormEvent<HTMLFormElement>, ready: boolean, mode: AuthMode,
  requireDraftAcknowledgement: boolean, dispatch: (event: ValidationEvent) => void,
) {
  const values = readLocalSubmission(event, ready);
  if (!values) return;
  const acknowledged = (event.currentTarget.elements.namedItem("draftAcknowledgement") as HTMLInputElement | null)?.checked === true;
  const invalid = validateAssessmentForm(mode, values, acknowledged, requireDraftAcknowledgement);
  dispatch({ type: "submit", values, draftAcknowledged: acknowledged });
  const first = invalid.name ? "name" : invalid.email ? "email" : invalid.password ? "password" :
    invalid.draftAcknowledgement ? "draftAcknowledgement" : null;
  if (first) {
    (event.currentTarget.elements.namedItem(first) as HTMLInputElement | null)?.focus();
  } else return values;
}

export async function submitAuthForm(event: FormEvent<HTMLFormElement>, ready:boolean, mode:AuthMode,
  requireDraftAcknowledgement:boolean, dispatch:(event:ValidationEvent)=>void, controller?:SessionController, rememberEmail?:(email:string)=>void) {
  if(mode === "login" && controller?.enabled && controller.getSnapshot().pending) {event.preventDefault();return false;}
  const values=handleLocalSubmit(event,ready,mode,requireDraftAcknowledgement,dispatch);
  if(mode==="login"&&values)rememberEmail?.(values.email);
  return mode === "login" && controller?.enabled && values ? controller.login({email:values.email,password:values.password}) : false;
}

export async function submitRegistrationForm(event:FormEvent<HTMLFormElement>,ready:boolean,dispatch:(event:ValidationEvent)=>void,
  controller:RegistrationController,termsError:(message:string|undefined)=>void) {
  if(controller.getSnapshot().pending){event.preventDefault();return false;}
  const values=handleLocalSubmit(event,ready,"signup",false,dispatch);
  if(!ready)return false;
  if(controller.consentDeferred){termsError(undefined);return values?controller.signup(values):false;}
  const accepted=(event.currentTarget.elements.namedItem("termsAcceptance") as HTMLInputElement|null)?.checked===true;
  termsError(accepted?undefined:"Accept the Platform Terms before continuing.");
  if(!accepted){if(values)(event.currentTarget.elements.namedItem("termsAcceptance") as HTMLInputElement|null)?.focus();return false;}
  return values?controller.signup({...values,termsAccepted:true,termsVersionId:controller.terms?.id}):false;
}
export function RegistrationTermsControl({terms,checked,error,onChange}:{terms:RegistrationTerms;checked:boolean;error?:string;onChange:(checked:boolean)=>void}) {
  return <div className={styles.draftAcknowledgement}>
    <div className={styles.acknowledgementRow}><label className={styles.checkboxTarget}>
      <input id="signup-terms-acceptance" name="termsAcceptance" type="checkbox" required checked={checked}
        onChange={event=>onChange(event.currentTarget.checked)} aria-invalid={error?true:undefined} aria-describedby={error?"signup-terms-error":undefined} />
      <span className={styles.visuallyHidden}>I accept the Platform Terms, version {terms.version}.</span>
    </label><p>I accept the <a className={styles.documentLink} href={terms.path}>Platform Terms</a>, version {terms.version}.</p></div>
    {error&&<p id="signup-terms-error" className={styles.error}>{error}</p>}
  </div>;
}

export function AuthSessionControls({snapshot,onRefresh,onLogout,ready=true}:{snapshot:SessionSnapshot;onRefresh:()=>void;onLogout:()=>void;ready?:boolean}) {
  if(snapshot.status === "disabled")return null;
  const blocked=!ready||snapshot.pending!==null||snapshot.retryUntil!==null;
  return <section aria-label="Login session">
    {snapshot.session && <p>{snapshot.status === "authenticated" ? "Logged in as " : "Previously logged in as "}{snapshot.session.user.name}.</p>}
    {ready && snapshot.status === "authenticated" && !blocked && snapshot.session?.administration === true &&
      <a className={styles.documentLink} href="/admin">Administration</a>}
    {snapshot.session && <button className={styles.submit} type="button" disabled={blocked} onClick={onLogout}>
      {snapshot.pending === "logout" ? "Logging out..." : "Log out"}</button>}
    {snapshot.status === "unknown" && <button className={styles.submit} type="button" disabled={blocked} onClick={onRefresh}>Check session</button>}
  </section>;
}

export default function AuthForm({
  mode, buttonLabel, unavailableMessage, legend, hideLegend = false, draftPreview, onOpenDocument, sessionController, localSessionOrigin, registrationController,initialEmail,onEmailDraftChange,accountDeletionEnabled,
}: AuthFormProps) {
  const [disabledRegistration]=useState(()=>createRegistrationController(createRegistrationClient()));
  const registration=registrationController??disabledRegistration;
  const signup=useSyncExternalStore(registration.subscribe,registration.getSnapshot,registration.getServerSnapshot);
  const liveSignup=mode==="signup"&&registration.enabled&&(!!registration.terms||registration.consentDeferred);
  const [termsAccepted,setTermsAccepted]=useState(false),[termsError,setTermsError]=useState<string>();
  const preview = mode === "signup" && !liveSignup ? draftPreview : undefined;
  const requireDraftAcknowledgement = Boolean(preview);
  const [ready, setReady] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const localController = useMemo(() => createSessionController(createLocalSessionClient(mode === "login" ? localSessionOrigin : undefined)),
    [mode, localSessionOrigin]);
  const controller=sessionController ?? localController;
  const session=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  const liveLogin=mode === "login" && controller.enabled;
  const busy=liveLogin && session.pending!==null || liveSignup && signup.pending!==null;
  const hidden=liveLogin && (session.status === "authenticated" || session.status === "unknown" && session.session!==null);
  const [state, dispatch] = useReducer(
    (current: ValidationState, event: ValidationEvent | {type:"login-complete"}) => event.type === "login-complete"
      ? {...initialValidationState(),values:{email:current.values.email,password:""}}
      : reduceValidation(mode, current, event, requireDraftAcknowledgement),
    undefined, () => ({...initialValidationState(),values:{...initialValidationState().values,email:initialEmail??""}}),
  );
  const errors = visibleErrors(mode, state, requireDraftAcknowledgement);
  const signupBlocked = signupSubmissionBlocked(mode, state, requireDraftAcknowledgement);
  const fieldFeedback = state.submitted && Object.keys(errors).length ?
      (!errors.name && !errors.email && !errors.password && errors.draftAcknowledgement ? errors.draftAcknowledgement :
        "Check the fields marked with an error.") : "";
  const feedback = liveSignup ? (fieldFeedback || termsError || signup.message) : liveLogin ? (!hidden && fieldFeedback || session.message) : state.unavailable ? unavailableMessage : fieldFeedback;

  useEffect(() => {
    if(!liveLogin)return;
    void controller.refresh();
    const refresh=()=>{void controller.refresh();};
    window.addEventListener("focus",refresh);
    return()=>window.removeEventListener("focus",refresh);
  },[controller,liveLogin]);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <>
    <form method="post" noValidate onSubmit={event => {
      const submitted=liveSignup?submitRegistrationForm(event,ready,dispatch,registration,setTermsError):submitAuthForm(event,ready,mode,requireDraftAcknowledgement,dispatch,controller,onEmailDraftChange);
      void submitted.then(success=>{
        if(success) {dispatch({type:"login-complete"});setPasswordVisible(false);}
      });
    }}
      aria-describedby={feedback ? "auth-feedback" : undefined} aria-busy={!ready}>
      {/* SSR and JavaScript-disabled controls stay inert. No legend inputs. */}
      <fieldset className={styles.fields} disabled={!ready || busy} aria-busy={busy || undefined} hidden={hidden}>
        <legend className={hideLegend ? styles.visuallyHidden : styles.legend}>{legend}</legend>
        {mode === "signup" && (
          <FormField id="signup-name" name="name" label="Your name"
            type="text" autoComplete="name" value={state.values.name ?? ""} error={errors.name}
            onChange={event => dispatch({ type: "change", field: "name", value: event.currentTarget.value })}
            onBlur={event => dispatch({ type: "blur", field: "name", value: event.currentTarget.value })} />
        )}
        <FormField id={mode + "-email"} name="email" label="Email address"
          type="email" autoComplete="email" value={state.values.email} error={errors.email}
          onChange={event => {dispatch({ type: "change", field: "email", value: event.currentTarget.value });onEmailDraftChange?.(event.currentTarget.value);}}
          onBlur={event => dispatch({ type: "blur", field: "email", value: event.currentTarget.value })} />
        {mode !== "reset" && (
          <FormField id={mode + "-password"} name="password" label="Password"
            type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={state.values.password} error={errors.password}
            hint={passwordGuidance(mode, state) ?? passwordSpaceNotice(mode, state.values.password)}
            passwordVisible={passwordVisible}
            onTogglePassword={() => { if (ready) setPasswordVisible(visible => !visible); }}
            onChange={event => dispatch({ type: "change", field: "password", value: event.currentTarget.value })}
            onBlur={event => dispatch({ type: "blur", field: "password", value: event.currentTarget.value })} />
        )}
        {preview && (
          <TermsPreview checked={state.draftAcknowledged} error={errors.draftAcknowledgement}
            onOpenDocument={(kind, trigger) => { if (ready) onOpenDocument?.(kind, trigger); }}
            onChange={checked => dispatch({ type: "draft-acknowledgement", checked })}
            onBlur={() => dispatch({ type: "draft-acknowledgement-blur" })} />
        )}
        {liveSignup&&registration.consentDeferred&&<p className={styles.hint}>Development signup: legal consent is not collected.</p>}
        {liveSignup&&registration.terms&&<RegistrationTermsControl terms={registration.terms} checked={termsAccepted} error={termsError}
          onChange={checked=>{setTermsAccepted(checked);if(checked)setTermsError(undefined);}} />}
        <button className={styles.submit} type="submit"
          disabled={liveLogin && session.retryUntil!==null || liveSignup && signup.retryUntil!==null}
          aria-disabled={mode === "signup" ? signupBlocked || liveSignup&&!registration.consentDeferred&&!termsAccepted : undefined}
          aria-describedby={mode === "signup" && feedback ? "auth-feedback" : undefined}>{liveSignup&&signup.pending==="signup"?"Submitting signup...":liveLogin && session.pending === "login" ? "Logging in..." : buttonLabel}</button>
      </fieldset>
      {liveLogin && <AuthSessionControls snapshot={session} ready={ready} onRefresh={()=>{void controller.refresh();}} onLogout={()=>{void controller.logout();}} />}
      <div id="auth-feedback" className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
        {feedback && <p>{feedback}</p>}
      </div>
    </form>
    {liveLogin&&accountDeletionEnabled&&<AccountDeletionForm controller={controller}/>}
    </>
  );
}
