import test from "node:test";
import assert from "node:assert/strict";
import {
  initialValidationState, reduceValidation, visibleErrors, emailError, passwordError, passwordGuidance, passwordSpaceNotice, PASSWORD_GUIDANCE, validateAuthValues,
} from "../../lib/auth/validation.ts";

const change = (mode, state, field, value) => reduceValidation(mode, state, { type: "change", field, value });
const blur = (mode, state, field, value = "") => reduceValidation(mode, state, { type: "blur", field, value });
const submit = (mode, state, values = state.values) => reduceValidation(mode, state, { type: "submit", values });

for (const mode of ["signup", "login", "reset"]) {
  test(mode + ": no errors or unavailable feedback on arrival", () => {
    const state = initialValidationState();
    assert.deepEqual(visibleErrors(mode, state), {});
    assert.equal(state.unavailable, false);
    assert.equal(state.submitted, false);
  });
  test(mode + ": leaving email empty exposes only its required error", () => {
    const state = blur(mode, initialValidationState(), "email", "  ");
    assert.deepEqual(visibleErrors(mode, state), { email: "Enter your email address." });
    assert.equal(state.unavailable, false);
  });
}

for (const mode of ["signup", "login"]) {
  test(mode + ": leaving password empty shows its required error", () => {
    const state = blur(mode, initialValidationState(), "password");
    assert.deepEqual(visibleErrors(mode, state), { password: "Enter your password." });
  });
}

test("signup email validates from first input and clears immediately when corrected", () => {
  let state = change("signup", initialValidationState(), "email", "a");
  assert.ok(visibleErrors("signup", state).email);
  assert.equal(state.touched.email, undefined);
  state = change("signup", state, "email", "tailor+pilot@example.com");
  assert.deepEqual(visibleErrors("signup", state), {});
  state = change("signup", state, "email", "");
  assert.equal(visibleErrors("signup", state).email, "Enter your email address.");
});

test("email syntax supports plus addresses, subdomains, apostrophes and Unicode without canonicalizing", () => {
  for (const email of ["tailor+orders@example.com", "o'neill@studio.example.ng", "ọlá@example.com", " A+tag@EXAMPLE.com "]) {
    assert.equal(emailError(email), undefined);
    const state = change("signup", initialValidationState(), "email", email);
    assert.equal(state.values.email, email);
  }
});

test("email syntax rejects missing parts, internal whitespace and multiple unquoted at signs", () => {
  for (const email of ["", " ", "@example.com", "a@", "a@example", "a b@example.com", "a@b@example.com", "a@b."]) {
    assert.ok(emailError(email));
  }
});

for (const mode of ["login", "reset"]) {
  test(mode + ": format waits for submission, then correction clears the error", () => {
    let state = change(mode, initialValidationState(), "email", "not-an-email");
    assert.deepEqual(visibleErrors(mode, state), {});
    state = blur(mode, state, "email", "not-an-email");
    assert.deepEqual(visibleErrors(mode, state), {});
    state = submit(mode, state);
    assert.ok(visibleErrors(mode, state).email);
    assert.equal(state.unavailable, false);
    state = change(mode, state, "email", "tailor+pilot@example.com");
    assert.equal(visibleErrors(mode, state).email, undefined);
    state = change(mode, state, "email", "broken");
    assert.equal(visibleErrors(mode, state).email, undefined);
    state = submit(mode, state);
    assert.ok(visibleErrors(mode, state).email);
  });
}

test("signup requires 12 Unicode code points with no current maximum", () => {
  assert.ok(passwordError("signup", "a".repeat(11)));
  for (const length of [12, 128, 129, 1024]) {
    assert.equal(passwordError("signup", "a".repeat(length)), undefined);
  }
  assert.ok(passwordError("signup", "🧵".repeat(11)));
  assert.equal(passwordError("signup", "🧵".repeat(12)), undefined);
  assert.equal(passwordError("signup", "🧵".repeat(129)), undefined);
});

test("signup allows spaces and preserves leading, trailing and internal spaces", () => {
  for (const value of ["abcdefghijkl ", " abcdefghijkl", "abcdef ghijkl", " abcdefghij "]) {
    assert.equal(passwordError("signup", value), undefined);
    const state = change("signup", initialValidationState(), "password", value);
    assert.equal(state.values.password, value);
    assert.equal(visibleErrors("signup", state).password, undefined);
    assert.equal(passwordGuidance("signup", state), undefined);
  }
});

test("signup rejects empty and whitespace-only passwords", () => {
  assert.equal(passwordError("signup", ""), "Enter your password.");
  for (const value of [" ".repeat(12), "\u00a0".repeat(12), "\u2003".repeat(12)]) {
    assert.equal(passwordError("signup", value), "Choose a password that is not only whitespace.");
  }
});

test("signup rejects control characters and line separators wherever encountered without modifying them", () => {
  for (const control of ["\t", "\n", "\r", "\u0000", "\u000b", "\u007f", "\u0085", "\u2028", "\u2029"]) {
    for (const value of [control + "abcdefghijkl", "abcdef" + control + "ghijkl", "abcdefghijkl" + control, control.repeat(12)]) {
      assert.equal(passwordError("signup", value), "Remove tabs, line breaks or other control characters from your password.");
      const state = change("signup", initialValidationState(), "password", value);
      assert.equal(state.values.password, value);
      assert.ok(visibleErrors("signup", state).password);
    }
  }
});

test("edge-space notice is non-blocking, signup-only and reserved for otherwise valid passwords", () => {
  for (const value of [" abcdefghijkl", "abcdefghijkl ", " abcdefghij "]) {
    assert.match(passwordSpaceNotice("signup", value), /kept exactly as entered/);
    assert.deepEqual(validateAuthValues("signup", { email: "tailor@example.com", password: value }), {});
    assert.equal(submit("signup", initialValidationState(), { name: "Synthetic Tailor", email: "tailor@example.com", password: value }).unavailable, true);
  }
  for (const value of ["", " ".repeat(12), "short ", "abcdefghijkl", "abcdef ghijkl", "abcdefghijkl\t"]) {
    assert.equal(passwordSpaceNotice("signup", value), undefined);
  }
  assert.equal(passwordSpaceNotice("login", " abcdefghijkl"), undefined);
  assert.equal(passwordSpaceNotice("reset", " abcdefghijkl"), undefined);
});

test("signup requires no combination of character types and never normalizes Unicode", () => {
  for (const value of ["abcdefghijkl", "ABCDEFGHIJKL", "AbcdefGhijkl", "Abcdef123!xy", "012345678901", "!@#$%^&*()_+", "🧵".repeat(12)]) {
    assert.equal(passwordError("signup", value), undefined);
  }
  const value = "e\u0301".repeat(6);
  const state = change("signup", initialValidationState(), "password", value);
  assert.equal(state.values.password, value);
  assert.equal(passwordError("signup", value), undefined);
  assert.notEqual(value, value.normalize("NFC"));
});

test("signup guidance and errors clear on validity and return immediately on invalidation", () => {
  let state = initialValidationState();
  assert.equal(PASSWORD_GUIDANCE, "Use at least 12 characters. Letters, numbers, symbols and spaces are allowed.");
  assert.equal(passwordGuidance("signup", state), undefined);
  state = blur("signup", state, "password");
  assert.ok(visibleErrors("signup", state).password);
  assert.equal(passwordGuidance("signup", state), undefined);
  state = change("signup", state, "password", "short");
  assert.match(visibleErrors("signup", state).password, /at least 12/);
  assert.equal(passwordGuidance("signup", state), PASSWORD_GUIDANCE);
  state = change("signup", state, "password", "abcdefghijkl");
  assert.equal(visibleErrors("signup", state).password, undefined);
  assert.equal(passwordGuidance("signup", state), undefined);
  assert.equal(state.unavailable, false);
  state = change("signup", state, "password", "abcdef\tghijkl");
  assert.equal(visibleErrors("signup", state).password, "Remove tabs, line breaks or other control characters from your password.");
  assert.equal(passwordGuidance("signup", state), PASSWORD_GUIDANCE);
  state = change("signup", state, "password", "abcdefghijkl");
  assert.equal(passwordGuidance("signup", state), undefined);
  state = change("signup", state, "password", "abcdefghijk");
  assert.match(visibleErrors("signup", state).password, /at least 12/);
  assert.equal(passwordGuidance("signup", state), PASSWORD_GUIDANCE);
  state = change("signup", state, "password", "");
  assert.equal(visibleErrors("signup", state).password, "Enter your password.");
  assert.equal(passwordGuidance("signup", state), PASSWORD_GUIDANCE);
  assert.equal(passwordGuidance("login", state), undefined);
  assert.equal(passwordGuidance("reset", state), undefined);
});

test("first signup password input gives feedback without waiting for blur", () => {
  const state = change("signup", initialValidationState(), "password", "short");
  assert.equal(state.touched.password, undefined);
  assert.ok(visibleErrors("signup", state).password);
  assert.equal(passwordGuidance("signup", state), PASSWORD_GUIDANCE);
});

test("login does not retroactively impose signup length/complexity rules", () => {
  assert.equal(passwordError("login", "x"), undefined);
  assert.equal(passwordError("login", "x".repeat(129)), undefined);
  assert.equal(passwordError("login", " "), undefined);
  assert.equal(passwordError("login", "Abc defghijk"), undefined);
  assert.equal(passwordError("login", ""), "Enter your password.");
  assert.equal(passwordError("reset", ""), undefined);
  assert.equal(passwordError("reset", "any password "), undefined);
});

test("only a valid local submit reaches unavailable; editing cannot trigger success", () => {
  for (const mode of ["signup", "login", "reset"]) {
    const invalid = submit(mode, initialValidationState());
    assert.equal(invalid.unavailable, false);
    assert.ok(Object.keys(visibleErrors(mode, invalid)).length);
    const values = { ...(mode === "signup" ? { name: "Synthetic Tailor" } : {}), email: "tailor@example.com", password: "abcdefghijkl" };
    let state = submit(mode, initialValidationState(), values);
    assert.deepEqual(validateAuthValues(mode, values), {});
    assert.equal(state.unavailable, true);
    state = change(mode, state, "email", values.email);
    assert.equal(state.unavailable, false);
    assert.deepEqual(visibleErrors(mode, state), {});
  }
});
