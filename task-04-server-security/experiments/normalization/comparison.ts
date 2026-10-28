// Isolated synthetic assessment comparison. Never imported by application code.
// Product transformations remain defined exclusively in lib/auth/schemas.ts.
import { signupSchema, loginSchema, resetSchema, emailSchema,
  signupPasswordSchema, loginPasswordSchema } from "../../../lib/auth/schemas.ts";

const syntheticPassword = "Synthetic comparison phrase";
const schemas = { signup: signupSchema, login: loginSchema, reset: resetSchema };
export const emailExamples = Object.freeze([
  "tailor.demo+orders@example.invalid",
  "Tailor.Demo+Orders@EXAMPLE.INVALID",
  "  Tailor.Demo+Orders@EXAMPLE.INVALID  ",
  "\tTailor.Demo+Orders@EXAMPLE.INVALID\r\n",
  "\u00a0Tailor.Demo+Orders@EXAMPLE.INVALID\u2003",
]);
export function emailComparison() {
  const rows = emailExamples.map(input => {
    const raw = Object.freeze({ name: "Synthetic Tailor", email: input, password: syntheticPassword });
    const signup = signupSchema.parse(raw);
    const login = loginSchema.parse({ email: input, password: syntheticPassword });
    const reset = resetSchema.parse({ email: input });
    return {
      syntheticInput: JSON.stringify(input),
      canonical: signup.email,
      flowsAgree: signup.email === login.email && login.email === reset.email,
      rawUnchanged: raw.email === input,
      idempotent: emailSchema.parse(signup.email) === signup.email,
    };
  });
  return { rows, equivalentInputs: new Set(rows.map(row => row.canonical)).size === 1 };
}

// Deliberately isolated assessment operation; never a product preprocessing step.
export function compareSyntheticPassword(label: string, original: string, base: string) {
  const trimmed = original.trim();
  const signup = signupPasswordSchema.safeParse(original);
  const login = loginPasswordSchema.safeParse(original);
  return {
    case: label,
    codePointsBefore: Array.from(original).length,
    codePointsAfterTrim: Array.from(trimmed).length,
    trimChangesValue: original !== trimmed,
    exactEqualsBase: original === base,
    trimmedEqualsBase: trimmed === base,
    signupAccepts: signup.success,
    trimmedSignupAccepts: signupPasswordSchema.safeParse(trimmed).success,
    loginAccepts: login.success,
    signupPreserves: signup.success ? signup.data === original : null,
    loginPreserves: login.success ? login.data === original : null,
  };
}
export function passwordComparison() {
  const base = syntheticPassword;
  return [
    compareSyntheticPassword("No edge whitespace", base, base),
    compareSyntheticPassword("Leading space", " " + base, base),
    compareSyntheticPassword("Trailing space", base + " ", base),
    compareSyntheticPassword("Both edges", " " + base + " ", base),
    compareSyntheticPassword("Internal spaces remain", "Synthetic  comparison phrase", base),
    compareSyntheticPassword("Whitespace-only (12 spaces)", " ".repeat(12), ""),
    compareSyntheticPassword("12 to 10 code points", " " + "x".repeat(10) + " ", "x".repeat(10)),
    compareSyntheticPassword("Unicode edge whitespace", "\u00a0" + base + "\u2003", base),
  ];
}
export function unicodeAndCaseComparison() {
  const decomposed = "Cafe\u0301 synthetic phrase";
  const composed = decomposed.normalize("NFC"); // Comparison only, never applied by a product schema.
  const mixed = "Synthetic MixedCase phrase";
  return {
    composedAndDecomposedDistinct: decomposed !== composed,
    signupPreservesDecomposed: signupPasswordSchema.parse(decomposed) === decomposed,
    loginPreservesDecomposed: loginPasswordSchema.parse(decomposed) === decomposed,
    caseChangeProducesDistinctValue: mixed !== mixed.toLowerCase(),
    signupPreservesCase: signupPasswordSchema.parse(mixed) === mixed,
    loginPreservesCase: loginPasswordSchema.parse(mixed) === mixed,
  };
}
