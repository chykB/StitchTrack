import {z} from "zod";
import {signupSchema,emailSchema} from "./schemas.ts";
export const developmentSignupSchema=signupSchema;
export const registrationSchema=signupSchema.extend({termsAccepted:z.literal(true),termsVersionId:z.string().min(1)});
// Privacy notice acknowledgement is separate from contractual acceptance and purpose-specific consent.
export const signupAcknowledgementsSchema=registrationSchema.extend({privacyAcknowledged:z.literal(true)});
export const emailVerificationSchema=z.strictObject({email:emailSchema,otp:z.string().regex(/^[0-9]{6}$/u)});
export const issuanceVerificationSchema=emailVerificationSchema.extend({issuanceId:z.string().uuid()});
export const resendVerificationSchema=z.strictObject({email:emailSchema});
export const registrationTermsSchema=z.strictObject({id:z.string().min(1),version:z.string().min(1),path:z.literal("/terms")});
export type RegistrationTerms=z.infer<typeof registrationTermsSchema>;
export const registrationPaths={signup:"/api/product-auth/signup",verify:"/api/product-auth/verify-email",resend:"/api/product-auth/resend-verification"} as const;
export type RegistrationOperation=keyof typeof registrationPaths;
