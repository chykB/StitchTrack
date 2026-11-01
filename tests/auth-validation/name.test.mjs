import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthScreen, FormField, handleLocalSubmit, readLocalSubmission } from "./rendering.mjs";
import {
  nameError, initialValidationState, reduceValidation, visibleErrors,
  validateAssessmentForm, signupSubmissionBlocked,
} from "../../lib/auth/validation.ts";

const credentials = { email: "synthetic@example.com", password: " synthetic passphrase " };
const field = {
  id: "signup-name", name: "name", type: "text", label: "Your name", autoComplete: "name",
  onChange() {}, onBlur() {},
};

test("name rejects empty and Unicode-whitespace-only values without imposing name formats", () => {
  for (const value of ["", " ", "\t\n", "\u0085", "\u00a0\u2003"]) {
    assert.equal(nameError(value), "Enter your name.");
  }
  for (const value of ["A", "Ọlá", "李", "O'Neill", "Anne-Marie", "  A  B  ", "A".repeat(300)]) {
    assert.equal(nameError(value), undefined);
    const state = reduceValidation("signup", initialValidationState(), { type: "change", field: "name", value });
    assert.equal(state.values.name, value);
  }
});

test("name feedback waits for blur or submit, clears on correction and reappears when blank", () => {
  let state = initialValidationState();
  assert.deepEqual(visibleErrors("signup", state), {});
  state = reduceValidation("signup", state, { type: "change", field: "name", value: " " });
  assert.equal(visibleErrors("signup", state).name, undefined);
  state = reduceValidation("signup", state, { type: "blur", field: "name", value: " " });
  assert.equal(visibleErrors("signup", state).name, "Enter your name.");
  const invalid = renderToStaticMarkup(createElement(FormField, {
    ...field, value: state.values.name, error: visibleErrors("signup", state).name,
  }));
  assert.match(invalid, /for="signup-name"/);
  assert.match(invalid, /aria-invalid="true"/);
  assert.match(invalid, /aria-describedby="signup-name-error"/);
  assert.match(invalid, /id="signup-name-error"/);
  assert.match(invalid, /<svg[^>]*aria-hidden="true"/);
  assert.match(invalid, /Enter your name\./);
  assert.doesNotMatch(invalid, /role="alert"|aria-live=/);
  state = reduceValidation("signup", state, { type: "change", field: "name", value: " Ọlá " });
  assert.equal(state.values.name, " Ọlá ");
  assert.equal(visibleErrors("signup", state).name, undefined);
  const corrected = renderToStaticMarkup(createElement(FormField, {
    ...field, value: state.values.name, error: visibleErrors("signup", state).name,
  }));
  assert.doesNotMatch(corrected, /aria-invalid=|aria-describedby=|signup-name-error/);
  state = reduceValidation("signup", state, { type: "change", field: "name", value: "" });
  assert.equal(visibleErrors("signup", state).name, "Enter your name.");
});

test("only Signup requires name, and missing name blocks the complete form", () => {
  for (const name of [undefined, "", "   "]) {
    assert.equal(validateAssessmentForm("signup", { ...credentials, name }, true).name, "Enter your name.");
    for (const mode of ["login", "reset"]) {
      assert.deepEqual(validateAssessmentForm(mode, { ...credentials, name }, false, true), {});
    }
  }
  assert.equal(signupSubmissionBlocked("signup", { ...initialValidationState(), values: credentials }), true);
  assert.equal(signupSubmissionBlocked("signup", {
    ...initialValidationState(), values: { ...credentials, name: "Synthetic Tailor" },
  }), false);
});

test("Signup renders Your name first with native semantics and hydration protection; other views stay unchanged", () => {
  const signup = renderToStaticMarkup(createElement(AuthScreen, { mode: "signup" }));
  assert.match(signup, /<label for="signup-name">Your name<\/label>/);
  const input = /<input[^>]*id="signup-name"[^>]*>/.exec(signup)[0];
  assert.match(input, /name="name"/);
  assert.match(input, /type="text"/);
  assert.match(input, /autoComplete="name"/i);
  assert.match(input, /autoCapitalize="words"/i);
  assert.match(input, /required/);
  assert.doesNotMatch(input, /minlength|maxlength|pattern=|aria-invalid=|aria-describedby=/i);
  assert.ok(signup.indexOf('id="signup-name"') < signup.indexOf('id="signup-email"'));
  assert.match(signup, /<fieldset[^>]*disabled[^>]*>[\s\S]*id="signup-name"[\s\S]*<\/fieldset>/);
  assert.match(signup, /<legend class="visuallyHidden">Account details<\/legend>/);
  assert.doesNotMatch(signup, /<form[^>]*action=|businessName|Business name/);
  for (const mode of ["login", "reset"]) {
    const html = renderToStaticMarkup(createElement(AuthScreen, { mode }));
    assert.doesNotMatch(html, /signup-name|name="name"|Your name/);
    assert.equal((html.match(/<input\b/g) || []).length, mode === "login" ? 2 : 1);
  }
});

function submission(values) {
  let prevented = false, focused;
  const elements = Object.fromEntries(Object.entries(values).map(([name, value]) =>
    [name, { value, focus() { focused = name; } }]));
  return {
    event: {
      preventDefault() { prevented = true; },
      currentTarget: { elements: { namedItem(name) {
        assert.equal(prevented, true);
        return elements[name] ?? null;
      } }, submit() { assert.fail("No native submission"); } },
    },
    focused: () => focused,
    prevented: () => prevented,
  };
}

test("submission cancels navigation, focuses name before other errors and cannot reuse an omitted name", t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No authentication request"));
  t.mock.method(console, "log", () => assert.fail("No value logging"));
  for (const values of [{ email: "", password: "", name: "" }, { ...credentials, name: "  " }, credentials]) {
    const fixture = submission(values);
    let state = { ...initialValidationState(), values: { ...credentials, name: "Previously entered" } };
    handleLocalSubmit(fixture.event, true, "signup", false, event => {
      state = reduceValidation("signup", state, event);
    });
    assert.equal(fixture.prevented(), true);
    assert.equal(state.unavailable, false);
    assert.equal(visibleErrors("signup", state).name, "Enter your name.");
    assert.equal(fixture.focused(), Object.hasOwn(values, "name") ? "name" : undefined);
  }
});

test("valid name preserves all entered values and yields only the UI-only unavailable state", t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No credential transmission"));
  t.mock.method(console, "log", () => assert.fail("No value logging"));
  t.mock.method(console, "info", () => assert.fail("No value logging"));
  const values = { name: " Ọlá O'Neill ", ...credentials };
  const fixture = submission(values);
  assert.deepEqual(readLocalSubmission(fixture.event, true), values);
  let state = initialValidationState();
  handleLocalSubmit(fixture.event, true, "signup", false, event => {
    state = reduceValidation("signup", state, event);
  });
  assert.deepEqual(state.values, values);
  assert.equal(state.unavailable, true);
  assert.deepEqual(visibleErrors("signup", state), {});
  assert.equal(fixture.focused(), undefined);
  state = reduceValidation("signup", state, { type: "change", field: "name", value: values.name });
  assert.equal(state.unavailable, false);
});

test("name cannot be read or submitted before hydration", () => {
  let prevented = false;
  handleLocalSubmit({
    preventDefault() { prevented = true; },
    get currentTarget() { assert.fail("Pre-hydration values must remain unread"); },
  }, false, "signup", false, () => assert.fail("No pre-hydration dispatch"));
  assert.equal(prevented, true);
});
