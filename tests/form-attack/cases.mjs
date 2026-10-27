// Synthetic data only. These examples are not accounts, passwords or issued OTPs.
import { initialValidationState, reduceValidation, visibleErrors, signupSubmissionBlocked } from "../../lib/auth/validation.ts";
import { codeFormatError } from "../../lib/auth/email-code.ts";
export const validEmail = "synthetic.tailor+attack@example.com";
export const validPassword = "synthetic passphrase";
export const attackCases = [];

function credential(mode, id, label, values, blocked, draftAcknowledged = true) {
  attackCases.push({ mode, id, label, values, blocked, draftAcknowledged });
}
const emails = [
  ["empty", "empty email", "", true],
  ["single", "single-character email x", "x", true],
  ["spaces", "three ASCII spaces as email", "   ", true],
  ["a-at-b", "borderline email a@b", "a@b", true],
  ["short-shaped", "short but coarse-shape-valid email a@b.c", "a@b.c", false],
  ["plus", "plus-addressed synthetic email", validEmail, false],
  ["edge-spaces", "synthetic email with two leading/trailing spaces", "  " + validEmail + "  ", false],
  ["inner-space", "internal whitespace in email", "a b@example.com", true],
  ["two-at", "two at-signs in email", "a@@example.com", true],
];
for (const mode of ["signup", "login", "reset"]) {
  for (const [suffix, label, email, blocked] of emails)
    credential(mode, mode + "-email-" + suffix, label,
      { email, password: mode === "reset" ? "" : validPassword }, blocked);
}
credential("signup", "signup-email-long", "300-character local part; no app email maximum", {
  email: "a".repeat(300) + "@example.com", password: validPassword,
}, false);
credential("signup", "signup-email-unicode", "Unicode local part; only coarse syntax checked", {
  email: "t\u00e1ilor@example.com", password: validPassword,
}, false);

const passwords = [
  ["empty", "empty password", "", true],
  ["single", "one ASCII character x", "x", true],
  ["space", "one ASCII space", " ", true],
  ["twelve-spaces", "12 ASCII spaces", " ".repeat(12), true],
  ["eleven", "11 lowercase ASCII characters", "a".repeat(11), true],
  ["twelve", "12 lowercase ASCII characters", "a".repeat(12), false],
  ["thirteen", "13 lowercase ASCII characters", "a".repeat(13), false],
  ["digits", "12 ASCII digits only", "012345678901", false],
  ["symbols", "12 symbols only", "!".repeat(12), false],
  ["passphrase", "ordinary internal spaces", validPassword, false],
  ["leading-space", "one leading space plus 12 letters", " " + "a".repeat(12), false],
  ["trailing-space", "12 letters plus one trailing space", "a".repeat(12) + " ", false],
  ["129", "129 lowercase characters; above removed provisional maximum", "a".repeat(129), false],
  ["4096", "4096 lowercase characters; finite large sample, no max claim", "a".repeat(4096), false],
  ["tab", "tab inside otherwise long password", "abcdef\tghijkl", true],
  ["newline", "newline inside otherwise long password", "abcdef\nghijkl", true],
  ["eleven-points", "11 supplementary Unicode code points (22 UTF-16 units)", "\ud83e\uddf5".repeat(11), true],
  ["twelve-points", "12 supplementary Unicode code points (24 UTF-16 units)", "\ud83e\uddf5".repeat(12), false],
  ["combining", "12 code points including a combining mark (not grapheme counting)", "a\u0301" + "b".repeat(10), false],
];
for (const [suffix, label, password, blocked] of passwords)
  credential("signup", "signup-password-" + suffix, label, { email: validEmail, password }, blocked);
for (const [suffix, label, password, blocked] of [
  ["empty", "empty login password", "", true],
  ["single", "one-character login password; presence-only policy", "x", false],
  ["space", "one-space login password; presence-only policy", " ", false],
  ["twelve-spaces", "12-space login password; no signup policy imposed", " ".repeat(12), false],
])
  credential("login", "login-password-" + suffix, label, { email: validEmail, password }, blocked);

credential("signup", "signup-unchecked-draft", "valid credentials, local draft acknowledgement unchecked", {
  email: validEmail, password: validPassword,
}, true, false);
credential("signup", "signup-bypass-baseline", "direct-request baseline: email a@b and one-space password, draft checked for isolation", {
  email: "a@b", password: " ",
}, true);

for (const [suffix, label, code, blocked] of [
  ["empty", "empty code", "", true],
  ["single", "one digit", "0", true],
  ["spaces", "six spaces", " ".repeat(6), true],
  ["five", "five digits, lower length boundary", "00428", true],
  ["six", "six digits preserving leading zeros", "004281", false],
  ["seven", "seven digits, upper length boundary", "0042810", true],
  ["all-zeros", "six zeros", "000000", false],
  ["native-loss", "four digits after historical native stepping", "4280", true],
  ["leading-space", "leading space plus six digits", " 004281", true],
  ["trailing-space", "six digits plus trailing space", "004281 ", true],
  ["inner-space", "internal space", "00 281", true],
  ["exponent", "six-character exponent-looking string", "1e0005", true],
  ["decimal", "six-character decimal-looking string", "123.45", true],
  ["fullwidth", "six fullwidth digits", "\uff11\uff12\uff13\uff14\uff15\uff16", true],
  ["arabic", "six Arabic-Indic digits", "\u0661\u0662\u0663\u0664\u0665\u0666", true],
  ["newline", "six digits plus newline", "004281\n", true],
]) attackCases.push({ mode: "verify", id: "verify-" + suffix, label, code, blocked });

export function observeAttack(item) {
  if (item.mode === "verify") {
    const error = codeFormatError(item.code);
    return { id: item.id, mode: item.mode, input: item.label,
      outcome: error ? "BLOCKED_FORMAT" : "FORMAT_ONLY_VALID_NOT_VERIFIED",
      errors: error ? { code: error } : {}, inputPreserved: true,
      codePoints: Array.from(item.code).length, utf16Units: item.code.length };
  }
  const state = reduceValidation(item.mode, initialValidationState(), {
    type: "submit", values: { ...item.values }, draftAcknowledged: item.draftAcknowledged,
  }, item.mode === "signup");
  const errors = visibleErrors(item.mode, state, item.mode === "signup");
  return { id: item.id, mode: item.mode, input: item.label,
    outcome: state.unavailable ? "FORMAT_ONLY_VALID_ACTION_UNAVAILABLE" : "BLOCKED",
    errors, unavailable: state.unavailable,
    signupActionBlocked: item.mode === "signup" ? signupSubmissionBlocked(item.mode, state, true) : null,
    inputPreserved: state.values.email === item.values.email && state.values.password === item.values.password,
    passwordCodePoints: item.mode === "reset" ? null : Array.from(state.values.password).length };
}
