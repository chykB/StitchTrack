import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import "../auth-validation/rendering.mjs";
const { default: EmailCodeField } = await import("../../app/(auth)/_components/EmailCodeField.tsx");
const { default: EmailVerificationForm, readVerificationSubmission } =
  await import("../../app/(auth)/_components/EmailVerificationForm.tsx");
const field = { onChange() {}, onBlur() {} };

test("reusable code field is text with numeric keyboard hint, exact-digit pattern and one-time-code autocomplete", () => {
  const html = renderToStaticMarkup(createElement(EmailCodeField, field));
  assert.match(html, /for="verification-code"/);
  assert.match(html, /<input(?=[^>]*id="verification-code")(?=[^>]*name="code")(?=[^>]*type="text")/);
  assert.match(html, /autoComplete="one-time-code"/);
  assert.match(html, /inputMode="numeric"/);
  assert.match(html, /pattern="\[0-9\]\{6\}"/);
  assert.match(html, /required=""/);
  assert.match(html, /aria-describedby="verification-code-hint"/);
  assert.match(html, /Enter the code for your email\./);
  assert.doesNotMatch(html, /six-digit|six digits|6 digits/);
  assert.doesNotMatch(html, /aria-invalid=|verification-code-error|value=|step=|min=|max=|maxLength=/);
});
test("reusable field associates text/caution errors and removes stale descriptions after correction", () => {
  const html = renderToStaticMarkup(createElement(EmailCodeField, { ...field, error: "Enter your email verification code." }));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="verification-code-hint verification-code-error"/);
  assert.match(html, /id="verification-code-error"/);
  assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.match(html, /Enter your email verification code\./);
  assert.doesNotMatch(html, /aria-live=|role="alert"/);
  const corrected = renderToStaticMarkup(createElement(EmailCodeField, field));
  assert.doesNotMatch(corrected, /aria-invalid=|verification-code-error/);
});
test("server markup is inert, starts without errors or invented status, and keeps meaningful auth navigation", () => {
  const html = renderToStaticMarkup(createElement(EmailVerificationForm));
  assert.match(html, /id="auth-title" tabindex="-1"/);
  assert.match(html, /Verify your email/);
  assert.match(html, /<form(?=[^>]*method="post")(?=[^>]*noValidate="")(?=[^>]*aria-busy="true")/);
  assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /<legend class="visuallyHidden">Email verification/);
  assert.match(html, /<button type="submit"[^>]*>Verify email/);
  assert.match(html, /id="verification-feedback"[^>]*role="status" aria-live="polite" aria-atomic="true"><\/div>/);
  assert.match(html, /href="\/auth\?login"/);
  assert.doesNotMatch(html, /aria-invalid=|name="email"|name="password"|name="draftAcknowledgement"|action=|[Cc]ode (has been|was) sent/);
});
test("before hydration, submission is canceled before any input value is read", () => {
  let canceled = false;
  const event = { preventDefault() { canceled = true; }, get currentTarget() { throw Error("must not read"); } };
  assert.equal(readVerificationSubmission(event, false), null);
  assert.equal(canceled, true);
});
test("ready submissions are canceled and read exact strings; absent controls cannot reuse an old code", () => {
  let canceled = false;
  const event = { preventDefault() { canceled = true; },
    currentTarget: { elements: { namedItem(name) { assert.equal(name, "code"); return { value: "004281" }; } } } };
  assert.equal(readVerificationSubmission(event, true), "004281");
  assert.equal(canceled, true);
  assert.equal(readVerificationSubmission({ preventDefault() {},
    currentTarget: { elements: { namedItem() { return null; } } } }, true), "");
});
test("verification UI has no requests, persistence, numeric coercion or native stepping overrides", () => {
  for (const path of ["../../app/(auth)/_components/EmailCodeField.tsx",
    "../../app/(auth)/_components/EmailVerificationForm.tsx", "../../lib/auth/email-code.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bNumber\s*\(|parseInt\s*\(|valueAsNumber|\.trim\(|\.normalize\(|fetch\(|localStorage|sessionStorage|console\.|document.cookie|onWheel|stepUp|stepDown|onKeyDown/);
  }
  const css = readFileSync(new URL("../../app/(auth)/auth.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /appearance|spin-button/);
});
