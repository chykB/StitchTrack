import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {createHttpSessionService,localSessionHttpConfiguration,isVerifiedSessionConnection,type VerifiedSessionConnection} from "./session-http.server.ts";
import {createAccountDeletionService} from "./account-deletion.server.ts";
import {createAuthRateLimiter,type RateDecision} from "./rate-limit.server.ts";
import {localSessionRatePolicy} from "./session-policy.ts";
import {localDevelopmentHttpOrigin} from "./development-policy.ts";
import {ProductAuthError} from "./secrets.server.ts";
import {accountDeletionPath,accountDeletionSchema} from "../auth/account-deletion-contract.ts";
import {authJson,decodeAuthRequest} from "../auth/request.server.ts";
type Env=Readonly<Record<string,string|undefined>>;
// Same Node socket/raw-header transport and shared pool as login. Default off/test only.
export function createLocalAccountDeletionDispatcher(client:PrismaClient,env:Env,identifierKey:Uint8Array){
 if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP!=="true"||env.ENABLE_PRODUCT_SESSION_HTTP!=="true"||
  env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED!=="true"||(!localDevelopmentHttpOrigin(env)&&(env.PRODUCT_LOCAL_HTTPS_CONFIRMED!=="true"||env.PRODUCT_SESSION_HTTP_ORIGIN!=="https://127.0.0.1:3443")))throw new ProductAuthError();
 const config=localSessionHttpConfiguration(env),{origin}=config;
 if(Buffer.from(identifierKey).equals(Buffer.from(config.sessionTokenKey))||Buffer.from(identifierKey).equals(Buffer.from(config.authSecret)))throw new ProductAuthError();
 // Password confirmation shares the approved login budgets: no second guessing channel.
 const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey,policies:{login:localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"").login}});
 const sessions=createHttpSessionService(client,config),deletion=createAccountDeletionService(client,sessions);
 function limited(d:RateDecision,minimum=1){if(d.allowed)return null;if(d.reason==="unavailable")throw new ProductAuthError();return authJson({error:"rate_limited"},429,{"retry-after":String(Math.max(minimum,d.retryAfterSeconds))});}
 return async(request:Request,connection:VerifiedSessionConnection):Promise<Response>=>{
  try{
   if(process.env.NODE_ENV!=="development"||!isVerifiedSessionConnection(connection)||connection.peerAddress!=="127.0.0.1"||connection.secure!==origin.startsWith("https:"))return authJson({error:"not_found"},404);
   const url=new URL(request.url);
   if(url.origin!==origin||url.pathname!==accountDeletionPath||url.search||request.headers.get("host")!==new URL(origin).host)return authJson({error:"not_found"},404);
   if(request.method!=="POST")return authJson({error:"method_not_allowed"},405,{allow:"POST"});
   if(request.headers.get("origin")!==origin||[...request.headers.keys()].some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))||
    request.headers.has("sec-fetch-site")&&!["none","same-origin"].includes(request.headers.get("sec-fetch-site")!))return authJson({error:"origin_not_allowed"},403);
   const ip=await limiter.consumeIp("login",connection.rateTransport),ipReply=limited(ip);if(ipReply)return ipReply;
   const decoded=await decodeAuthRequest(request);if(!decoded.ok)return decoded.response;
   const parsed=accountDeletionSchema.safeParse(decoded.value);if(!parsed.success)return authJson({error:"validation_failed"},422);
   const current=await sessions.lookup(request.headers);if(!current.session)return authJson({error:"invalid_credentials"},401);
   const accountReply=limited(await limiter.consumeAccount("login",connection.rateTransport,current.session.user.email),ip.retryAfterSeconds!);if(accountReply)return accountReply;
   const result=await deletion.request(request.headers,parsed.data),response=authJson({requested:true},200);
   for(const cookie of result.headers.getSetCookie())response.headers.append("set-cookie",cookie);
   return response;
  }catch(error){return error instanceof ProductAuthError&&error.code==="deletion_rejected"?authJson({error:"invalid_credentials"},401):authJson({error:"deletion_unavailable"},503);}
 };
}
