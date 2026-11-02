import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {createPasswordResetService} from "./password-reset.server.ts";
import {keyRingFromEnvironment,ProductAuthError} from "./secrets.server.ts";
import {createAuthRateLimiter,type AuthRatePolicy} from "./rate-limit.server.ts";
import {productDatabaseConfig} from "../../prisma/product/targets.ts";
import {localDevelopmentHttpOrigin} from "./development-policy.ts";
import {isVerifiedSessionConnection,type VerifiedSessionConnection} from "./session-http.server.ts";
import {authJson,decodeAuthRequest} from "../auth/request.server.ts";
import {checkPwnedPassword} from "../auth/breach-check.server.ts";
import {resetPaths,resetRequestSchema,resetCodeSchema,resetCompleteSchema,type ResetOperation} from "../auth/password-reset-contract.ts";
type Env=Readonly<Record<string,string|undefined>>;
// Shared Node adapter validates framing/socket/TLS/Origin first; this boundary also
// independently enforces request origin, body schemas and opaque transport identity.
export function createLocalPasswordResetDispatcher(client:PrismaClient,env:Env,identifierKey:Uint8Array,
 overrides:{checkPassword?:typeof checkPwnedPassword;service?:ReturnType<typeof createPasswordResetService>}={}){
 const origin=localDevelopmentHttpOrigin(env)??"https://127.0.0.1:3443";
 if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_PASSWORD_RESET_HTTP!=="true"||
  env.PRODUCT_RESET_RATE_POLICY_CONFIRMED!=="true"||env.PRODUCT_SESSION_HTTP_ORIGIN!==origin||productDatabaseConfig(env).mode!=="test")throw new ProductAuthError();
 let policy:AuthRatePolicy;try{policy=JSON.parse(env.PRODUCT_RESET_RATE_POLICY??"");if(!policy.version.startsWith("local-"))throw new Error();}catch{throw new ProductAuthError();}
 const verifierKeys=keyRingFromEnvironment(env,"PRODUCT_EMAIL_VERIFIER"),outboxKeys=keyRingFromEnvironment(env,"PRODUCT_EMAIL_OUTBOX");
 for(const ring of [verifierKeys,outboxKeys])for(const key of ring.keys.values())if(Buffer.from(key).equals(Buffer.from(identifierKey))||
  Buffer.from(key).equals(Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY??"","base64"))||Buffer.from(key).equals(Buffer.from(env.PRODUCT_SESSION_HTTP_AUTH_SECRET??"")))throw new ProductAuthError();
 const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey,policies:{reset:policy}});
 const service=overrides.service??createPasswordResetService(client,{authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET??"",verifierKeys,outboxKeys,checkPassword:overrides.checkPassword??checkPwnedPassword});
 const denied=(d:Awaited<ReturnType<typeof limiter.consumeIp>>)=>{if(d.allowed)return null;if(d.reason==="unavailable")throw new ProductAuthError();return authJson({error:"rate_limited"},429,{"retry-after":String(d.retryAfterSeconds)});};
 return async(request:Request,operation:ResetOperation,connection:VerifiedSessionConnection):Promise<Response>=>{
  try{
   if(process.env.NODE_ENV!=="development"||!isVerifiedSessionConnection(connection)||connection.peerAddress!=="127.0.0.1"||connection.secure!==origin.startsWith("https:"))return authJson({error:"not_found"},404);
   const url=new URL(request.url);
   if(request.method!=="POST"||url.origin!==origin||url.pathname!==resetPaths[operation]||url.search||request.headers.get("host")!==new URL(origin).host)return authJson({error:"not_found"},404);
   if(request.headers.get("origin")!==origin||[...request.headers.keys()].some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))||
    request.headers.has("sec-fetch-site")&&!["none","same-origin"].includes(request.headers.get("sec-fetch-site")!))return authJson({error:"origin_not_allowed"},403);
   const ipDecision=await limiter.consumeIp("reset",connection.rateTransport);const ip=denied(ipDecision);if(ip)return ip;
   const decoded=await decodeAuthRequest(request);if(!decoded.ok)return decoded.response;
   const schema=operation==="request"?resetRequestSchema:operation==="check"?resetCodeSchema:resetCompleteSchema;
   const parsed=schema.safeParse(decoded.value);if(!parsed.success)return authJson({error:"validation_failed"},422);
   const accountDecision=await limiter.consumeAccount("reset",connection.rateTransport,parsed.data.email);
   const account=denied(!accountDecision.allowed&&accountDecision.reason==="rate_limited"&&ipDecision.allowed?
    {...accountDecision,retryAfterSeconds:Math.max(accountDecision.retryAfterSeconds,ipDecision.retryAfterSeconds)}:accountDecision);if(account)return account;
   if(operation==="request"){await service.request(parsed.data);return authJson({accepted:true},202);}
   const valid=operation==="check"?await service.check(parsed.data):await service.complete(parsed.data);
   return valid?authJson(operation==="check"?{valid:true}:{reset:true},200):authJson({error:"invalid_code"},400);
  }catch(error){const rejected=error instanceof ProductAuthError&&error.code==="password_rejected";return authJson({error:rejected?"password_rejected":"reset_unavailable"},rejected?422:503);}
 };
}
