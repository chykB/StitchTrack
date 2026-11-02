import "server-only";
import {betterAuth} from "better-auth";
import {isAPIError} from "better-auth/api";
import {sessionDigestAdapter} from "./session-adapter.server.ts";
import type {Prisma, PrismaClient} from "../../prisma/product/generated/client.ts";
import {PRODUCT_TARGETS, type ProductMode} from "../../prisma/product/targets.ts";
import {loginSchema} from "../auth/schemas.ts";
import {hashPassword, verifyPassword} from "../auth/password.server.ts";
import {localSessionOrigin} from "./session-policy.ts";
import {ProductAuthError} from "./secrets.server.ts";
import {accountAccessEnabled, lockAccountAccess, readAccountAccess, withAccountAccessTransaction, type AccountAccessState} from "./account-access.server.ts";

type SessionConfig = {
  mode: ProductMode;
  authSecret: string;
  sessionTokenKey: Uint8Array;
  origin?: string; // Explicit local HTTP/HTTPS composition; legacy internal tests keep their origin.
  // Required caller decision, never a library default or the client-portal policy.
  expiresInSeconds: number;
  renewal: "none";
};
type Identity = {id: string; name: string; email: string};

// Inert factory: no connection, route, public handler, OTP API or registration API.
// The caller supplies an approved ROOT product client, never an outer test transaction.
export function createSessionService(client: PrismaClient, config: SessionConfig) {
  if (process.env.NODE_ENV === "production" || !config || !Object.hasOwn(PRODUCT_TARGETS, config.mode) ||
      typeof config.authSecret !== "string" || config.authSecret.length < 32 ||
      !Number.isSafeInteger(config.expiresInSeconds) || config.expiresInSeconds <= 0 ||
      !(config.sessionTokenKey instanceof Uint8Array) || config.sessionTokenKey.byteLength !== 32 ||
      config.expiresInSeconds > 34_560_000 || config.renewal !== "none" || typeof client?.$transaction !== "function") {
    throw new ProductAuthError("configuration_unavailable");
  }
  config = {...config, sessionTokenKey: Buffer.from(config.sessionTokenKey)};
  const origin = localSessionOrigin(config.origin ?? "http://127.0.0.1:3999");
  if (!origin) throw new ProductAuthError("configuration_unavailable");
  const authFor = (db: Prisma.TransactionClient) => betterAuth({
    baseURL: origin, secret: config.authSecret,
    database: sessionDigestAdapter(db, config.sessionTokenKey),
    telemetry: {enabled: false}, logger: {disabled: true},
    emailAndPassword: {enabled: true, disableSignUp: true, autoSignIn: false, requireEmailVerification: true,
      maxPasswordLength: Number.POSITIVE_INFINITY, password: {hash: hashPassword, verify: verifyPassword}},
    emailVerification: {sendOnSignUp: false, sendOnSignIn: false, autoSignInAfterVerification: false},
    session: {expiresIn: config.expiresInSeconds, disableSessionRefresh: true, cookieCache: {enabled: false}},
    // Internal calls accept no client IP headers. Trusted ingress/rate limits are future HTTP work.
    advanced: {useSecureCookies: origin.startsWith("https:"), ipAddress: {ipAddressHeaders: []}, defaultCookieAttributes: {httpOnly: true, sameSite: "lax", path: "/"}},
  });
  const auth = authFor(client); // Lookup/logout only; login always binds the real tx.
  async function assertTarget() {
    const rows = await client.$queryRaw<{database: string; role: string; namespace: string | null; safe: boolean}[]>`
      SELECT current_database() AS database, current_user AS role, to_regnamespace('product')::text AS namespace,
        NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe
      FROM pg_roles WHERE rolname = current_user`;
    const expected = PRODUCT_TARGETS[config.mode];
    if (rows.length !== 1 || rows[0].database !== expected.database || rows[0].role !== expected.role ||
        rows[0].namespace !== "product" || rows[0].safe !== true) throw new ProductAuthError("configuration_unavailable");
  }
  function identity(user: Identity): Identity {return {id: user.id, name: user.name, email: user.email};}
  // Cookies are sensitive transport metadata, never application JSON or logs.
  // Future HTTP callers must forward each Set-Cookie separately, not serialize these headers.
  function transportHeaders(source: Headers) {
    const headers = new Headers({"cache-control": "no-store", pragma: "no-cache"});
    for (const cookie of source.getSetCookie()) headers.append("set-cookie", cookie);
    return headers;
  }
  function cookieHeaders(input: Headers) {
    const headers = new Headers();
    const cookie = input.get("cookie"); if (cookie) headers.set("cookie", cookie);
    return headers;
  }
  async function read(headers: Headers) {
    return auth.api.getSession({headers, query: {disableCookieCache: true, disableRefresh: true}, returnHeaders: true});
  }
  return {
    // Authentication proof for an already locked User inside a real lifecycle tx.
    // Not administrative/business authorization; the caller still decides eligibility.
    async hasSessionForLockedUser(tx:Prisma.TransactionClient,input:Headers,user:AccountAccessState):Promise<boolean> {
      if(!accountAccessEnabled(user)||!user.emailVerified)return false;
      const result=await authFor(tx).api.getSession({headers:cookieHeaders(input),query:{disableCookieCache:true,disableRefresh:true}});
      return !!result&&result.user.id===user.id&&result.user.emailVerified&&result.session.expiresAt>new Date();
    },
    async login(input: unknown) {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success || !parsed.data.password.isWellFormed()) throw new ProductAuthError("login_rejected");
      try {
        // Await real commit before releasing any headers. A callback's apparent
        // success alone must not publish a cookie after failed/uncertain commit.
        return await withAccountAccessTransaction(client, config.mode, async tx => {
          const user = await lockAccountAccess(tx, {email: parsed.data.email});
          if (!user || !accountAccessEnabled(user) || !user.emailVerified) {
            // Same local Argon2id dummy work used by Better Auth's unknown-user
            // path, without allowing a newly appearing/unlocked identity to sign in.
            await hashPassword(parsed.data.password);
            throw new ProductAuthError("login_rejected");
          }
          const scoped = authFor(tx);
          const result = await scoped.api.signInEmail({body: {...parsed.data, rememberMe: true}, returnHeaders: true});
          if (result.response.user.id !== user.id) throw new ProductAuthError();
          return {user: identity(result.response.user), headers: transportHeaders(result.headers)};
        });
      } catch (error) {
        if (error instanceof ProductAuthError && error.code === "login_rejected") throw error;
        if (isAPIError(error) && ["INVALID_EMAIL_OR_PASSWORD", "EMAIL_NOT_VERIFIED"].includes(String(error.body?.code))) {
          throw new ProductAuthError("login_rejected");
        }
        throw new ProductAuthError("session_unavailable");
      }
    },
    async lookup(input: Headers) {
      try {
        await assertTarget();
        const result = await read(cookieHeaders(input)), value = result.response;
        // Authentication is not business authorization. Credential membership also
        // keeps this service separate from future passwordless client sessions.
        const state = value ? await readAccountAccess(client, value.user.id) : null;
        const credential = value?.user.emailVerified && state?.emailVerified && accountAccessEnabled(state) && value.session.expiresAt > new Date()
          ? await client.account.findFirst({where: {userId: value.user.id, accountId: value.user.id, providerId: "credential"}}) : null;
        return {session: value && credential ? {user: identity(value.user), expiresAt: value.session.expiresAt} : null,
          headers: transportHeaders(result.headers)};
      } catch {throw new ProductAuthError("session_unavailable");}
    },
    async logoutAll(input: Headers) {
      try {
        await assertTarget();
        const headers = cookieHeaders(input), current = await read(headers);
        if (!current.response?.user.emailVerified || !await client.account.findFirst({where: {
          userId: current.response.user.id, accountId: current.response.user.id, providerId: "credential"}})) {
          throw new ProductAuthError();
        }
        // Supported authenticated Better Auth operation. No caller-supplied user ID.
        await auth.api.revokeSessions({headers});
        if (await client.session.count({where: {userId: current.response.user.id}}) !== 0) throw new ProductAuthError();
        const result = await auth.api.signOut({headers, returnHeaders: true});
        return {headers: transportHeaders(result.headers)};
      } catch {throw new ProductAuthError("session_unavailable");}
    },
    async logout(input: Headers) {
      try {
        await assertTarget();
        const headers = cookieHeaders(input);
        const result = await auth.api.signOut({headers, returnHeaders: true});
        // 1.7.7 signOut swallows adapter read/delete errors. Do not report revocation
        // while the same signed cookie still resolves to a durable session.
        if ((await read(headers)).response !== null) throw new ProductAuthError();
        return {headers: transportHeaders(result.headers)};
      } catch {throw new ProductAuthError("session_unavailable");}
    },
  };
}
