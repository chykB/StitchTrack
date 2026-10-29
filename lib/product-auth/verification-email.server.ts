import "server-only";
import {z} from "zod";
import tokens from "../../task-01-design-system/evidence/06-tokens-complete.json" with {type: "json"};
import {emailSchema} from "../auth/schemas.ts";
import {ProductAuthError} from "./secrets.server.ts";

export const VERIFICATION_EMAIL_TEMPLATE = "tailor-verification-v1";
const payloadSchema = z.strictObject({email: emailSchema, otp: z.string().regex(/^[0-9]{6}$/u)});
const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]!));
function color(role: keyof typeof tokens["stitchtrack color roles"]["roles"]) {
  const reference = tokens["stitchtrack color roles"].roles[role].value;
  let node: unknown = tokens;
  for (const part of reference.slice(1,-1).split(".")) node = (node as Record<string, unknown>)[part];
  const value = (node as {value: string}).value;
  if (!/^#[0-9a-f]{6}ff$/iu.test(value)) throw new ProductAuthError("email_configuration_unavailable");
  return value.slice(0,7); // Opaque six-digit colors also work in older mail clients.
}
const body = tokens.typography.body.medium, heading = tokens.typography.headline.small;

// Rendering only: no SMTP, storage, code generation or authentication action.
export function renderVerificationEmail(input: unknown, expiresAt: Date) {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success || !input || typeof input !== "object" || !("email" in input) || input.email !== parsed.data.email ||
      !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) throw new ProductAuthError("email_invalid_message");
  const {email, otp} = parsed.data;
  const deadline = new Intl.DateTimeFormat("en-NG", {dateStyle:"medium", timeStyle:"medium", timeZone:"Africa/Lagos"}).format(expiresAt) + " WAT";
  const instructions = "Enter this code on the StitchTrack email verification screen. Do not share it with anyone.";
  const validity = "Valid for up to five minutes from issue. Expires at " + deadline + ". Delivery delays do not extend its validity.";
  const unexpected = "If you did not request this code, ignore this email. No action is needed.";
  return {
    recipient: email,
    subject: "Verify your StitchTrack email address",
    text: ["StitchTrack", "Verify your email address", "For: " + email, "Verification code: " + otp, instructions, validity, unexpected].join("\n\n"),
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your StitchTrack email address</title></head>
<body style="margin:0;background:${color("background")};color:${color("on background")};font-family:'${body.fontFamily.value}',Arial,sans-serif;font-size:${body.fontSize.value}px;line-height:${body.lineHeight.value}px">
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px 16px">
<table role="presentation" style="width:100%;max-width:560px;margin:0 auto;border-collapse:collapse;background:${color("surface container lowest")}"><tr><td style="padding:24px">
<p style="margin:0 0 16px;color:${color("primary")};font-weight:${heading.fontWeight.value}">StitchTrack</p>
<h1 style="margin:0 0 16px;font-size:${heading.fontSize.value}px;line-height:${heading.lineHeight.value}px;font-weight:${heading.fontWeight.value}">Verify your email address</h1>
<p>For: ${escapeHtml(email)}</p>
<p style="padding:16px;background:${color("primary container")};color:${color("on primary container")}">Verification code: <strong>${escapeHtml(otp)}</strong></p>
<p>${escapeHtml(instructions)}</p><p>${escapeHtml(validity)}</p><p>${escapeHtml(unexpected)}</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
