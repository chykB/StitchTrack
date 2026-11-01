import test from "node:test";
import assert from "node:assert/strict";
import {
  nameSchema, emailSchema, signupPasswordSchema, loginPasswordSchema,
  signupSchema, loginSchema, resetSchema, PASSWORD_MIN,
} from "../../lib/auth/schemas.ts";
import {
  nameError, emailError, passwordError, validateAssessmentForm,
  initialValidationState, reduceValidation, visibleErrors,
} from "../../lib/auth/validation.ts";

const valid = { name: "Synthetic Tailor", email: "tailor@example.com", password: "a safe passphrase" };
const schemas = { signup: signupSchema, login: loginSchema, reset: resetSchema };
function inputFor(mode, values) {
  return mode === "signup" ? values : mode === "login" ?
    { email: values.email, password: values.password } : { email: values.email };
}

test("all authentication schemas produce the same trimmed, fully lowercase email", () => {
  for (const [email, expected] of [
    ["  Tailor+Orders@EXAMPLE.COM  ", "tailor+orders@example.com"],
    ["\tTailor@EXAMPLE.COM\r\n", "tailor@example.com"],
    ["\u00a0TAILOR@EXAMPLE.COM\u2003", "tailor@example.com"],
  ]) {
    for (const [mode, schema] of Object.entries(schemas)) {
      const raw = Object.freeze(inputFor(mode, { ...valid, email }));
      const parsed = schema.parse(raw);
      assert.equal(parsed.email, expected);
      assert.equal(raw.email, email);
      assert.notEqual(parsed, raw);
      assert.equal(schema.parse(parsed).email, expected); // Idempotent canonicalization.
    }
  }
});

test("email canonicalization preserves plus tags and dots and does not rewrite provider domains", () => {
  assert.equal(emailSchema.parse(" First.Last+Orders@GMAIL.COM "), "first.last+orders@gmail.com");
  assert.equal(emailSchema.parse(" First.Last+Orders@GOOGLEMAIL.COM "), "first.last+orders@googlemail.com");
});

test("email field and full schemas reject malformed formats without coercing values", () => {
  for (const email of ["", " ", "a", "a@b", "@example.com", "a@", "a b@example.com",
    "a@b@example.com", "a@b.", undefined, null, 123, true, [], {}]) {
    assert.equal(emailSchema.safeParse(email).success, false);
    for (const [mode, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(inputFor(mode, { ...valid, email }));
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some(issue => issue.path[0] === "email"));
      assert.equal(result.data, undefined);
    }
  }
});

test("Unicode names, mononyms and punctuation remain unchanged; blank names are rejected", () => {
  for (const name of ["A", "Ọlá", "李", "O'Neill", "Anne-Marie", "  A  B  ", "A".repeat(300)]) {
    assert.equal(nameSchema.parse(name), name);
    assert.equal(signupSchema.parse({ ...valid, name }).name, name);
  }
  for (const name of ["", " ", "\u0085", "\t\n", "\u00a0\u2003", undefined, null, 123]) {
    assert.equal(nameSchema.safeParse(name).success, false);
    assert.equal(signupSchema.safeParse({ ...valid, name }).success, false);
  }
});

test("Signup password retains exact case, Unicode encoding and meaningful whitespace", () => {
  for (const password of [" ABCdefGhijkl ", "abcdef ghijkl", "e\u0301".repeat(6), "🧵".repeat(12)]) {
    const raw = Object.freeze({ ...valid, password });
    const result = signupSchema.parse(raw);
    assert.equal(result.password, password);
    assert.equal(raw.password, password);
    assert.equal(result.name, raw.name);
  }
  const decomposed = "e\u0301".repeat(6);
  assert.notEqual(signupPasswordSchema.parse(decomposed), decomposed.normalize("NFC"));
});

test("Signup minimum counts 12 Unicode code points and introduces no new maximum or complexity rule", () => {
  assert.equal(PASSWORD_MIN, 12);
  for (const password of ["a".repeat(11), "🧵".repeat(11)]) {
    assert.equal(signupPasswordSchema.safeParse(password).success, false);
  }
  for (const password of ["a".repeat(12), "a".repeat(13), "a".repeat(129), "a".repeat(4096),
    "🧵".repeat(12), "012345678901", "ABCDEFGHIJKL", "!@#$%^&*()_+"]) {
    assert.equal(signupPasswordSchema.parse(password), password);
  }
});

test("Signup rejects empty, whitespace-only and prohibited control characters", () => {
  for (const password of ["", " ".repeat(12), "\u00a0".repeat(12), "\u2003".repeat(12),
    ...["\t", "\n", "\r", "\u0000", "\u007f", "\u0085", "\u2028", "\u2029"]
      .flatMap(c => [c + "abcdefghijkl", "abcdef" + c + "ghijkl", "abcdefghijkl" + c]),
    undefined, null, 123]) {
    assert.equal(signupPasswordSchema.safeParse(password).success, false);
    assert.equal(signupSchema.safeParse({ ...valid, password }).success, false);
  }
});

test("Login remains presence-only and does not impose Signup rules or change password characters", () => {
  for (const password of ["x", " ", " secret ", "x".repeat(129), "ABCdef", "a\tb"]) {
    assert.equal(loginPasswordSchema.parse(password), password);
    assert.equal(loginSchema.parse({ email: " A@EXAMPLE.COM ", password }).password, password);
  }
  for (const password of ["", undefined, null, 123]) {
    assert.equal(loginPasswordSchema.safeParse(password).success, false);
  }
  assert.deepEqual(resetSchema.parse({ email: " A@EXAMPLE.COM " }), { email: "a@example.com" });
});

test("full schemas reject wrong shapes, missing fields and unknown keys instead of coercing or passing them through", () => {
  for (const [mode, schema] of Object.entries(schemas)) {
    for (const value of [undefined, null, "text", 123, [], {}, { ...inputFor(mode, valid), role: "admin" }]) {
      assert.equal(schema.safeParse(value).success, false);
    }
    for (const key of Object.keys(inputFor(mode, valid))) {
      const value = { ...inputFor(mode, valid) };
      delete value[key];
      assert.equal(schema.safeParse(value).success, false);
    }
  }
  assert.equal(loginSchema.safeParse(valid).success, false); // Signup shape is not Login.
  assert.equal(resetSchema.safeParse({ email: valid.email, password: valid.password }).success, false);
});

test("UI field errors use the same rules and first messages as shared schemas", () => {
  for (const [schema, validator, values] of [
    [nameSchema, nameError, ["", " ", "\u0085", "Ọlá", "A"]],
    [emailSchema, emailError, ["", " ", "a@b", "a@b.", "a b@example.com", " A+Tag@EXAMPLE.COM ", "ọlá@example.com"]],
    [signupPasswordSchema, value => passwordError("signup", value),
      ["", " ".repeat(12), "short", "a".repeat(11), "a".repeat(12), "a".repeat(129), " abcdefghijkl ", "abcdef\tghijkl"]],
    [loginPasswordSchema, value => passwordError("login", value), ["", "x", " ", " secret "]],
  ]) {
    for (const value of values) {
      const parsed = schema.safeParse(value);
      assert.equal(validator(value), parsed.success ? undefined : parsed.error.issues[0].message);
    }
  }
});

test("UI complete-form errors agree with each strict schema while preserving draft acknowledgement", () => {
  for (const [mode, schema] of Object.entries(schemas)) {
    for (const values of [
      valid, { ...valid, name: " " }, { ...valid, email: "bad" }, { ...valid, password: "" },
      { ...valid, password: "short" }, { ...valid, email: " A+Tag@EXAMPLE.COM " },
    ]) {
      const parsed = schema.safeParse(inputFor(mode, values));
      const expected = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) expected[issue.path[0]] ??= issue.message;
      }
      assert.deepEqual(validateAssessmentForm(mode, values, false), expected);
      const preview = validateAssessmentForm(mode, values, false, true);
      assert.equal(Boolean(preview.draftAcknowledgement), mode === "signup");
    }
  }
});

test("canonical output never rewrites the raw UI value during typing, blur or local submit", () => {
  const email = "  Tailor+Orders@EXAMPLE.COM  ";
  for (const [mode, schema] of Object.entries(schemas)) {
    let state = initialValidationState();
    state = reduceValidation(mode, state, { type: "change", field: "email", value: email });
    assert.equal(state.values.email, email);
    assert.equal(visibleErrors(mode, state).email, undefined);
    state = reduceValidation(mode, state, { type: "blur", field: "email", value: email });
    assert.equal(state.values.email, email);
    const values = { ...valid, email };
    state = reduceValidation(mode, state, { type: "submit", values });
    assert.equal(state.values.email, email);
    assert.equal(state.values.password, valid.password);
    assert.equal(state.unavailable, true); // Only the truthful existing local outcome.
    assert.equal(schema.parse(inputFor(mode, values)).email, "tailor+orders@example.com");
  }
});

test("shared validation has no authentication requests or logging side effects", t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No authentication or delivery request"));
  t.mock.method(console, "log", () => assert.fail("No credential logging"));
  t.mock.method(console, "info", () => assert.fail("No credential logging"));
  for (const [mode, schema] of Object.entries(schemas)) {
    assert.equal(schema.safeParse(inputFor(mode, valid)).success, true);
    assert.deepEqual(validateAssessmentForm(mode, valid, true, true), {});
  }
});
