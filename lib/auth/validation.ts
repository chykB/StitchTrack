import type { AuthMode } from "./state";

export type AuthField = "name" | "email" | "password";
export type AuthValues = { name?: string; email: string; password: string };
export type AuthErrors = Partial<Record<AuthField | "draftAcknowledgement", string>>;
export const PASSWORD_MIN = 12;
export const PASSWORD_GUIDANCE =
  "Use at least 12 characters. Letters, numbers, symbols and spaces are allowed.";

export type ValidationState = {
  values: AuthValues;
  touched: Partial<Record<AuthField, boolean>>;
  edited: Partial<Record<AuthField, boolean>>;
  submitted: boolean;
  emailFormatActive: boolean;
  unavailable: boolean;
  draftAcknowledged: boolean;
  draftAcknowledgementTouched: boolean;
};
export type ValidationEvent =
  | { type: "change" | "blur"; field: AuthField; value: string }
  | { type: "submit"; values: AuthValues; draftAcknowledged?: boolean }
  | { type: "draft-acknowledgement"; checked: boolean }
  | { type: "draft-acknowledgement-blur" };

export function initialValidationState(): ValidationState {
  return {
    values: { email: "", password: "" },
    touched: {}, edited: {}, submitted: false, emailFormatActive: false, unavailable: false,
    draftAcknowledged: false, draftAcknowledgementTouched: false,
  };
}

export function nameError(value: string): string | undefined {
  // Check blankness only; preserve spelling, punctuation and spacing.
  if (/^[\s\p{White_Space}]*$/u.test(value)) return "Enter your name.";
}

export function emailError(value: string): string | undefined {
  // Ignore surrounding email whitespace for this syntax check only; preserve the input.
  const email = value.trim();
  if (!email) return "Enter your email address.";
  // Deliberately a basic public-email shape check, not an RFC parser or ownership proof.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return "Enter an email address like you@example.com.";
  }
}

export function passwordError(mode: AuthMode, value: string): string | undefined {
  if (mode === "reset") return;
  if (!value) return "Enter your password.";
  if (mode !== "signup") return;
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) {
    return "Remove tabs, line breaks or other control characters from your password.";
  }
  if (/^[\s\p{White_Space}]+$/u.test(value)) return "Choose a password that is not only whitespace.";
  const length = Array.from(value).length;
  if (length < PASSWORD_MIN) return PASSWORD_GUIDANCE;
}

export function passwordGuidance(mode: AuthMode, state: ValidationState): string | undefined {
  const started = state.edited.password || state.values.password.length > 0;
  return mode === "signup" && started && passwordError(mode, state.values.password) ?
    PASSWORD_GUIDANCE : undefined;
}

export function passwordSpaceNotice(mode: AuthMode, value: string): string | undefined {
  if (mode === "signup" && !passwordError(mode, value) &&
      (value.startsWith(" ") || value.endsWith(" "))) {
    return "Your password starts or ends with a space. It will be kept exactly as entered.";
  }
}

// Credential-only checks retained for the historical synthetic attack fixture.
// Complete UI form requirements, including the approved name, are composed below.
export function validateAuthValues(mode: AuthMode, values: AuthValues): AuthErrors {
  const errors: AuthErrors = {};
  const email = emailError(values.email);
  const password = passwordError(mode, values.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}

export function validateAssessmentForm(
  mode: AuthMode, values: AuthValues, acknowledged: boolean, requireDraftAcknowledgement = false,
): AuthErrors {
  const errors = validateAuthValues(mode, values);
  if (mode === "signup") {
    const name = nameError(values.name ?? "");
    if (name) errors.name = name;
  }
  if (mode === "signup" && requireDraftAcknowledgement && acknowledged !== true) {
    errors.draftAcknowledgement = "Review the draft Platform Terms before continuing.";
  }
  return errors;
}

export function signupSubmissionBlocked(mode: AuthMode, state: ValidationState, requireDraftAcknowledgement = false): boolean {
  return mode === "signup" &&
    Object.keys(validateAssessmentForm(mode, state.values, state.draftAcknowledged, requireDraftAcknowledgement)).length > 0;
}

export function visibleErrors(mode: AuthMode, state: ValidationState, requireDraftAcknowledgement = false): AuthErrors {
  const all = validateAssessmentForm(mode, state.values, state.draftAcknowledged, requireDraftAcknowledgement);
  const errors: AuthErrors = {};
  if (mode === "signup" && (state.touched.name || state.submitted) && all.name) {
    errors.name = all.name;
  }
  const emailVisible = mode === "signup" ?
    state.submitted || state.edited.email || state.touched.email :
    state.emailFormatActive || (!state.values.email.trim() && (state.touched.email || state.submitted));
  if (emailVisible && all.email) errors.email = all.email;
  const passwordVisible = state.submitted || state.touched.password ||
    (mode === "signup" && state.edited.password);
  if (passwordVisible && all.password) errors.password = all.password;
  if ((state.submitted || state.draftAcknowledgementTouched) && all.draftAcknowledgement) {
    errors.draftAcknowledgement = all.draftAcknowledgement;
  }
  return errors;
}

export function reduceValidation(
  mode: AuthMode, state: ValidationState, event: ValidationEvent, requireDraftAcknowledgement = false,
): ValidationState {
  if (event.type === "draft-acknowledgement") {
    return { ...state, draftAcknowledged: event.checked, unavailable: false };
  }
  if (event.type === "draft-acknowledgement-blur") {
    return { ...state, draftAcknowledgementTouched: true };
  }
  if (event.type === "submit") {
    const acknowledged = event.draftAcknowledged ?? state.draftAcknowledged;
    return {
      ...state, values: event.values, submitted: true,
      emailFormatActive: Boolean(emailError(event.values.email)),
      draftAcknowledged: acknowledged,
      unavailable: Object.keys(validateAssessmentForm(mode, event.values, acknowledged, requireDraftAcknowledgement)).length === 0,
    };
  }
  return {
    ...state,
    values: { ...state.values, [event.field]: event.value },
    touched: event.type === "blur" ? { ...state.touched, [event.field]: true } : state.touched,
    edited: event.type === "change" ? { ...state.edited, [event.field]: true } : state.edited,
    emailFormatActive: state.emailFormatActive &&
      !(event.field === "email" && !emailError(event.value)),
    unavailable: false,
  };
}
