import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormField, AuthForm, TermsPreview, readLocalSubmission, handleLocalSubmit } from "./rendering.mjs";
import { initialValidationState, reduceValidation, visibleErrors, passwordGuidance, passwordSpaceNotice, passwordError, PASSWORD_GUIDANCE } from "../../lib/auth/validation.ts";

const props = {
  id: "signup-email", name: "email", label: "Email address", type: "email", autoComplete: "email",
  value: "", onChange() {}, onBlur() {},
};

test("blur errors render caution/text and associate the invalid field with its exact error ID", () => {
  const state = reduceValidation("signup", initialValidationState(), { type: "blur", field: "email", value: "" });
  const html = renderToStaticMarkup(createElement(FormField, { ...props, error: visibleErrors("signup", state).email }));
  assert.match(html, /for="signup-email"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="signup-email-error"/);
  assert.match(html, /id="signup-email-error"/);
  assert.match(html, /Enter your email address/);
  assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.doesNotMatch(html, /role="alert"|aria-live=/);
});

test("correction clears invalid state, error markup and stale description references", () => {
  let state = reduceValidation("signup", initialValidationState(), { type: "blur", field: "email", value: "" });
  state = reduceValidation("signup", state, { type: "change", field: "email", value: "tailor+pilot@example.com" });
  const html = renderToStaticMarkup(createElement(FormField, {
    ...props, value: state.values.email, error: visibleErrors("signup", state).email,
  }));
  assert.doesNotMatch(html, /aria-invalid=|aria-describedby=|signup-email-error|<svg/);
});

test("minimum-length feedback shows the exact guidance once with one error association", () => {
  const state = reduceValidation("signup", initialValidationState(), { type: "change", field: "password", value: "short" });
  const html = renderToStaticMarkup(createElement(FormField, {
    ...props, id: "signup-password", name: "password", label: "Password", type: "password",
    autoComplete: "new-password", value: state.values.password,
    hint: passwordGuidance("signup", state), error: visibleErrors("signup", state).password,
  }));
  assert.match(html, /aria-describedby="signup-password-error"/);
  assert.match(html, /id="signup-password-error"/);
  assert.equal(html.split(PASSWORD_GUIDANCE).length - 1, 1);
  assert.equal((html.match(/<svg/g) || []).length, 1);
  assert.doesNotMatch(html, /signup-password-hint|maxLength|maxlength|role="alert"|aria-live=/);
});

test("control characters show one specific error and one required guidance block", () => {
  const state = reduceValidation("signup", initialValidationState(), {
    type: "change", field: "password", value: "abcdef\tghijkl",
  });
  const html = renderToStaticMarkup(createElement(FormField, {
    ...props, id: "signup-password", name: "password", label: "Password", type: "password",
    autoComplete: "new-password", value: state.values.password,
    error: visibleErrors("signup", state).password, hint: passwordGuidance("signup", state),
  }));
  assert.equal(html.split("Remove tabs, line breaks or other control characters from your password.").length - 1, 1);
  assert.equal(html.split(PASSWORD_GUIDANCE).length - 1, 1);
  assert.equal((html.match(/id="signup-password-error"/g) || []).length, 1);
  assert.equal((html.match(/<svg/g) || []).length, 1);
  assert.match(html, /aria-describedby="signup-password-error signup-password-hint"/);
});

test("signup markup drops guidance and errors when valid, then restores both when invalid again", () => {
  let state = initialValidationState();
  for (const [value, invalid] of [["short", true], ["abcdefghijkl", false],
    ["abcdef\tghijkl", true], ["abcdefghijkl", false], ["abcdefghijk", true], ["", true]]) {
    state = reduceValidation("signup", state, { type: "change", field: "password", value });
    const html = renderToStaticMarkup(createElement(FormField, {
      ...props, id: "signup-password", name: "password", label: "Password", type: "password",
      autoComplete: "new-password", value: state.values.password,
      error: visibleErrors("signup", state).password, hint: passwordGuidance("signup", state),
    }));
    assert.equal(html.includes(PASSWORD_GUIDANCE), invalid);
    const separateHint = invalid && visibleErrors("signup", state).password !== PASSWORD_GUIDANCE;
    assert.equal(/id="signup-password-hint"/.test(html), separateHint);
    assert.equal(/id="signup-password-error"/.test(html), invalid);
    assert.equal(/aria-invalid="true"/.test(html), invalid);
    if (!invalid) assert.doesNotMatch(html, /aria-describedby=|<svg/);
  }
});

for (const mode of ["signup", "login", "reset"]) {
  test(mode + ": SSR leaves all controls disabled, grouped and initially error-free without JavaScript", () => {
    const html = renderToStaticMarkup(createElement(AuthForm, {
      mode, buttonLabel: "Continue", unavailableMessage: "Not available yet.",
      legend: { signup: "Account details", login: "Login details", reset: "Reset request" }[mode],
      hideLegend: mode !== "reset",
    }));
    assert.match(html, /<form[^>]*method="post"/);
    assert.match(html, /<form[^>]*noValidate/);
    assert.doesNotMatch(html, /<form[^>]*action=/);
    const fieldset = /<fieldset[^>]*disabled[^>]*>([\s\S]*?)<\/fieldset>/.exec(html);
    assert.ok(fieldset);
    assert.equal((fieldset[1].match(/<input\b/g) || []).length, mode === "signup" ? 3 : mode === "login" ? 2 : 1);
    assert.equal((fieldset[1].match(/<button\b/g) || []).length, mode === "reset" ? 1 : 2);
    assert.equal(/<legend class="visuallyHidden"/.test(html), mode !== "reset");
    if (mode === "login") assert.match(html, /<legend class="visuallyHidden">Login details<\/legend>/);
    assert.doesNotMatch(html, /aria-invalid=|id="[^"]*-error"|id="[^"]*-hint"|type="checkbox"/);
    assert.equal(html.includes('aria-label="Show password"'), mode !== "reset");
    assert.ok(!html.includes('aria-label="Hide password"'));
    assert.match(html, /id="auth-feedback"[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/div>/);
    assert.doesNotMatch(fieldset[1].match(/<legend[^>]*>([\s\S]*?)<\/legend>/)[1], /<(input|button)/);
  });
}

test("submission is canceled before any value read when the hydration guard is closed", () => {
  let prevented = false;
  const event = {
    preventDefault() { prevented = true; },
    get currentTarget() { assert.fail("Must not read credentials before ready"); },
  };
  assert.equal(readLocalSubmission(event, false), null);
  assert.equal(prevented, true);
});

test("ready submission cancels native navigation and reads only local values without network or logs", t => {
  let prevented = false;
  t.mock.method(globalThis, "fetch", () => assert.fail("No credential transmission"));
  t.mock.method(console, "log", () => assert.fail("No credential logging"));
  const values = { email: "synthetic@example.com", password: "synthetic test password" };
  const event = {
    preventDefault() { prevented = true; },
    currentTarget: {
      elements: { namedItem(name) { assert.equal(prevented, true); return { value: values[name] }; } },
      submit() { assert.fail("No native submit"); },
      requestSubmit() { assert.fail("No native requestSubmit"); },
    },
  };
  assert.deepEqual(readLocalSubmission(event, true), values);
  assert.equal(prevented, true);
});
function findElement(node, type) {
  if (!node || typeof node !== "object") return undefined;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findElement(child, type);
    if (found) return found;
  }
}

for (const mode of ["signup", "login"]) {
  test(mode + ": visibility click contract preserves values and uses native keyboard-button semantics", () => {
    let visible = false;
    const value = mode === "signup" ? "short" : " secret passphrase ";
    const fieldProps = {
      ...props, id: mode + "-password", name: "password", label: "Password", type: "password",
      autoComplete: mode === "signup" ? "new-password" : "current-password", value,
      error: passwordError(mode, value),
      hint: mode === "signup" ? PASSWORD_GUIDANCE : undefined,
      onChange() { assert.fail("Toggling must not edit the credential"); },
      onBlur() {},
      onTogglePassword() { visible = !visible; },
    };
    for (const expected of [false, true, false]) {
      assert.equal(visible, expected);
      const tree = FormField({ ...fieldProps, passwordVisible: visible });
      const input = findElement(tree, "input"), button = findElement(tree, "button");
      assert.equal(input.props.type, expected ? "text" : "password");
      assert.equal(input.props.value, value);
      assert.equal(input.props.name, "password");
      assert.equal(input.props.autoComplete, fieldProps.autoComplete);
      assert.equal(input.props["aria-invalid"], mode === "signup" ? true : undefined);
      assert.equal(input.props["aria-describedby"], mode === "signup" ? mode + "-password-error" : undefined);
      assert.equal(button.props.type, "button");
      assert.equal(button.props["aria-label"], expected ? "Hide password" : "Show password");
      assert.equal(button.props["aria-controls"], fieldProps.id);
      assert.equal(button.props.tabIndex, undefined);
      assert.equal(button.props.onKeyDown, undefined); // Native Enter/Space behaviour; no synthetic role.
      assert.equal(button.props.role, undefined);
      assert.equal(button.props.formAction, undefined);
      button.props.onClick();
    }
    assert.equal(fieldProps.value, value);
  });
}

test("valid edge-space note has no invalid state and email fields have no visibility control", () => {
  const value = " abcdefghijkl ";
  const html = renderToStaticMarkup(createElement(FormField, {
    ...props, id: "signup-password", name: "password", type: "password", value,
    autoComplete: "new-password", hint: passwordSpaceNotice("signup", value),
    error: passwordError("signup", value), onTogglePassword() {},
  }));
  assert.match(html, /kept exactly as entered/);
  assert.match(html, /aria-describedby="signup-password-hint"/);
  assert.doesNotMatch(html, /aria-invalid=|signup-password-error/);
  const email = renderToStaticMarkup(createElement(FormField, props));
  assert.doesNotMatch(email, /<button|Show password|Hide password/);
});


// Stage Two: controlled component/SSR and submission-contract checks, not browser evidence.
const draftFixture = { terms: "UNAPPROVED TERMS TEST FIXTURE", privacy: "UNAPPROVED PRIVACY TEST FIXTURE" };

test("enabled Signup renders minimal draft labels and an always-visible native submit", () => {
  const html = renderToStaticMarkup(createElement(AuthForm, {
    mode: "signup", buttonLabel: "Create account", unavailableMessage: "Account creation is not available yet.",
    legend: "Account details", hideLegend: true, draftPreview: draftFixture,
  }));
  const fieldset = /<fieldset[^>]*disabled[^>]*>([\s\S]*?)<\/fieldset>/.exec(html)[1];
  assert.equal((fieldset.match(/<input\b/g) || []).length, 4);
  const checkbox = /<input\b[^>]*type="checkbox"[^>]*>/.exec(fieldset)[0];
  assert.match(checkbox, /name="draftAcknowledgement"/);
  assert.match(checkbox, /required/);
  assert.doesNotMatch(checkbox, /checked=|aria-invalid=/);
  assert.doesNotMatch(checkbox, /aria-describedby=/);
  const submit = /<button[^>]*type="submit"[^>]*>/.exec(fieldset)[0];
  assert.match(submit, /aria-disabled="true"/);
  assert.doesNotMatch(submit, /\s(?:hidden|disabled|tabindex|tabIndex)=|\s(?:hidden|disabled)>/);
  assert.match(html, /I have reviewed the draft Terms and Privacy Policy\./);
  assert.doesNotMatch(html, /Assessment demonstration only|Complete Email and Password|signup-draft-notice|assessment-only|preview mode/i);
  assert.doesNotMatch(html, /UNAPPROVED TERMS TEST FIXTURE|UNAPPROVED PRIVACY TEST FIXTURE|<summary|<details|<pre/);
  assert.match(html, /type="button"[^>]*>Terms<\/button>/);
  assert.match(html, /type="button"[^>]*>Privacy Policy<\/button>/);
  assert.doesNotMatch(html, /role="alert"/);
});

for (const mode of ["login", "reset"]) {
  test(mode + ": ignores draft props and keeps its original controls", () => {
    const props = { mode, buttonLabel: "Continue", unavailableMessage: "Unavailable", legend: "Details" };
    assert.equal(
      renderToStaticMarkup(createElement(AuthForm, { ...props, draftPreview: draftFixture })),
      renderToStaticMarkup(createElement(AuthForm, props)),
    );
  });
}

test("draft checkbox associates only its current error and keeps native keyboard semantics", () => {
  let checked = false, blurred = false;
  const props = {
    draft: draftFixture, checked: false,
    error: "Review the draft Platform Terms before continuing.",
    onChange(value) { checked = value; }, onBlur() { blurred = true; },
  };
  const tree = TermsPreview(props);
  const input = findElement(tree, "input");
  assert.equal(input.props.type, "checkbox");
  assert.equal(input.props.required, true);
  assert.equal(input.props.role, undefined);
  assert.equal(input.props.onKeyDown, undefined);
  input.props.onChange({ currentTarget: { checked: true } });
  input.props.onBlur();
  assert.equal(checked, true);
  assert.equal(blurred, true);
  const html = renderToStaticMarkup(createElement(TermsPreview, props));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="signup-draft-acknowledgement-error"/);
  assert.match(html, /id="signup-draft-acknowledgement-error"/);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html, /aria-live=|role="alert"/);
  const corrected = renderToStaticMarkup(createElement(TermsPreview, { ...props, checked: true, error: undefined }));
  assert.doesNotMatch(corrected, /aria-invalid=|aria-describedby=|signup-draft-acknowledgement-error/);
});

test("complete form guard prevents native submission before hydration without reading fields", () => {
  let prevented = false;
  handleLocalSubmit({ preventDefault() { prevented = true; },
    get currentTarget() { assert.fail("No pre-hydration field reads"); } }, false, "signup", true,
    () => assert.fail("No pre-hydration state dispatch"));
  assert.equal(prevented, true);
});

function submitFixture(values, checked) {
  let prevented = false, focused;
  const fields = { name: { value: values.name ?? "Synthetic Tailor", focus() { focused = "name"; } },
    email: { value: values.email, focus() { focused = "email"; } },
    password: { value: values.password, focus() { focused = "password"; } },
    draftAcknowledgement: { checked, focus() { focused = "draftAcknowledgement"; } } };
  const event = { preventDefault() { prevented = true; }, currentTarget: {
    elements: { namedItem(name) { assert.equal(prevented, true); return fields[name]; } },
    submit() { assert.fail("No native submit"); }, requestSubmit() { assert.fail("No forwarded submit"); },
  } };
  return { event, focused: () => focused, prevented: () => prevented };
}

for (const scenario of [
  { name: "empty email", email: "", password: "valid passphrase", checked: true, first: "email" },
  { name: "malformed email", email: "invalid", password: "valid passphrase", checked: true, first: "email" },
  { name: "invalid password", email: "test@example.com", password: "short", checked: true, first: "password" },
  { name: "unchecked draft", email: "test@example.com", password: "valid passphrase", checked: false, first: "draftAcknowledgement" },
]) {
  test("shared native-submit guard blocks " + scenario.name + " and focuses its associated error", t => {
    t.mock.method(globalThis, "fetch", () => assert.fail("No authentication request"));
    t.mock.method(console, "log", () => assert.fail("No credential log"));
    t.mock.method(console, "info", () => assert.fail("No credential log"));
    for (const submitter of [null, { type: "submit" }]) {
      const fixture = submitFixture(scenario, scenario.checked);
      fixture.event.nativeEvent = { submitter }; // Implicit/programmatic and button-submit contracts.
      let state = initialValidationState();
      handleLocalSubmit(fixture.event, true, "signup", true, event => {
        state = reduceValidation("signup", state, event, true);
      });
      assert.equal(fixture.prevented(), true);
      assert.equal(fixture.focused(), scenario.first);
      assert.equal(state.unavailable, false);
      assert.ok(visibleErrors("signup", state, true)[scenario.first]);
    }
  });
}

test("complete local Signup preserves values and reaches only unavailable feedback", t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No credential transmission"));
  t.mock.method(console, "log", () => assert.fail("No credential log"));
  t.mock.method(console, "info", () => assert.fail("No credential log"));
  const values = { name: "Synthetic Tailor", email: "test+synthetic@example.com", password: " valid passphrase " };
  const fixture = submitFixture(values, true);
  let state = initialValidationState();
  handleLocalSubmit(fixture.event, true, "signup", true, event => {
    state = reduceValidation("signup", state, event, true);
  });
  assert.deepEqual(state.values, values);
  assert.equal(state.unavailable, true);
  assert.equal(fixture.focused(), undefined);
  assert.deepEqual(visibleErrors("signup", state, true), {});
});

for (const mode of ["login", "reset"]) {
  test(mode + ": shared handler keeps existing credential rules and ignores draft acknowledgement", () => {
    const fixture = submitFixture({ email: "test@example.com", password: mode === "login" ? "x" : "" }, false);
    let state = initialValidationState();
    handleLocalSubmit(fixture.event, true, mode, true, event => {
      state = reduceValidation(mode, state, event, true);
    });
    assert.equal(state.unavailable, true);
    assert.equal(fixture.focused(), undefined);
    assert.deepEqual(visibleErrors(mode, state, true), {});
  });
}
