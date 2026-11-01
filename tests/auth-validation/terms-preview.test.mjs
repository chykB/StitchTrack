import test from "node:test";
import assert from "node:assert/strict";
import { draftPreviewAllowed, loadDraftTermsPreview } from "../../lib/auth/terms-preview.ts";
import {
  initialValidationState, reduceValidation, validateAssessmentForm, visibleErrors, signupSubmissionBlocked,
} from "../../lib/auth/validation.ts";

const enabled = { NODE_ENV: "development", ENABLE_AUTH_TERMS_PREVIEW: "true" };
const values = { email: "tailor+preview@example.com", password: "a valid passphrase" };
const reduce = (s, e, mode = "signup", preview = true) => reduceValidation(mode, s, e, preview);

test("draft preview requires explicit development opt-in and a canonical loopback host", () => {
  for (const host of ["127.0.0.1:3101", "localhost:3000", "LOCALHOST:3000", "[::1]:3000"]) {
    assert.equal(draftPreviewAllowed(enabled, host), true);
  }
  for (const host of [null, "", "example.com", "localhost.example.com", "127.1:3000",
    "localhost:99999", "localhost/", "localhost?x=1", "localhost#x", "user@localhost", " localhost"]) {
    assert.equal(draftPreviewAllowed(enabled, host), false);
  }
  for (const env of [{}, { NODE_ENV: "development" }, { ...enabled, ENABLE_AUTH_TERMS_PREVIEW: "false" },
    { ...enabled, ENABLE_AUTH_TERMS_PREVIEW: "1" }, { ...enabled, NODE_ENV: "production" },
    { ...enabled, NODE_ENV: "test" }]) {
    assert.equal(draftPreviewAllowed(env, "localhost:3000"), false);
  }
});

test("production never loads legal drafts even when the flag is true", async () => {
  let calls = 0;
  const load = async () => { calls++; throw Error("Production must not read drafts"); };
  for (const mode of ["signup", "login", "reset"]) {
    assert.equal(await loadDraftTermsPreview(mode, { ...enabled, NODE_ENV: "production" }, "localhost:3000", load), undefined);
  }
  assert.equal(calls, 0);
});

test("loader returns the original source only for enabled local Signup", async () => {
  const source = { terms: "unchanged terms fixture", privacy: "unchanged privacy fixture" };
  let calls = 0;
  const load = async () => { calls++; return source; };
  assert.equal(await loadDraftTermsPreview("signup", enabled, "127.0.0.1:3101", load), source);
  for (const mode of ["login", "reset"]) {
    assert.equal(await loadDraftTermsPreview(mode, enabled, "127.0.0.1:3101", load), undefined);
  }
  assert.equal(await loadDraftTermsPreview("signup", {}, "localhost:3000", load), undefined);
  assert.equal(await loadDraftTermsPreview("signup", enabled, "example.com", load), undefined);
  assert.equal(calls, 1);
});

test("Signup aria-disabled state requires valid email, password and acknowledgement together", () => {
  let state = initialValidationState();
  assert.equal(state.draftAcknowledged, false);
  assert.equal(signupSubmissionBlocked("signup", state, true), true);
  assert.deepEqual(visibleErrors("signup", state, true), {});
  state = reduce(state, { type: "change", field: "email", value: values.email });
  state = reduce(state, { type: "change", field: "password", value: values.password });
  assert.equal(signupSubmissionBlocked("signup", state, true), true);
  state = reduce(state, { type: "draft-acknowledgement", checked: true });
  assert.equal(signupSubmissionBlocked("signup", state, true), false);
  assert.equal(state.unavailable, false);
  state = reduce(state, { type: "change", field: "email", value: "invalid" });
  assert.equal(signupSubmissionBlocked("signup", state, true), true);
  state = reduce(state, { type: "change", field: "email", value: values.email });
  state = reduce(state, { type: "change", field: "password", value: "short" });
  assert.equal(signupSubmissionBlocked("signup", state, true), true);
  state = reduce(state, { type: "change", field: "password", value: values.password });
  assert.equal(signupSubmissionBlocked("signup", state, true), false);
  state = reduce(state, { type: "draft-acknowledgement", checked: false });
  assert.equal(signupSubmissionBlocked("signup", state, true), true);
});

test("incomplete submission is rejected even with valid credentials", () => {
  const state = reduce(initialValidationState(), { type: "submit", values, draftAcknowledged: false });
  assert.equal(state.unavailable, false);
  assert.ok(visibleErrors("signup", state, true).draftAcknowledgement);
  assert.equal(signupSubmissionBlocked("signup", state, true), true);
});

test("local acknowledgement does not create success and correction clears its error", () => {
  let state = reduce(initialValidationState(), { type: "draft-acknowledgement-blur" });
  assert.ok(visibleErrors("signup", state, true).draftAcknowledgement);
  state = reduce(state, { type: "draft-acknowledgement", checked: true });
  assert.equal(visibleErrors("signup", state, true).draftAcknowledgement, undefined);
  assert.equal(state.unavailable, false);
  state = reduce(state, { type: "submit", values, draftAcknowledged: true });
  assert.equal(state.unavailable, true); // Existing truthful unavailable response, not success.
  state = reduce(state, { type: "draft-acknowledgement", checked: false });
  assert.equal(state.unavailable, false);
  assert.ok(visibleErrors("signup", state, true).draftAcknowledgement);
});

test("missing DOM acknowledgement cannot reuse a previously checked state", () => {
  let state = reduce(initialValidationState(), { type: "draft-acknowledgement", checked: true });
  state = reduce(state, { type: "submit", values, draftAcknowledged: false });
  assert.equal(state.draftAcknowledged, false);
  assert.equal(state.unavailable, false);
});

test("Login/Reset are unaffected; default-off Signup checks credentials without a draft acknowledgement", () => {
  for (const mode of ["login", "reset"]) {
    assert.equal(validateAssessmentForm(mode, values, false, true).draftAcknowledgement, undefined);
    assert.equal(signupSubmissionBlocked(mode, initialValidationState(), true), false);
    assert.equal(reduce(initialValidationState(), { type: "submit", values }, mode, true).unavailable, true);
  }
  assert.equal(validateAssessmentForm("signup", values, false, false).draftAcknowledgement, undefined);
  assert.equal(signupSubmissionBlocked("signup", initialValidationState(), false), true);
  assert.equal(signupSubmissionBlocked("signup", { ...initialValidationState(), values }, false), false);
  assert.equal(reduce(initialValidationState(), { type: "submit", values }, "signup", false).unavailable, true);
});
