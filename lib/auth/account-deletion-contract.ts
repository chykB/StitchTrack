import {z} from "zod";
import {loginPasswordSchema} from "./schemas.ts";
// Reauthentication verifies the existing password exactly, not signup strength.
// No browser identity, target, lifecycle timestamp or authorization flags accepted.
export const accountDeletionSchema=z.strictObject({password:loginPasswordSchema.refine(p=>p.isWellFormed())});
export const accountDeletionPath="/api/internal/tailor-session/delete-account";
