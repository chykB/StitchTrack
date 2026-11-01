import "server-only";
import {createHmac} from "node:crypto";
import {prismaAdapter} from "@better-auth/prisma-adapter";
import type {BetterAuthOptions, DBAdapter, Where} from "better-auth/types";
import type {Prisma} from "../../prisma/product/generated/client.ts";
import {ProductAuthError} from "./secrets.server.ts";

// Dedicated session-storage key, not the cookie-signing, OTP or outbox key.
// Copy once; retain no raw tokens between adapter calls. Rotation invalidates old sessions.
export function sessionTokenDigester(key: Uint8Array) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) throw new ProductAuthError("configuration_unavailable");
  const privateKey = Buffer.from(key);
  return (token: unknown): string => {
    // Installed Better Auth 1.7.7 generateId(32). Digest strings are never valid input.
    if (typeof token !== "string" || !/^[A-Za-z0-9]{32}$/u.test(token)) throw new ProductAuthError("invalid_session_token");
    return "hmac-sha256:v1:" + createHmac("sha256", privateKey)
      .update("stitchtrack/session-token/v1\0").update(token, "ascii").digest("hex");
  };
}

// Public DBAdapter composition, not patched library internals or Prisma delegates.
// Scoped to this private fixed-expiry service: no plugins, hooks, secondary store,
// cookie cache, session updates or generic public Better Auth handler.
export function sessionDigestAdapter(client: Prisma.TransactionClient, key: Uint8Array) {
  const digest = sessionTokenDigester(key);
  return (options: BetterAuthOptions): DBAdapter => {
    if (options.secondaryStorage || options.plugins?.length || options.databaseHooks?.session ||
        options.session?.cookieCache?.enabled || options.session?.disableSessionRefresh !== true ||
        options.session?.modelName || options.session?.fields) throw new ProductAuthError("configuration_unavailable");
    const base = prismaAdapter(client, {provider: "postgresql", transaction: false, debugLogs: false})(options);
    function predicates(where: Where[] = []) {
      const rawByDigest = new Map<string, string>();
      const converted = where.map(condition => {
        if (condition.field !== "token") return condition;
        if (condition.mode === "insensitive" || !["eq", "in"].includes(condition.operator ?? "eq")) throw new ProductAuthError("unsupported_session_operation");
        const encode = (value: unknown) => {const stored = digest(value); rawByDigest.set(stored, value as string); return stored;};
        return {...condition, value: condition.operator === "in"
          ? (Array.isArray(condition.value) ? condition.value.map(encode) : (() => {throw new ProductAuthError();})())
          : encode(condition.value)};
      });
      return {converted, rawByDigest};
    }
    function restore<T>(row: T, rawByDigest: Map<string, string>): T {
      if (!row || typeof row !== "object" || !("token" in row)) return row;
      const {token: stored, ...metadata} = row;
      const raw = typeof stored === "string" ? rawByDigest.get(stored) : undefined;
      // User/id-based enumeration can provide metadata for bulk deletion hooks,
      // but cannot recover a bearer token. Never return the stored digest instead.
      if (rawByDigest.size && raw === undefined) throw new ProductAuthError("invalid_session_storage");
      return (raw === undefined ? metadata : {...metadata, token: raw}) as T;
    }
    function guardJoin(args: {model: string; join?: Record<string, unknown>}) {
      if (args.model !== "session" && args.join && Object.keys(args.join).some(key => /sessions?/iu.test(key))) {
        throw new ProductAuthError("unsupported_session_operation");
      }
    }
    const adapter: DBAdapter = {
      ...base,
      // transaction:false: this ONLY invokes the callback with the wrapped adapter.
      // No BEGIN/COMMIT/rollback; it inherits an externally supplied Prisma tx, if any.
      // Multi-record credential/status changes must use a real outer transaction.
      transaction: async callback => callback(adapter),
      create: async <T extends Record<string, unknown>, R = T>(args: {
        model: string; data: Omit<T, "id">; select?: string[]; forceAllowId?: boolean;
      }): Promise<R> => {
        if (args.model !== "session") return base.create<T, R>(args);
        const token = args.data.token, stored = digest(token);
        const row = await base.create<T, R>({...args, data: {...args.data, token: stored}});
        return restore(row, new Map([[stored, token as string]]));
      },
      findOne: async args => {
        guardJoin(args);
        if (args.model !== "session") return base.findOne(args);
        const {converted, rawByDigest} = predicates(args.where);
        return restore(await base.findOne({...args, where: converted}), rawByDigest);
      },
      findMany: async <T>(args: Parameters<DBAdapter["findMany"]>[0]): Promise<T[]> => {
        guardJoin(args);
        if (args.model !== "session") return base.findMany<T>(args);
        const {converted, rawByDigest} = predicates(args.where);
        return (await base.findMany<T>({...args, where: converted})).map(row => restore(row, rawByDigest));
      },
      count: args => args.model === "session" ? base.count({...args, where: predicates(args.where).converted}) : base.count(args),
      delete: args => args.model === "session" ? base.delete({...args, where: predicates(args.where).converted}) : base.delete(args),
      deleteMany: args => args.model === "session" ? base.deleteMany({...args, where: predicates(args.where).converted}) : base.deleteMany(args),
      update: args => {if (args.model === "session") throw new ProductAuthError("unsupported_session_operation"); return base.update(args);},
      updateMany: args => {if (args.model === "session") throw new ProductAuthError("unsupported_session_operation"); return base.updateMany(args);},
      consumeOne: args => {if (args.model === "session") throw new ProductAuthError("unsupported_session_operation"); return base.consumeOne(args);},
      incrementOne: args => {if (args.model === "session") throw new ProductAuthError("unsupported_session_operation"); return base.incrementOne(args);},
    };
    return adapter;
  };
}
