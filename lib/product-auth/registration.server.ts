import "server-only";
import {randomUUID} from "node:crypto";
import {betterAuth} from "better-auth";
import {prismaAdapter} from "@better-auth/prisma-adapter";
import {emailOTP} from "better-auth/plugins/email-otp";
import {z} from "zod";
import {Prisma, type PrismaClient, type EmailOutbox, type EmailVerificationIssuance, type User} from "../../prisma/product/generated/client.ts";
import {signupSchema, emailSchema} from "../auth/schemas.ts";
import {hashPassword, verifyPassword} from "../auth/password.server.ts";
import {PRODUCT_TARGETS} from "../../prisma/product/targets.ts";
import {createSecretTools, ProductAuthError, type KeyRing} from "./secrets.server.ts";

export const REGISTRATION_STAGES = ["user", "account", "terms", "verification", "issuance", "outbox"] as const;
export type RegistrationStage = typeof REGISTRATION_STAGES[number];
export const VERIFICATION_STAGES = ["verified-user", "consumed-issuance", "cancelled-outbox"] as const;
export type WriteStage = RegistrationStage | typeof VERIFICATION_STAGES[number];
const inputSchema = signupSchema.extend({termsAccepted: z.literal(true), termsVersionId: z.string().min(1)});
const verificationSchema = z.strictObject({email: emailSchema, issuanceId: z.string().uuid(), otp: z.string().regex(/^[0-9]{6}$/u)});
export type RegistrationConfig = {
  mode: "development" | "test"; allowSyntheticTerms: boolean; requiredTermsVersionId: string;
  authSecret: string; verifierKeys: KeyRing; outboxKeys: KeyRing;
  // Required outside-transaction prerequisite. The real caller must supply the
  // fail-closed HIBP checker; only the isolated test mode may use a synthetic stub.
  checkPassword: (password: string) => Promise<"breached" | "not_found" | "unavailable">;
  testFault?: WriteStage;
  testObserver?: (stage: WriteStage) => void;
  clock?: () => Date;
};
export type VerificationOutcome = "verified" | "invalid";
const transactionOptions = {isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000, maxWait: 5_000} as const;

export function deliveryEligible(job: Pick<EmailOutbox, "status" | "availableAt" | "issuanceId">,
  issuance: Pick<EmailVerificationIssuance, "id" | "userId" | "emailCanonical" | "verificationId" | "consumedAt" | "supersededAt" | "failedAttempts" | "expiresAt">,
  user: Pick<User, "id" | "email" | "emailVerified">, now: Date): boolean {
  return job.status === "pending" && job.availableAt <= now && job.issuanceId === issuance.id &&
    issuance.userId === user.id && issuance.emailCanonical === user.email && !user.emailVerified &&
    !!issuance.verificationId && !issuance.consumedAt && !issuance.supersededAt && issuance.failedAttempts < 3 && issuance.expiresAt > now;
}

// Factory is inert. No Prisma instance is constructed and no route/handler is
// exported. Callers must provide an explicitly isolated, approved product client.
export function createRegistrationService(client: PrismaClient, config: RegistrationConfig) {
  if (!["test", "development"].includes(config.mode) || config.authSecret.length < 32 || !config.requiredTermsVersionId || typeof config.checkPassword !== "function" ||
      (config.allowSyntheticTerms && config.mode !== "test") || ((config.testFault || config.testObserver) && config.mode !== "test") ||
      (config.clock && config.mode !== "test")) throw new ProductAuthError("configuration_unavailable");
  const secrets = createSecretTools(config.verifierKeys, config.outboxKeys);
  const clock = config.clock ?? (() => new Date());
  const fault = (stage: WriteStage) => {config.testObserver?.(stage); if (config.testFault === stage) throw new ProductAuthError("injected_failure");};
  const now = () => {const value = clock(); if (!Number.isFinite(value.getTime())) throw new ProductAuthError(); return value;};
  async function assertTarget(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<{database: string; role: string; namespace: string | null}[]>`SELECT current_database() AS database, current_user AS role, to_regnamespace('product')::text AS namespace`;
    const expected = PRODUCT_TARGETS[config.mode];
    if (rows.length !== 1 || rows[0].database !== expected.database || rows[0].role !== expected.role || rows[0].namespace !== "product") throw new ProductAuthError("configuration_unavailable");
  }
  async function lockedUser(tx: Prisma.TransactionClient, email: string) {
    // Parameterized, explicitly product-qualified. Every verification/reissue
    // writer takes this same row lock before reading issuance/attempt state.
    const rows = await tx.$queryRaw<{id: string}[]>`SELECT "id" FROM "product"."User" WHERE "emailCanonical" = ${email} FOR UPDATE`;
    return rows.length === 1 ? tx.user.findUnique({where: {id: rows[0].id}}) : null;
  }
  function scopedAuth(tx: Prisma.TransactionClient, issuanceId: string, email: string, verifierKeyId: string, stageFaults = false, verificationUser?: Pick<User, "id" | "email">) {
    const receipts = {user: [] as string[], account: [] as string[], verification: [] as {id: string; expiresAt: Date}[], sessions: 0};
    const wrapped = new Proxy(tx, {get(target, property) {
      const delegate = Reflect.get(target, property);
      if (!["user", "account", "verification", "session"].includes(String(property))) return typeof delegate === "function" ? delegate.bind(target) : delegate;
      return new Proxy(delegate, {get(model, method) {
        const original = Reflect.get(model, method);
        if (property === "user" && (method === "update" || method === "updateMany")) return async (args: Prisma.UserUpdateArgs) => {
          // Better Auth 1.7.7 repeats email during OTP verification. Retain the
          // database's no-email-update privilege; only the locked identity may
          // become verified, and an identical email is omitted, never rewritten.
          if (method !== "update" || !verificationUser || email !== verificationUser.email ||
              args.where.id !== verificationUser.id || Object.keys(args.where).length !== 1 ||
              args.data.emailVerified !== true || ("email" in args.data && args.data.email !== verificationUser.email) ||
              Object.keys(args.data).some(key => !["email", "emailVerified", "updatedAt"].includes(key))) throw new ProductAuthError();
          const data = {...args.data}; delete data.email;
          return original.call(model, {...args, data});
        };
        if (method !== "create") return typeof original === "function" ? original.bind(model) : original;
        return async (args: unknown) => {
          if (property === "session") {receipts.sessions++; throw new ProductAuthError();}
          const row = await original.call(model, args);
          if (property === "verification") receipts.verification.push({id: row.id, expiresAt: row.expiresAt});
          else receipts[property as "user" | "account"].push(row.id);
          if (stageFaults) fault(property as RegistrationStage);
          return row;
        };
      }});
    }});
    const auth = betterAuth({
      baseURL: "http://127.0.0.1:3999", secret: config.authSecret,
      database: prismaAdapter(wrapped, {provider: "postgresql", transaction: false, debugLogs: false}),
      telemetry: {enabled: false}, logger: {disabled: true},
      // Retention is explicit: OTP lookup must not sweep unrelated expired rows.
      verification: {disableCleanup: true},
      emailAndPassword: {enabled: true, autoSignIn: false, requireEmailVerification: true,
        minPasswordLength: 12, maxPasswordLength: Number.POSITIVE_INFINITY,
        password: {hash: hashPassword, verify: verifyPassword}},
      emailVerification: {sendOnSignUp: false, sendOnSignIn: false, autoSignInAfterVerification: false},
      plugins: [emailOTP({otpLength: 6, expiresIn: 300, allowedAttempts: 3, disableSignUp: true,
        sendVerificationOnSignUp: false, overrideDefaultEmailVerification: false,
        storeOTP: {hash: async otp => secrets.mac(issuanceId, email, otp, verifierKeyId).toString("hex")},
        sendVerificationOTP: async () => {throw new ProductAuthError();}})],
    });
    // The Better Auth instance and generic OTP reset/sign-in methods never escape.
    return {auth, receipts};
  }
  async function issue(tx: Prisma.TransactionClient, user: User, issuanceId: string, time: Date, stageFaults = false) {
    const {auth, receipts} = scopedAuth(tx, issuanceId, user.email, secrets.verifierKeyId, stageFaults);
    const otp = await auth.api.createVerificationOTP({body: {email: user.email, type: "email-verification"}});
    if (!/^[0-9]{6}$/u.test(otp) || receipts.verification.length !== 1 || receipts.sessions) throw new ProductAuthError();
    const record = receipts.verification[0];
    // The product deadline is never later than the plugin's actual deadline.
    const expiresAt = new Date(Math.min(time.getTime() + 300_000, record.expiresAt.getTime()));
    await tx.emailVerificationIssuance.create({data: {id: issuanceId, userId: user.id, emailCanonical: user.email,
      verificationId: record.id, verifier: new Uint8Array(secrets.mac(issuanceId, user.email, otp)), verifierKeyId: secrets.verifierKeyId,
      expiresAt, createdAt: time}});
    if (stageFaults) fault("issuance");
    const context = {id: randomUUID(), issuanceId, templateVersion: "tailor-verification-v1"};
    await tx.emailOutbox.create({data: {...context, ...secrets.seal(context, {email: user.email, otp}), availableAt: time, createdAt: time}});
    if (stageFaults) fault("outbox");
    return {issuanceId};
  }
  async function cancelJobs(tx: Prisma.TransactionClient, issuanceId: string) {
    await tx.emailOutbox.updateMany({where: {issuanceId, status: "pending"}, data: {status: "cancelled"}});
  }
  return {
    async register(input: unknown): Promise<{issuanceId: string}> {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success || !parsed.data.password.isWellFormed()) throw new ProductAuthError("invalid_input");
      const data = parsed.data;
      if (data.termsVersionId !== config.requiredTermsVersionId) throw new ProductAuthError("terms_required");
      // No HIBP or other network operation belongs inside the transaction.
      let breachResult: string = "unavailable";
      try {breachResult = await config.checkPassword(data.password);} catch { /* Never expose prerequisite errors or input. */ }
      if (breachResult !== "not_found") throw new ProductAuthError("password_rejected");
      try {
        return await client.$transaction(async tx => {
          await assertTarget(tx);
          const time = now(), terms = await tx.termsVersion.findUnique({where: {id: data.termsVersionId}});
          if (!terms || (terms.isTestFixture ? !(config.mode === "test" && config.allowSyntheticTerms && !terms.approvedAt && !terms.effectiveAt)
            : !terms.approvedAt || !terms.effectiveAt || terms.approvedAt > time || terms.effectiveAt > time)) throw new ProductAuthError("terms_required");
          const issuanceId = randomUUID(), {auth, receipts} = scopedAuth(tx, issuanceId, data.email, secrets.verifierKeyId, true);
          const result = await auth.api.signUpEmail({body: {name: data.name, email: data.email, password: data.password}});
          if (result.token !== null || receipts.user.length !== 1 || receipts.account.length !== 1 || receipts.sessions) throw new ProductAuthError("registration_conflict");
          const user = await tx.user.findUnique({where: {id: receipts.user[0]}});
          if (!user || user.email !== data.email || user.emailVerified || user.id !== result.user.id ||
              await tx.account.count({where: {userId: user.id, providerId: "credential", accountId: user.id}}) !== 1) throw new ProductAuthError();
          await tx.termsAcceptance.create({data: {id: randomUUID(), userId: user.id, termsVersionId: terms.id,
            acceptedAt: time, context: terms.isTestFixture ? "synthetic-test" : "tailor-registration"}});
          fault("terms");
          const issued = await issue(tx, user, issuanceId, time, true);
          if (await tx.session.count({where: {userId: user.id}}) !== 0) throw new ProductAuthError();
          return issued;
        }, transactionOptions);
      } catch (error) {
        if (error instanceof ProductAuthError) throw error;
        throw new ProductAuthError("registration_unavailable");
      }
    },
    async verify(input: unknown): Promise<VerificationOutcome> {
      const parsed = verificationSchema.safeParse(input); if (!parsed.success) return "invalid";
      try {
        return await client.$transaction(async tx => {
          await assertTarget(tx);
          const {email, issuanceId, otp} = parsed.data, user = await lockedUser(tx, email), time = now();
          if (!user || user.emailVerified) return "invalid";
          const issuance = await tx.emailVerificationIssuance.findUnique({where: {id: issuanceId}});
          if (!issuance || issuance.userId !== user.id || issuance.emailCanonical !== email || issuance.consumedAt || issuance.supersededAt || issuance.failedAttempts >= 3) return "invalid";
          if (issuance.expiresAt <= time || !issuance.verificationId) {await cancelJobs(tx, issuanceId); return "invalid";}
          if (!secrets.matches(issuance.verifier, issuanceId, email, otp, issuance.verifierKeyId)) {
            const failedAttempts = issuance.failedAttempts + 1;
            await tx.emailVerificationIssuance.update({where: {id: issuanceId}, data: {failedAttempts}});
            if (failedAttempts >= 3) await cancelJobs(tx, issuanceId);
            return "invalid"; // Commit the failed-attempt budget; do not throw/roll it back.
          }
          const {auth, receipts} = scopedAuth(tx, issuanceId, email, issuance.verifierKeyId, false, user);
          await auth.api.verifyEmailOTP({body: {email, otp}});
          const updated = await tx.user.findUnique({where: {id: user.id}});
          if (!updated?.emailVerified || receipts.sessions || await tx.session.count({where: {userId: user.id}})) throw new ProductAuthError();
          fault("verified-user");
          await tx.emailVerificationIssuance.update({where: {id: issuanceId}, data: {consumedAt: time}});
          fault("consumed-issuance");
          await cancelJobs(tx, issuanceId);
          fault("cancelled-outbox");
          return "verified";
        }, transactionOptions);
      } catch {throw new ProductAuthError("verification_unavailable");}
    },
    async reissue(emailInput: unknown): Promise<{issuanceId: string} | null> {
      const parsed = emailSchema.safeParse(emailInput); if (!parsed.success) return null;
      try {
        return await client.$transaction(async tx => {
          await assertTarget(tx);
          const user = await lockedUser(tx, parsed.data), time = now();
          if (!user || user.emailVerified || await tx.account.count({where: {userId: user.id, providerId: "credential", accountId: user.id}}) !== 1) return null;
          const previous = await tx.emailVerificationIssuance.findFirst({where: {userId: user.id}, orderBy: {createdAt: "desc"}});
          if (!previous || time.getTime() - previous.createdAt.getTime() < 60_000) return null;
          const active = await tx.emailVerificationIssuance.findMany({where: {userId: user.id, consumedAt: null, supersededAt: null}});
          for (const old of active) {
            await tx.emailVerificationIssuance.update({where: {id: old.id}, data: {supersededAt: time}});
            await cancelJobs(tx, old.id);
            if (old.verificationId) await tx.verification.deleteMany({where: {id: old.verificationId}});
          }
          return issue(tx, user, randomUUID(), time);
        }, transactionOptions);
      } catch {throw new ProductAuthError("verification_unavailable");}
    },
  };
}
