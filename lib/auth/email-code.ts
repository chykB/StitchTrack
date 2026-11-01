// Verification codes are identifiers. Check the original string without coercion or normalization.
export function codeFormatError(value: string): string | undefined {
  if (value === "") return "Enter your email verification code.";
  if (value.length !== 6 || !/^[0-9]{6}$/.test(value)) return "Use exactly six digits from 0 to 9.";
}

export const EMAIL_VERIFICATION_UNAVAILABLE = "Email verification is not available yet.";
