import { z } from "zod";

export const PASSWORD_MIN = 12;
export const PASSWORD_GUIDANCE =
  "Use at least 12 characters. Letters, numbers, symbols and spaces are allowed.";

export const nameSchema = z.string({ error: "Enter your name." }).refine(
  value => !/^[\s\p{White_Space}]*$/u.test(value),
  { error: "Enter your name." },
);

// Approved V1 policy: ASCII email syntax consistent with installed Better Auth.
// Validate before lowercasing so non-ASCII compatibility characters cannot fold
// into ASCII. Only parsed output changes; raw UI typing remains untouched.
export const emailSchema = z.string({ error: "Enter your email address." })
  .transform(value => value.trim())
  .superRefine((email, context) => {
    if (!email) {
      context.addIssue({ code: "custom", message: "Enter your email address." });
    } else if (/[^\x00-\x7f]/u.test(email) || !z.email().safeParse(email).success) {
      context.addIssue({ code: "custom", message: "Enter an email address like you@example.com." });
    }
  })
  .transform(value => value.toLowerCase());

// Password schemas validate the original string: no transforms, coercion,
// normalization, character-class requirements or provisional maximum.
export const signupPasswordSchema = z.string({ error: "Enter your password." })
  .superRefine((password, context) => {
    let message: string | undefined;
    if (!password) message = "Enter your password.";
    else if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(password)) {
      message = "Remove tabs, line breaks or other control characters from your password.";
    } else if (/^[\s\p{White_Space}]+$/u.test(password)) {
      message = "Choose a password that is not only whitespace.";
    } else if (Array.from(password).length < PASSWORD_MIN) {
      message = PASSWORD_GUIDANCE;
    }
    if (message) context.addIssue({ code: "custom", message });
  });

// Login verifies presence only; it must not reapply new enrollment policy.
export const loginPasswordSchema = z.string({ error: "Enter your password." })
  .min(1, { error: "Enter your password." });

// Future boundaries accept unknown input through safeParse/parse and consume
// result.data only after success. No implicit coercion or unknown-key passthrough.
// Approved Terms acceptance must be added in its separately controlled slice;
// the current draft-review checkbox is not a registration acceptance record.
export const signupSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: signupPasswordSchema,
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
});
export const resetSchema = z.strictObject({ email: emailSchema });

export type SignupInput = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
export type ResetInput = z.input<typeof resetSchema>;
export type ResetData = z.output<typeof resetSchema>;
