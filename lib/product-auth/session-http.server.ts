import "server-only";
import {Socket} from "node:net";
import {TLSSocket} from "node:tls";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {productDatabaseConfig} from "../../prisma/product/targets.ts";
import {authJson, decodeAuthRequest, parseAuthInput} from "../auth/request.server.ts";
import {createSessionService} from "./session.server.ts";
import {localSessionOrigin, TAILOR_SESSION_LIFETIME_SECONDS} from "./session-policy.ts";
import {ProductAuthError} from "./secrets.server.ts";
import {rateTransportFromSocket, type VerifiedRateTransport} from "./rate-limit.server.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export type SessionOperation = "login" | "session" | "logout";
type Operation = SessionOperation;
type SessionService = Pick<ReturnType<typeof createSessionService>, "login" | "lookup" | "logout">;
type Decision = {allowed: boolean; retryAfterSeconds: number};
export type LocalSessionHttpConfig = {
  origin: string; target: ReturnType<typeof productDatabaseConfig>; mode: "test";
  authSecret: string; sessionTokenKey: Uint8Array; expiresInSeconds: typeof TAILOR_SESSION_LIFETIME_SECONDS; renewal: "none";
};
const verifiedConnections = new WeakSet<object>();
declare const connectionBrand: unique symbol;
export type VerifiedSessionConnection = Readonly<{
  peerAddress: string; secure: boolean; rateTransport: VerifiedRateTransport; [connectionBrand]: true;
}>;
// A reviewed DIRECT server adapter supplies its request's actual socket. No
// Request/header/proxy decoder exists here; a proxy peer is not the client.
export function sessionConnectionFromSocket(socket: Socket): VerifiedSessionConnection {
  try {
    const rateTransport = rateTransportFromSocket(socket);
    const secure = socket instanceof TLSSocket;
    if (secure && (!socket.getProtocol() || !socket.getPeerFinished()?.length)) throw new Error();
    const connection = Object.freeze({peerAddress: rateTransport.peerAddress, secure, rateTransport}) as VerifiedSessionConnection;
    verifiedConnections.add(connection); return connection;
  } catch {throw new ProductAuthError("configuration_unavailable");}
}
export function isVerifiedSessionConnection(value:unknown):value is VerifiedSessionConnection {
  return typeof value==="object" && value!==null && verifiedConnections.has(value);
}
export type SessionHttpDependencies = {
  // Must use actual socket/TLS metadata from a reviewed server adapter, never headers.
  connection?: (request: Request) => VerifiedSessionConnection | undefined;
  limits?: {
    storage: "shared"; // Contract for a reviewed shared store, NOT proof supplied by a flag.
    consumeIp: (operation: Operation, peer: string) => Promise<Decision>;
    consumeAccount: (canonicalEmail: string) => Promise<Decision>;
  };
  sessions?: (config: LocalSessionHttpConfig) => SessionService;
};
export const sessionPaths = {login: "/api/internal/tailor-session/login", session: "/api/internal/tailor-session/session", logout: "/api/internal/tailor-session/logout"} as const;
function reply(body: unknown, status: number, cookies?: Headers) {
  const response = authJson(body, status); response.headers.set("pragma", "no-cache");
  for (const value of cookies?.getSetCookie() ?? []) response.headers.append("set-cookie", value);
  return response;
}
const unavailable = () => reply({error: "authentication_unavailable"}, 503);
function loopbackPeer(peer: string): string | null {
  // Already canonicalized and validated by rateTransportFromSocket.
  return peer === "::1" || peer.startsWith("127.") ? peer : null;
}
export function localSessionHttpConfiguration(env: Environment): LocalSessionHttpConfig {
  const origin = localSessionOrigin(env.PRODUCT_SESSION_HTTP_ORIGIN ?? "");
  const authSecret = env.PRODUCT_SESSION_HTTP_AUTH_SECRET;
  const encoded = env.PRODUCT_SESSION_TOKEN_KEY;
  if (!origin || !authSecret || authSecret.length < 32 || !encoded) throw new ProductAuthError();
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded || key.equals(Buffer.from(authSecret))) throw new ProductAuthError();
  const target = productDatabaseConfig(env);
  if (target.mode !== "test") throw new ProductAuthError();
  return {origin, target, mode: "test", authSecret, sessionTokenKey: key, expiresInSeconds: TAILOR_SESSION_LIFETIME_SECONDS, renewal: "none"};
}
// Inert composition helper: client ownership/lifecycle remains with the reviewed caller.
export function createHttpSessionService(client: PrismaClient, config: LocalSessionHttpConfig): SessionService {
  return createSessionService(client, {mode: "test", authSecret: config.authSecret, sessionTokenKey: config.sessionTokenKey,
    origin: config.origin, expiresInSeconds: TAILOR_SESSION_LIFETIME_SECONDS, renewal: "none"});
}
function limited(decision: Decision): Response | null {
  if (typeof decision?.allowed !== "boolean" || !Number.isSafeInteger(decision.retryAfterSeconds) || decision.retryAfterSeconds < 1) {
    throw new ProductAuthError();
  }
  if (decision.allowed) return null;
  const response = reply({error: "rate_limited"}, 429);
  response.headers.set("retry-after", String(decision.retryAfterSeconds)); return response;
}
function userData(user: {id: string; name: string; email: string}) {
  return {id: user.id, name: user.name, email: user.email};
}
// Shared Fetch boundary. Reviewed Node transports supply the existing session
// service, shared counters and opaque socket metadata. Missing dependencies fail
// closed; this function constructs no client or fallback.
export async function sessionHttpRequest(request: Request, operation: Operation, env: Environment,
  dependencies: SessionHttpDependencies = {}): Promise<Response> {
  if (process.env.NODE_ENV === "production" || env.NODE_ENV !== "development" || env.ENABLE_PRODUCT_SESSION_HTTP !== "true" ||
      env.PRODUCT_DATABASE_MODE !== "test" || env.PRODUCT_DATABASE_CONFIRMED !== "true") return reply({error: "not_found"}, 404);
  try {
    const config = localSessionHttpConfiguration(env), url = new URL(request.url);
    if (url.origin !== config.origin || request.headers.get("host") !== url.host || url.pathname !== sessionPaths[operation]) return reply({error: "not_found"}, 404);
    if (url.search) return reply({error: "query_not_allowed"}, 400);
    const expectedMethod = operation === "session" ? "GET" : "POST";
    if (request.method !== expectedMethod) {const response = reply({error: "method_not_allowed"}, 405); response.headers.set("allow", expectedMethod); return response;}
    const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    // Strict Origin + JSON on mutations; no CORS opt-in. SameSite=Lax alone is not CSRF protection.
    if ((operation !== "session" && origin !== config.origin) || (origin !== null && origin !== config.origin) ||
        (site !== null && !["same-origin", "none"].includes(site))) return reply({error: "origin_not_allowed"}, 403);
    if (!dependencies.connection || dependencies.limits?.storage !== "shared" || !dependencies.sessions) return unavailable();
    const connection = dependencies.connection(request);
    if (!isVerifiedSessionConnection(connection)) return reply({error: "not_found"}, 404);
    const peer = loopbackPeer(connection.peerAddress);
    if (!peer || connection.secure !== (url.protocol === "https:")) return reply({error: "not_found"}, 404);
    const ipLimit = limited(await dependencies.limits.consumeIp(operation, peer)); if (ipLimit) return ipLimit;
    let input: unknown;
    if (operation !== "session") {
      const decoded = await decodeAuthRequest(request); if (!decoded.ok) return decoded.response;
      if (operation === "login") {
        const parsed = parseAuthInput("login", decoded.value);
        if (!parsed.ok) return reply({error: "validation_failed", fields: parsed.fields}, 422);
        if (parsed.value.operation !== "login") throw new ProductAuthError();
        input = parsed.value.data;
        const accountLimit = limited(await dependencies.limits.consumeAccount(parsed.value.data.email)); if (accountLimit) return accountLimit;
      } else if (!decoded.value || typeof decoded.value !== "object" || Array.isArray(decoded.value) || Object.keys(decoded.value).length !== 0) {
        return reply({error: "validation_failed"}, 422);
      }
    }
    const service = dependencies.sessions(config);
    if (operation === "login") {
      const result = await service.login(input); return reply({user: userData(result.user)}, 200, result.headers);
    }
    // Minimal protected identity boundary. No browser-supplied identity or business scope.
    const result = await service.lookup(request.headers);
    if (!result.session) return reply({error: "unauthenticated"}, 401, result.headers);
    if (operation === "session") return reply({user: userData(result.session.user), expiresAt: result.session.expiresAt.toISOString()}, 200, result.headers);
    const logout = await service.logout(request.headers); return reply({loggedOut: true}, 200, logout.headers);
  } catch (error) {
    if (operation === "login" && error instanceof ProductAuthError && error.code === "login_rejected") {
      return reply({error: "invalid_credentials"}, 401);
    }
    // No raw errors, causes, credentials, cookies or provider details leave the boundary.
    return unavailable();
  }
}
// Server-only authorization seam for future business routes. It obtains identity
// from authoritative lookup, never a supplied user ID; missing permission denies.
// There is no business route/model implementation in this slice.
export async function requireBusinessSession(service: SessionService, headers: Headers,
  authorize: (userId: string) => Promise<boolean>) {
  try {
    const result = await service.lookup(headers);
    if (!result.session) return reply({error: "unauthenticated"}, 401, result.headers);
    if (!await authorize(result.session.user.id)) return reply({error: "forbidden"}, 403, result.headers);
    return result;
  } catch {return unavailable();}
}
