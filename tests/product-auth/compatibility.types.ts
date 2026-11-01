// Compile-only public API contract. Never execute this file or connect to a DB.
import {betterAuth, type BetterAuthOptions} from "better-auth";
import {prismaAdapter} from "@better-auth/prisma-adapter";
import {emailOTP} from "better-auth/plugins/email-otp";
import type {Prisma} from "../../prisma/product/generated/client.ts";
import {hashPassword, verifyPassword} from "../../lib/auth/password.server.ts";

function compileContract(tx: Prisma.TransactionClient, keyedOtpHasher: (otp: string) => Promise<string>) {
const options = {
  database: prismaAdapter(tx, {provider: "postgresql", transaction: false}),
  emailAndPassword: {enabled: true, autoSignIn: false, requireEmailVerification: true,
    minPasswordLength: 12, maxPasswordLength: Number.POSITIVE_INFINITY,
    password: {hash: hashPassword, verify: verifyPassword}},
  emailVerification: {sendOnSignUp: false, autoSignInAfterVerification: false},
  plugins: [emailOTP({otpLength: 6, expiresIn: 300, allowedAttempts: 3, disableSignUp: true,
    sendVerificationOnSignUp: false, storeOTP: {hash: keyedOtpHasher},
    sendVerificationOTP: async () => {throw new Error("No delivery in compatibility fixture");}})],
  telemetry: {enabled: false}, logger: {disabled: true},
} satisfies BetterAuthOptions;
const auth = betterAuth(options);
void auth.api.signUpEmail({body: {name: "Synthetic", email: "synthetic@example.invalid", password: "synthetic password"}});
void auth.api.createVerificationOTP({body: {email: "synthetic@example.invalid", type: "email-verification"}});
// These additional product writes have usable Prisma transaction types; this is
// compile compatibility only, not evidence that they share a real transaction.
void tx.termsAcceptance.create({data: {id: "synthetic", userId: "synthetic", termsVersionId: "synthetic", context: "synthetic-test"}});
void tx.emailOutbox.findMany();
}
void compileContract; // Keep this compile-only fixture inert if accidentally imported.
