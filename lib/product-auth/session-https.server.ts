import "server-only";
import {createServer} from "node:https";
import type {IncomingMessage, ServerResponse} from "node:http";
import {Readable} from "node:stream";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {authJson} from "../auth/request.server.ts";
import {createAuthRateLimiter, type AuthRatePolicy, type BucketPolicy, type RateDecision} from "./rate-limit.server.ts";
import {createHttpSessionService, localSessionHttpConfiguration, sessionConnectionFromSocket, sessionHttpRequest,type SessionOperation,type VerifiedSessionConnection} from "./session-http.server.ts";
import {localDevelopmentHttpOrigin} from "./development-policy.ts";
import {ProductAuthError} from "./secrets.server.ts";
import {createAdministratorService} from "./admin.server.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export type LocalHttpsRatePolicy = Readonly<{
  login: AuthRatePolicy;
  // Explicit separate operation policies; no defaults or login-bucket aliasing.
  session: Readonly<{version: string; ip: BucketPolicy}>;
  logout: Readonly<{version: string; ip: BucketPolicy}>;
}>;
export type LocalHttpsOptions = {env: Environment; identifierKey: Uint8Array; policy: LocalHttpsRatePolicy};
type Options = LocalHttpsOptions;
function prepared(options: Options) {
  const env = Object.freeze({...options.env});
  if (process.env.NODE_ENV === "production" || env.NODE_ENV !== "development" || env.ENABLE_PRODUCT_SESSION_HTTP !== "true" ||
      (!localDevelopmentHttpOrigin(env) && env.PRODUCT_LOCAL_HTTPS_CONFIRMED !== "true") || env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED !== "true" ||
      env.PRODUCT_DATABASE_MODE !== "test" || env.PRODUCT_DATABASE_CONFIRMED !== "true") throw new ProductAuthError("configuration_unavailable");
  const config = localSessionHttpConfiguration(env), url = new URL(config.origin), port = Number(url.port);
  if ((!localDevelopmentHttpOrigin(env) && (url.protocol !== "https:" || url.hostname !== "127.0.0.1")) || !Number.isSafeInteger(port) || port < 1024 || port > 65535 ||
      !(options.identifierKey instanceof Uint8Array) || options.identifierKey.length !== 32 ||
      Buffer.from(options.identifierKey).equals(Buffer.from(config.sessionTokenKey)) ||
      Buffer.from(options.identifierKey).equals(Buffer.from(config.authSecret)) ||
      !options.policy || [options.policy.login, options.policy.session, options.policy.logout].some(p => !p?.version?.startsWith("local-"))) {
    throw new ProductAuthError("configuration_unavailable");
  }
  return {env,config,port};
}
function decision(value: RateDecision) {
  if (!value.allowed && value.reason === "unavailable") throw new ProductAuthError();
  return {allowed: value.allowed, retryAfterSeconds: value.retryAfterSeconds};
}
export async function sendHttpsResponse(outgoing: ServerResponse, response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (outgoing.destroyed || outgoing.writableEnded) return;
  for (const [key,value] of response.headers) if (key !== "set-cookie") outgoing.setHeader(key,value);
  const cookies=response.headers.getSetCookie();if(cookies.length)outgoing.setHeader("set-cookie",cookies);
  outgoing.statusCode=response.status;outgoing.end(bytes);
}
const reject = (status: number, error: string) => authJson({error},status);

// Shared direct-ingress check; no proxy metadata or client-certificate authorization.
export function directLocalHttpsConnection(incoming: IncomingMessage, origin:string) {
  const url=new URL(origin),connection=sessionConnectionFromSocket(incoming.socket);
  return connection.secure && incoming.socket.localAddress === "127.0.0.1" &&
    incoming.socket.localPort === Number(url.port) && connection.peerAddress.startsWith("127.") && !incoming.aborted ? connection : null;
}

// Shared composition for Next Node API routes and the historical HTTPS proof.
// Inert: no connections, listener, files or certificates are created/read.
export function createLocalSessionDispatcher(client:PrismaClient,options:Options) {
  const {env,config}=prepared(options);
  const sessions=createHttpSessionService(client,config);
  const admin=env.ENABLE_PRODUCT_ADMIN_HTTP === "true" ? createAdministratorService(client,sessions) : undefined;
  const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey:options.identifierKey,
    policies:{login:options.policy.login},ipOnlyPolicies:{session:options.policy.session,logout:options.policy.logout}});
  return async(request:Request,operation:SessionOperation,connection:VerifiedSessionConnection):Promise<Response>=>{
    let nextIpTokenSeconds=1;
    return sessionHttpRequest(request,operation,env,{
      connection:candidate=>candidate === request ? connection : undefined,
      limits:{storage:"shared",
        consumeIp:async(op,peer)=>{
          if(peer!==connection.peerAddress)throw new ProductAuthError();
          const result=decision(await limiter.consumeIp(op,connection.rateTransport));
          nextIpTokenSeconds=result.retryAfterSeconds;return result;
        },
        consumeAccount:async email=>{
          const result=decision(await limiter.consumeAccount("login",connection.rateTransport,email));
          return result.allowed?result:{...result,retryAfterSeconds:Math.max(nextIpTokenSeconds,result.retryAfterSeconds)};
        }},
      sessions:()=>sessions,
      ...(admin ? {administration:async(headers:Headers)=>(await admin.request(headers,false)).status === 200} : {}),
    });
  };
}
// Historical direct handler uses the same service/limiter composition as Next.
export function createLocalSessionHttpsHandler(client: PrismaClient, options: Options) {
  const {config}=prepared(options),dispatch=createLocalSessionDispatcher(client,options);
  if(!config.origin.startsWith("https:"))throw new ProductAuthError("configuration_unavailable");
  return async (incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> => {
    try {
      const connection = directLocalHttpsConnection(incoming,config.origin);
      if (!connection) {
        await sendHttpsResponse(outgoing,reject(404,"not_found"));return;
      }
      const headers=new Headers(), seen=new Set<string>();
      for(let i=0;i<incoming.rawHeaders.length;i+=2) {
        const name=incoming.rawHeaders[i].toLowerCase();
        // A direct-only listener has no authorized proxy. Refuse these rather
        // than accidentally making them part of any future trust decision.
        if(name === "forwarded" || name === "x-real-ip" || name.startsWith("x-forwarded-")) {
          await sendHttpsResponse(outgoing,reject(403,"forwarded_metadata_not_allowed"));return;
        }
        if(seen.has(name) && ["host","origin","cookie","content-length","content-type"].includes(name)) {
          await sendHttpsResponse(outgoing,reject(400,"invalid_headers"));return;
        }
        seen.add(name);headers.append(name,incoming.rawHeaders[i+1]);
      }
      if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {await sendHttpsResponse(outgoing,reject(404,"not_found"));return;}
      const url=new URL(incoming.url,config.origin);
      const operations={"/api/internal/tailor-session/login":"login","/api/internal/tailor-session/session":"session","/api/internal/tailor-session/logout":"logout"} as const;
      const operation=Object.hasOwn(operations,url.pathname)?operations[url.pathname as keyof typeof operations]:undefined;
      if(url.origin !== config.origin || !operation) {await sendHttpsResponse(outgoing,reject(404,"not_found"));return;}
      const method=incoming.method ?? "";
      const init: RequestInit & {duplex?: "half"} = {method,headers};
      if(!["GET","HEAD"].includes(method)) {init.body=Readable.toWeb(incoming) as ReadableStream<Uint8Array>;init.duplex="half";}
      const request=new Request(url,init);
      const response=await dispatch(request,operation,connection);
      await sendHttpsResponse(outgoing,response);
    } catch {await sendHttpsResponse(outgoing,reject(503,"authentication_unavailable")).catch(()=>{});}
  };
}

// API-only companion, NOT a custom Next.js server or reverse proxy. Only the
// explicitly authorized owner transport runner composes it; no Next route does.
// No certificate generation or credential file read occurs in this module.
export function createLocalSessionHttpsServer(client: PrismaClient, options: Options & {key: Buffer; cert: Buffer}) {
  return createDirectLocalHttpsListener(options,createLocalSessionHttpsHandler(client,options));
}

// Shared listener lifecycle. The original API companion and the local gateway
// use identical target/TLS/time/bind guards; no module calls listen automatically.
export function createDirectLocalHttpsListener(options: Options & {key: Buffer; cert: Buffer}, handler:(req:IncomingMessage,res:ServerResponse)=>Promise<void>) {
  const {port,config}=prepared(options);
  if(!config.origin.startsWith("https:"))throw new ProductAuthError("configuration_unavailable");
  if(!Buffer.isBuffer(options.key) || !options.key.length || !Buffer.isBuffer(options.cert) || !options.cert.length) throw new ProductAuthError("configuration_unavailable");
  const server=createServer({key:options.key,cert:options.cert,minVersion:"TLSv1.2",handshakeTimeout:5_000,requestCert:false},(req,res)=>{void handler(req,res);});
  server.requestTimeout=10_000;server.headersTimeout=5_000;server.keepAliveTimeout=5_000;server.maxHeadersCount=50;
  server.setTimeout(20_000,socket=>socket.destroy());
  server.on("upgrade",(_request,socket)=>{socket.end("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");});
  server.on("connect",(_request,socket)=>socket.destroy());
  server.on("checkContinue",(_request,response)=>{response.writeHead(417,{"connection":"close"});response.end();});
  server.on("checkExpectation",(_request,response)=>{response.writeHead(417,{"connection":"close"});response.end();});
  server.on("tlsClientError",()=>{}); // No raw provider/TLS errors are logged.
  server.on("error",()=>{}); // listen() separately rejects setup failures with a sanitized error.
  let started=false;
  return {
    // The only listen path hardcodes IPv4 loopback. No caller-selectable bind host.
    async listen() {
      if(started || process.env.NODE_ENV === "production")throw new ProductAuthError("configuration_unavailable");
      started=true;
      await new Promise<void>((resolve,rejectPromise)=>{
        const failed=()=>{server.off("listening",ready);rejectPromise(new ProductAuthError("configuration_unavailable"));};
        const ready=()=>{server.off("error",failed);resolve();};
        server.once("error",failed);server.once("listening",ready);server.listen({host:"127.0.0.1",port,exclusive:true});
      });
    },
    async close() {
      if(!server.listening)return;
      await new Promise<void>((resolve,rejectPromise)=>{server.close(error=>error ? rejectPromise(new ProductAuthError()) : resolve());server.closeAllConnections();});
    },
  };
}
