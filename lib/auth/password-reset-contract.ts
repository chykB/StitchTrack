import {z} from "zod";
import {emailSchema,signupPasswordSchema} from "./schemas.ts";
export const resetRequestSchema=z.strictObject({email:emailSchema});
export const resetCodeSchema=resetRequestSchema.extend({otp:z.string().regex(/^[0-9]{6}$/u)});
export const resetCompleteSchema=resetCodeSchema.extend({password:signupPasswordSchema.refine(p=>p.isWellFormed())});
export const resetPaths={request:"/api/product-auth/password-reset/request",check:"/api/product-auth/password-reset/check",complete:"/api/product-auth/password-reset/complete"} as const;
export type ResetOperation=keyof typeof resetPaths;
export const RESET_TEMPLATE="tailor-password-reset-v1";
export const RESET_MAC_CONTEXT="password-reset/";
