import type { AuthMode } from "./state";
import type { ZodType } from "zod";
import {
  nameSchema, emailSchema, signupPasswordSchema, loginPasswordSchema,
  signupSchema, loginSchema, resetSchema, PASSWORD_GUIDANCE,
} from "./schemas.ts";
export { PASSWORD_MIN, PASSWORD_GUIDANCE } from "./schemas.ts";

export type AuthField = "name" | "email" | "password";
export type AuthValues = { name?: string; email: string; password: string };
export type AuthErrors = Partial<Record<AuthField | "draftAcknowledgement", string>>;

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

function firstFieldError(schema: ZodType<string>, value: string): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export function nameError(value: string): string | undefined {
  return firstFieldError(nameSchema, value);
}

export function emailError(value: string): string | undefined {
  return firstFieldError(emailSchema, value);
}

export function passwordError(mode: AuthMode, value: string): string | undefined {
  if (mode === "reset") return;
  return firstFieldError(mode === "signup" ? signupPasswordSchema : loginPasswordSchema, value);
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
  // Project the known UI fields. Future HTTP boundaries must parse their full
  // unknown request with the strict schema and use its successful data output.
  const result = mode === "signup" ? signupSchema.safeParse({
    name: values.name ?? "", email: values.email, password: values.password,
  }) : mode === "login" ? loginSchema.safeParse({ email: values.email, password: values.password }) :
    resetSchema.safeParse({ email: values.email });
  const errors: AuthErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if ((field === "name" || field === "email" || field === "password") && !errors[field]) {
        errors[field] = issue.message;
      }
    }
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
