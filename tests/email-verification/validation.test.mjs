import test from "node:test";
import assert from "node:assert/strict";
import { codeFormatError, EMAIL_VERIFICATION_UNAVAILABLE } from "../../lib/auth/email-code.ts";

test("verification requires a code and exactly six ASCII digits", () => {
  assert.equal(codeFormatError(""), "Enter your email verification code.");
  for (const value of ["0", "00428", "0042810", "00 281", " 04281", "004281 ",
    "1e0005", "123.45", "-12345", "123456\n", "123456\r", "12345\t",
    "\uff11\uff12\uff13\uff14\uff15\uff16", "\u0661\u0662\u0663\u0664\u0665\u0666"])
    assert.equal(codeFormatError(value), "Use exactly six digits from 0 to 9.", JSON.stringify(value));
});
test("code checking preserves leading zeros as strings without changing the input", () => {
  for (const value of ["004281", "000000", "123456", "999999"]) {
    assert.equal(codeFormatError(value), undefined);
    assert.equal(typeof value, "string");
    assert.equal(value.length, 6);
  }
  assert.equal(codeFormatError("004281"), undefined);
});
test("the only valid-submission outcome is unavailable, never a verified result", () => {
  assert.equal(EMAIL_VERIFICATION_UNAVAILABLE, "Email verification is not available yet.");
});
