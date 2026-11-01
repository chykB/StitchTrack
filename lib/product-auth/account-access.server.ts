import "server-only";
import {z} from "zod";
import type {Prisma, PrismaClient} from "../../prisma/product/generated/client.ts";
import {PRODUCT_TARGETS, type ProductMode} from "../../prisma/product/targets.ts";
import {ProductAuthError} from "./secrets.server.ts";

export type AccountAccessState = Readonly<{
  id: string; emailVerified: boolean; disabledAt: Date | null; deletionRequestedAt: Date | null;
}>;
export type AccountLock = Readonly<{userId: string; kind: "disable" | "deletion-request"}>;
const lockSchema = z.strictObject({userId: z.string().min(1), kind: z.enum(["disable", "deletion-request"])});
export const ACCOUNT_ACCESS_TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: "ReadCommitted" as const, maxWait: 5000, timeout: 10_000,
});
function checkedState(rows: AccountAccessState[]): AccountAccessState | null {
  if (!Array.isArray(rows) || rows.length > 1) throw new ProductAuthError();
  if (!rows.length) return null;
  const r = rows[0], validTime = (v: unknown) => v === null || v instanceof Date && Number.isFinite(v.getTime());
  if (typeof r.id !== "string" || !r.id || typeof r.emailVerified !== "boolean" ||
      !validTime(r.disabledAt) || !validTime(r.deletionRequestedAt)) throw new ProductAuthError();
  return Object.freeze({...r});
}
export function accountAccessEnabled(state: AccountAccessState | null): boolean {
  return !!state && state.disabledAt === null && state.deletionRequestedAt === null;
}
export async function assertAccountAccessTarget(client: Prisma.TransactionClient, mode: ProductMode) {
  if (process.env.NODE_ENV === "production" || !Object.hasOwn(PRODUCT_TARGETS, mode)) throw new ProductAuthError();
  const rows = await client.$queryRaw<{database: string; role: string; namespace: string; safe: boolean}[]>`
    SELECT current_database() AS database, current_user AS role, to_regnamespace('product')::text AS namespace,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe
    FROM pg_roles WHERE rolname=current_user`;
  const expected = PRODUCT_TARGETS[mode];
  if (rows.length !== 1 || rows[0].database !== expected.database || rows[0].role !== expected.role ||
      rows[0].namespace !== "product" || rows[0].safe !== true) throw new ProductAuthError();
}
// Requires the ROOT client: a transaction adapter callback is not a substitute.
// No nested/fallback/root-client work inside the callback; rate counters stay outside.
export function withAccountAccessTransaction<T>(client: PrismaClient, mode: ProductMode,
  operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (typeof client?.$transaction !== "function") throw new ProductAuthError("configuration_unavailable");
  return client.$transaction(async tx => {
    await assertAccountAccessTarget(tx, mode);
    await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    return operation(tx);
  }, ACCOUNT_ACCESS_TRANSACTION_OPTIONS);
}
// User lock comes before Session/credential writes, shared by login and lifecycle.
export async function lockAccountAccess(tx: Prisma.TransactionClient, locator: {email: string} | {id: string}) {
  const rows = "email" in locator
    ? await tx.$queryRaw<AccountAccessState[]>`SELECT "id", "emailVerified", "disabledAt", "deletionRequestedAt"
        FROM "product"."User" WHERE "emailCanonical"=${locator.email} FOR UPDATE`
    : await tx.$queryRaw<AccountAccessState[]>`SELECT "id", "emailVerified", "disabledAt", "deletionRequestedAt"
        FROM "product"."User" WHERE "id"=${locator.id} FOR UPDATE`;
  return checkedState(rows);
}
export async function readAccountAccess(client: Prisma.TransactionClient, userId: string) {
  return checkedState(await client.$queryRaw<AccountAccessState[]>`SELECT "id", "emailVerified", "disabledAt", "deletionRequestedAt"
    FROM "product"."User" WHERE "id"=${userId}`);
}
// No routes, admin role, deletion request authentication or default authorization.
// The trusted server caller must supply transaction-local authorization of its
// operator/actor and target. A request's authorized:true or supplied user ID is not authority.
export function createAccountAccessService(client: PrismaClient, config: {
  mode: ProductMode;
  authorize: (tx: Prisma.TransactionClient, request: AccountLock, state: AccountAccessState) => Promise<boolean>;
}) {
  if (!config || process.env.NODE_ENV === "production" || !Object.hasOwn(PRODUCT_TARGETS, config.mode) ||
      typeof config.authorize !== "function" || typeof client?.$transaction !== "function") throw new ProductAuthError("configuration_unavailable");
  const {mode, authorize} = config;
  return {
    async lock(input: unknown): Promise<{locked: true; revokedSessions: number}> {
      const parsed = lockSchema.safeParse(input);
      if (!parsed.success) throw new ProductAuthError("account_lock_refused");
      const request = Object.freeze({...parsed.data});
      try {
        return await withAccountAccessTransaction(client, mode, async tx => {
          const user = await lockAccountAccess(tx, {id: request.userId});
          if (!user || await authorize(tx, request, user) !== true) throw new ProductAuthError("account_lock_refused");
          // Parameterized fixed SQL preserves the first timestamp; no unlock API.
          const changed = request.kind === "disable"
            ? await tx.$queryRaw<AccountAccessState[]>`WITH stamp AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) AS time)
                UPDATE "product"."User" SET "disabledAt"=COALESCE("disabledAt",stamp.time), "updatedAt"=stamp.time
                FROM stamp WHERE "id"=${user.id} RETURNING "id", "emailVerified", "disabledAt", "deletionRequestedAt"`
            : await tx.$queryRaw<AccountAccessState[]>`WITH stamp AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) AS time)
                UPDATE "product"."User" SET "deletionRequestedAt"=COALESCE("deletionRequestedAt",stamp.time), "updatedAt"=stamp.time
                FROM stamp WHERE "id"=${user.id} RETURNING "id", "emailVerified", "disabledAt", "deletionRequestedAt"`;
          const locked = checkedState(changed);
          if (!locked || locked.id !== user.id || (request.kind === "disable" ? locked.disabledAt === null : locked.deletionRequestedAt === null)) throw new ProductAuthError();
          const removed = await tx.session.deleteMany({where: {userId: user.id}});
          if (await tx.session.count({where: {userId: user.id}}) !== 0) throw new ProductAuthError();
          return {locked: true, revokedSessions: removed.count};
        });
      } catch (error) {
        if (error instanceof ProductAuthError && error.code === "account_lock_refused") throw error;
        throw new ProductAuthError("account_access_unavailable");
      }
    },
  };
}
