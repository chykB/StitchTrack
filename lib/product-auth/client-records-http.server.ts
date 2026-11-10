import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {createHttpSessionService,localSessionHttpConfiguration,isVerifiedSessionConnection,type VerifiedSessionConnection} from "./session-http.server.ts";
import {createAuthRateLimiter,type RateDecision} from "./rate-limit.server.ts";
import {localSessionRatePolicy} from "./session-policy.ts";
import {authJson,decodeAuthRequest} from "../auth/request.server.ts";
import {clientRecordPath,clientRequestSchema} from "../client-record-contract.ts";
import {ClientRecordError,createClientRecordService} from "./client-records.server.ts";
type Env=Readonly<Record<string,string|undefined>>;
export function createLocalClientRecordDispatcher(client:PrismaClient,env:Env,identifierKey:Uint8Array){
  if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_SESSION_HTTP!=="true"||env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED!=="true")throw new ClientRecordError("unavailable");
  const config=localSessionHttpConfiguration(env),{origin}=config;
  if(Buffer.from(identifierKey).equals(Buffer.from(config.sessionTokenKey))||Buffer.from(identifierKey).equals(Buffer.from(config.authSecret)))throw new ClientRecordError("unavailable");
  const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"");
  const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey,policies:{
    "client-read":{version:policy.session.version+"-c",ip:policy.session.ip,account:policy.session.ip},
    "client-write":{...policy.login,version:policy.login.version+"-c"},
  }});
  const sessions=createHttpSessionService(client,config),service=createClientRecordService(client,sessions);
  function limited(decision:RateDecision,minimum=1){
    if(decision.allowed)return null;
    if(decision.reason==="unavailable")throw new ClientRecordError("unavailable");
    return authJson({error:"rate_limited"},429,{"retry-after":String(Math.max(minimum,decision.retryAfterSeconds))});
  }
  return async(request:Request,connection:VerifiedSessionConnection):Promise<Response>=>{
    try{
      if(process.env.NODE_ENV!=="development"||!isVerifiedSessionConnection(connection)||connection.peerAddress!=="127.0.0.1"||connection.secure!==origin.startsWith("https:"))return authJson({error:"not_found"},404);
      const url=new URL(request.url);
      if(url.origin!==origin||url.pathname!==clientRecordPath||url.search||request.headers.get("host")!==new URL(origin).host)return authJson({error:"not_found"},404);
      if(request.method!=="POST")return authJson({error:"method_not_allowed"},405,{allow:"POST"});
      if(request.headers.get("origin")!==origin||[...request.headers.keys()].some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))||
        request.headers.has("sec-fetch-site")&&!["none","same-origin"].includes(request.headers.get("sec-fetch-site")!))return authJson({error:"origin_not_allowed"},403);
      // Common IP budget is spent before body parsing; writes also spend the stricter write IP budget.
      const ip=await limiter.consumeIp("client-read",connection.rateTransport),denied=limited(ip);if(denied)return denied;
      let retryMinimum=ip.retryAfterSeconds??1;
      const decoded=await decodeAuthRequest(request);if(!decoded.ok)return decoded.response;
      const parsed=clientRequestSchema.safeParse(decoded.value);if(!parsed.success)return authJson({error:"validation_failed"},422);
      const write=parsed.data.operation==="create"||parsed.data.operation==="update",operation=write?"client-write":"client-read";
      if(write){const writeIp=await limiter.consumeIp("client-write",connection.rateTransport),denial=limited(writeIp);if(denial)return denial;retryMinimum=Math.max(retryMinimum,writeIp.retryAfterSeconds??1);}
      const current=await sessions.lookup(request.headers);if(!current.session)return authJson({error:"unauthenticated"},401);
      const account=limited(await limiter.consumeAccount(operation,connection.rateTransport,current.session.user.email),retryMinimum);if(account)return account;
      return authJson(await service.execute(request.headers,parsed.data),200);
    }catch(error){
      if(error instanceof ClientRecordError){
        if(error.code==="unauthenticated")return authJson({error:"unauthenticated"},401);
        if(error.code==="invalid_input")return authJson({error:"validation_failed"},422);
        if(error.code==="business_required")return authJson({error:"business_required"},409);
        if(error.code==="not_found")return authJson({error:"client_not_found"},404);
        if(error.code==="conflict")return authJson({error:"client_conflict"},409);
      }
      return authJson({error:"client_unavailable"},503);
    }
  };
}
