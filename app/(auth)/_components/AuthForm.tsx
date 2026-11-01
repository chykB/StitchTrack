"use client";

import { useEffect, useReducer, useState } from "react";
import type { FormEvent } from "react";
import type { AuthMode } from "../../../lib/auth/state";
import {
  initialValidationState, passwordGuidance, passwordSpaceNotice, reduceValidation, validateAssessmentForm, signupSubmissionBlocked, visibleErrors,
} from "../../../lib/auth/validation";
import type { AuthValues, ValidationEvent, ValidationState } from "../../../lib/auth/validation";
import FormField from "./FormField";
import TermsPreview from "./TermsPreview";
import type { DocumentKind } from "../../../lib/auth/draft-document";
import type { DraftTermsPreview } from "../../../lib/auth/terms-preview";
import styles from "../auth.module.css";

type AuthFormProps = {
  mode: AuthMode;
  buttonLabel: string;
  unavailableMessage: string;
  legend: string;
  hideLegend?: boolean;
  draftPreview?: DraftTermsPreview;
  onOpenDocument?: (kind: DocumentKind, trigger: HTMLButtonElement) => void;
};

// Cancel native submission first, including any attempt before the hydration guard opens.
// Values exist only in local UI memory; no requests, storage, logging or sessions.
export function readLocalSubmission(
  event: Pick<FormEvent<HTMLFormElement>, "preventDefault" | "currentTarget">,
  ready: boolean,
): AuthValues | null {
  event.preventDefault();
  if (!ready) return null;
  const fields = event.currentTarget.elements;
  return {
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
  const first = invalid.email ? "email" : invalid.password ? "password" :
    invalid.draftAcknowledgement ? "draftAcknowledgement" : null;
  if (first) {
    (event.currentTarget.elements.namedItem(first) as HTMLInputElement | null)?.focus();
  }
}

export default function AuthForm({
  mode, buttonLabel, unavailableMessage, legend, hideLegend = false, draftPreview, onOpenDocument,
}: AuthFormProps) {
  const preview = mode === "signup" ? draftPreview : undefined;
  const requireDraftAcknowledgement = Boolean(preview);
  const [ready, setReady] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [state, dispatch] = useReducer(
    (current: ValidationState, event: ValidationEvent) => reduceValidation(mode, current, event, requireDraftAcknowledgement),
    undefined, initialValidationState,
  );
  const errors = visibleErrors(mode, state, requireDraftAcknowledgement);
  const signupBlocked = signupSubmissionBlocked(mode, state, requireDraftAcknowledgement);
  const feedback = state.unavailable ? unavailableMessage :
    state.submitted && Object.keys(errors).length ?
      (!errors.email && !errors.password && errors.draftAcknowledgement ? errors.draftAcknowledgement :
        "Check the fields marked with an error.") : "";

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <form method="post" noValidate onSubmit={event => handleLocalSubmit(event, ready, mode, requireDraftAcknowledgement, dispatch)}
      aria-describedby={feedback ? "auth-feedback" : undefined} aria-busy={!ready}>
      {/* SSR and JavaScript-disabled controls stay inert. No legend inputs. */}
      <fieldset className={styles.fields} disabled={!ready}>
        <legend className={hideLegend ? styles.visuallyHidden : styles.legend}>{legend}</legend>
        <FormField id={mode + "-email"} name="email" label="Email address"
          type="email" autoComplete="email" value={state.values.email} error={errors.email}
          onChange={event => dispatch({ type: "change", field: "email", value: event.currentTarget.value })}
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
        <button className={styles.submit} type="submit"
          aria-disabled={mode === "signup" ? signupBlocked : undefined}
          aria-describedby={mode === "signup" && feedback ? "auth-feedback" : undefined}>{buttonLabel}</button>
      </fieldset>
      <div id="auth-feedback" className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
        {feedback && <p>{feedback}</p>}
      </div>
    </form>
  );
}
