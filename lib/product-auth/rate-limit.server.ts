import "server-only";
import {createHmac} from "node:crypto";
import {isIP, Socket} from "node:net";
import type {Prisma} from "../../prisma/product/generated/client.ts";
import {PRODUCT_TARGETS, PRODUCT_MIGRATORS, type ProductMode} from "../../prisma/product/targets.ts";
import {reportRegistrationFailure} from "./secrets.server.ts";
import {emailSchema} from "../auth/schemas.ts";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
export type AuthRateOperation = "login" | "signup" | "reset" | "verify-email" | "resend-verification" | "business-read" | "business-write" | "client-read" | "client-write" | "measurement-read" | "measurement-write" | "order-read" | "order-write";
export type AuthIpOperation = AuthRateOperation | "session" | "logout";
export type BucketPolicy = Readonly<{capacity: number; refillIntervalMs: number}>;
export type AuthRatePolicy = Readonly<{version: string; account: BucketPolicy; ip: BucketPolicy}>;
export type RateDecision =
  | {allowed: true; retryAfterSeconds: number}
  | {allowed: false; reason: "rate_limited"; retryAfterSeconds: number}
  | {allowed: false; reason: "unavailable"; retryAfterSeconds: null};
// Allowed split-IP decisions retain the next-token delay so a later account
// denial can report the longer of the two budgets. Combined allows retain 1.
const unavailable = (): RateDecision => ({allowed: false, reason: "unavailable", retryAfterSeconds: null});
const verifiedPeers = new WeakSet<object>();
declare const transportBrand: unique symbol;
export type VerifiedRateTransport = Readonly<{peerAddress: string; [transportBrand]: true}>;

function normalizeIp(value: string): string {
  if (typeof value !== "string" || value !== value.trim() || value.includes("%")) throw new Error();
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) throw new Error();
  // WHATWG URL canonicalizes case, leading zeros and IPv6 zero compression.
  const host = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(host);
  if (!mapped) return host;
  const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
// Only a reviewed server transport adapter may call this with its actual socket.
// No Request/Headers/X-Forwarded-For input or proxy-header fallback is accepted.
// A reverse proxy's peer is the proxy, NOT an independently authenticated client IP.
export function rateTransportFromSocket(socket: Socket): VerifiedRateTransport {
  try {
    if (!(socket instanceof Socket) || !socket.remoteAddress) throw new Error();
    const result = Object.freeze({peerAddress: normalizeIp(socket.remoteAddress)}) as VerifiedRateTransport;
    verifiedPeers.add(result); return result;
  } catch {throw new Error("Verified socket peer required.");}
}
function validPolicy(value: BucketPolicy) {
  return value && Number.isSafeInteger(value.capacity) && value.capacity > 0 &&
    Number.isSafeInteger(value.refillIntervalMs) && value.refillIntervalMs > 0 &&
    value.capacity * value.refillIntervalMs <= 2_147_483_647;
}
async function assertTarget(client: Database, mode: ProductMode, maintenance = false) {
  const rows = await client.$queryRaw<{database: string; role: string; namespace: string; safe: boolean}[]>`
    SELECT current_database() AS database, current_user AS role, to_regnamespace('product')::text AS namespace,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe
    FROM pg_roles WHERE rolname = current_user`;
  const expected = PRODUCT_TARGETS[mode];
  if (!expected || rows.length !== 1 || rows[0].database !== expected.database ||
      rows[0].role !== (maintenance ? PRODUCT_MIGRATORS[mode] : expected.role) ||
      rows[0].namespace !== "product" || rows[0].safe !== true) throw new Error();
}
function validMode(mode: ProductMode) {
  return process.env.NODE_ENV !== "production" && Object.hasOwn(PRODUCT_TARGETS, mode);
}

// Inert factory. No connection, env-file read, route activation or numerical
// product-policy defaults. key is a dedicated, independently generated 32-byte
// authentication rate-limit HMAC key, never an OTP/session/outbox key.
export function createAuthRateLimiter(client: Database, config: {
  mode: ProductMode; identifierKey: Uint8Array;
  policies: Partial<Record<AuthRateOperation, AuthRatePolicy>>;
  ipOnlyPolicies?: Partial<Record<"session" | "logout", Readonly<{version: string; ip: BucketPolicy}>>>;
}) {
  if (!config || !validMode(config.mode) || !(config.identifierKey instanceof Uint8Array) || config.identifierKey.length !== 32 ||
      !config.policies || !Object.keys(config.policies).length) throw new Error("Authentication rate-limit configuration required.");
  const policies = new Map<AuthRateOperation, AuthRatePolicy>();
  for (const [operation, policy] of Object.entries(config.policies)) {
    if (!["login", "signup", "reset", "verify-email", "resend-verification", "business-read", "business-write", "client-read", "client-write", "measurement-read", "measurement-write", "order-read", "order-write"].includes(operation) || !policy || !/^[A-Za-z0-9_-]{1,48}$/u.test(policy.version) ||
        !validPolicy(policy.account) || !validPolicy(policy.ip)) throw new Error("Authentication rate-limit configuration required.");
    policies.set(operation as AuthRateOperation, {version: policy.version, account: {...policy.account}, ip: {...policy.ip}});
  }
  const ipPolicies = new Map<AuthIpOperation, Readonly<{version: string; ip: BucketPolicy}>>(policies);
  for (const [operation, policy] of Object.entries(config.ipOnlyPolicies ?? {})) {
    if (!["session", "logout"].includes(operation) || !policy || !/^[A-Za-z0-9_-]{1,48}$/u.test(policy.version) || !validPolicy(policy.ip)) {
      throw new Error("Authentication rate-limit configuration required.");
    }
    ipPolicies.set(operation as "session" | "logout", {version: policy.version, ip: {...policy.ip}});
  }
  const key = Buffer.from(config.identifierKey), mode = config.mode;
  function bucketKey(operation: AuthIpOperation, version: string, kind: "account" | "ip", identity: string) {
    return "rl:v1:" + createHmac("sha256", key).update(JSON.stringify(["stitchtrack/auth-rate/v1", operation, version, kind, identity])).digest("hex");
  }
  async function spend(digest: string, policy: BucketPolicy): Promise<{allowed: boolean; retryAfterSeconds: number}> {
    const rows = await client.$queryRaw<{allowed: boolean; retryAfterSeconds: number}[]>`
      INSERT INTO "product"."AuthRateBucket" AS b
        ("keyDigest", "capacity", "refillIntervalMs", "tokens", "refilledAt", "expiresAt", "lastAllowed")
      SELECT ${digest}, ${policy.capacity}::integer, ${policy.refillIntervalMs}::integer,
        ${policy.capacity - 1}::integer, t.now, t.now + ${policy.refillIntervalMs}::integer * INTERVAL '1 millisecond', true
      FROM (SELECT date_trunc('milliseconds', clock_timestamp()) AS now) t WHERE true
      ON CONFLICT ("keyDigest") DO UPDATE
      SET ("tokens", "refilledAt", "expiresAt", "lastAllowed") = (
        SELECT GREATEST(0, credits.available - 1), stamp.refilled,
          stamp.refilled + (b."capacity" - GREATEST(0, credits.available - 1)) * b."refillIntervalMs" * INTERVAL '1 millisecond',
          credits.available >= 1
        FROM LATERAL (SELECT GREATEST(b."refilledAt", date_trunc('milliseconds', clock_timestamp())) AS now) t
        CROSS JOIN LATERAL (SELECT LEAST(b."capacity"::bigint,
          floor(extract(epoch FROM (t.now - b."refilledAt")) * 1000 / b."refillIntervalMs")::bigint) AS gained) refill
        CROSS JOIN LATERAL (SELECT LEAST(b."capacity"::bigint, b."tokens" + refill.gained)::integer AS available) credits
        CROSS JOIN LATERAL (SELECT CASE WHEN credits.available = b."capacity" THEN t.now
          ELSE b."refilledAt" + refill.gained * b."refillIntervalMs" * INTERVAL '1 millisecond' END AS refilled) stamp
      )
      WHERE b."capacity" = EXCLUDED."capacity" AND b."refillIntervalMs" = EXCLUDED."refillIntervalMs"
      RETURNING "lastAllowed" AS allowed, CASE WHEN "tokens" >= 1 THEN 1 ELSE
        GREATEST(1, ceil(extract(epoch FROM ("refilledAt" + "refillIntervalMs" * INTERVAL '1 millisecond' - clock_timestamp()))))::integer
        END AS "retryAfterSeconds"`;
    if (rows.length !== 1 || typeof rows[0].allowed !== "boolean" || !Number.isSafeInteger(rows[0].retryAfterSeconds) || rows[0].retryAfterSeconds < 1) throw new Error();
    return rows[0];
  }
  return {
    // Split operations support HTTP IP enforcement before parsing. Both decisions
    // remain mandatory for login; consumed IP tokens are never refunded.
    async consumeIp(operation: AuthIpOperation, transport: VerifiedRateTransport): Promise<RateDecision> {
      try {
        const policy = ipPolicies.get(operation);
        if (!validMode(mode) || !policy || !transport || !verifiedPeers.has(transport)) return unavailable();
        await assertTarget(client, mode);
        const result = await spend(bucketKey(operation, policy.version, "ip", transport.peerAddress), policy.ip);
        return result.allowed ? {allowed: true, retryAfterSeconds: result.retryAfterSeconds} : {allowed: false, reason: "rate_limited", retryAfterSeconds: result.retryAfterSeconds};
      } catch(error) {if(["signup","verify-email","resend-verification"].includes(operation))reportRegistrationFailure("rate_limit_ip",error);return unavailable();}
    },
    async consumeAccount(operation: AuthRateOperation, transport: VerifiedRateTransport, email: unknown): Promise<RateDecision> {
      try {
        const policy = policies.get(operation), parsed = emailSchema.safeParse(email);
        if (!validMode(mode) || !policy || !transport || !verifiedPeers.has(transport) || !parsed.success) return unavailable();
        await assertTarget(client, mode);
        const result = await spend(bucketKey(operation, policy.version, "account", parsed.data), policy.account);
        return result.allowed ? {allowed: true, retryAfterSeconds: 1} : {allowed: false, reason: "rate_limited", retryAfterSeconds: result.retryAfterSeconds};
      } catch(error) {if(["signup","verify-email","resend-verification"].includes(operation))reportRegistrationFailure("rate_limit_account",error);return unavailable();}
    },
    // Call before password verification, for every attempt including successes.
    // No user lookup: unknown/known emails have exactly the same bucket path.
    async consume(operation: AuthRateOperation, transport: VerifiedRateTransport, email: unknown): Promise<RateDecision> {
      try {
        const policy = policies.get(operation), parsed = emailSchema.safeParse(email);
        if (!validMode(mode) || !policy || !transport || !verifiedPeers.has(transport) || !parsed.success) return unavailable();
        await assertTarget(client, mode);
        const ip = await spend(bucketKey(operation, policy.version, "ip", transport.peerAddress), policy.ip);
        if (!ip.allowed) return {allowed: false, reason: "rate_limited", retryAfterSeconds: ip.retryAfterSeconds};
        // No refunds: IP consumption remains if account denies or storage fails.
        const account = await spend(bucketKey(operation, policy.version, "account", parsed.data), policy.account);
        return account.allowed ? {allowed: true, retryAfterSeconds: 1}
          : {allowed: false, reason: "rate_limited", retryAfterSeconds: Math.max(ip.retryAfterSeconds, account.retryAfterSeconds)};
      } catch {return unavailable();} // Never leak native SQL errors or identity/key material.
    },
  };
}

// Separate owner/maintenance operation, never run by factory/import/consume.
// Expiration means full refill; removing that row cannot replenish prematurely.
// Runtime app roles receive NO DELETE grant. SKIP LOCKED keeps batches bounded.
export async function cleanupExpiredAuthRateBuckets(client: Database, mode: ProductMode, batchSize: number): Promise<{deleted: number} | null> {
  try {
    if (!validMode(mode) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) return null;
    await assertTarget(client, mode, true);
    const rows = await client.$queryRaw<{deleted: number}[]>`
      WITH expired AS (
        SELECT "keyDigest" FROM "product"."AuthRateBucket"
        WHERE "expiresAt" <= date_trunc('milliseconds', clock_timestamp())
        ORDER BY "expiresAt", "keyDigest" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      ), removed AS (
        DELETE FROM "product"."AuthRateBucket" b USING expired e
        WHERE b."keyDigest" = e."keyDigest" AND b."expiresAt" <= date_trunc('milliseconds', clock_timestamp())
        RETURNING 1
      ) SELECT count(*)::integer AS deleted FROM removed`;
    if (rows.length !== 1 || !Number.isSafeInteger(rows[0].deleted) || rows[0].deleted < 0 || rows[0].deleted > batchSize) return null;
    return {deleted: rows[0].deleted};
  } catch {return null;}
}
