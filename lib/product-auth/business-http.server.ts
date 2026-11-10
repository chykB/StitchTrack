import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {createHttpSessionService,localSessionHttpConfiguration,isVerifiedSessionConnection,type VerifiedSessionConnection} from "./session-http.server.ts";
import {createAuthRateLimiter,type RateDecision} from "./rate-limit.server.ts";
import {localSessionRatePolicy} from "./session-policy.ts";
import {authJson,decodeAuthRequest} from "../auth/request.server.ts";
import {businessPath,businessWriteSchema} from "../business-contract.ts";
import {BusinessError,createBusinessService} from "./business.server.ts";
type Env=Readonly<Record<string,string|undefined>>;
export function createLocalBusinessDispatcher(client:PrismaClient,env:Env,identifierKey:Uint8Array){
  if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_SESSION_HTTP!=="true"||env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED!=="true")throw new BusinessError("unavailable");
  const config=localSessionHttpConfiguration(env),{origin}=config;
  if(Buffer.from(identifierKey).equals(Buffer.from(config.sessionTokenKey))||Buffer.from(identifierKey).equals(Buffer.from(config.authSecret)))throw new BusinessError("unavailable");
  const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"");
  // Existing local budget sizes, separate operation/version keys. No auth buckets change.
  const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey,policies:{
    "business-read":{version:policy.session.version+"-b",ip:policy.session.ip,account:policy.session.ip},
    "business-write":{...policy.login,version:policy.login.version+"-b"},
  }});
  const sessions=createHttpSessionService(client,config),business=createBusinessService(client,sessions);
  function limited(d:RateDecision,minimum=1){
    if(d.allowed)return null;
    if(d.reason==="unavailable")throw new BusinessError("unavailable");
    return authJson({error:"rate_limited"},429,{"retry-after":String(Math.max(minimum,d.retryAfterSeconds))});
  }
  return async(request:Request,connection:VerifiedSessionConnection):Promise<Response>=>{
    try{
      if(process.env.NODE_ENV!=="development"||!isVerifiedSessionConnection(connection)||connection.peerAddress!=="127.0.0.1"||connection.secure!==origin.startsWith("https:"))return authJson({error:"not_found"},404);
      const url=new URL(request.url);
      if(url.origin!==origin||url.pathname!==businessPath||url.search||request.headers.get("host")!==new URL(origin).host)return authJson({error:"not_found"},404);
      if(!["GET","POST"].includes(request.method))return authJson({error:"method_not_allowed"},405,{allow:"GET, POST"});
      const suppliedOrigin=request.headers.get("origin");
      if((request.method==="POST"&&suppliedOrigin!==origin)||(suppliedOrigin!==null&&suppliedOrigin!==origin)||
        [...request.headers.keys()].some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))||
        request.headers.has("sec-fetch-site")&&!["none","same-origin"].includes(request.headers.get("sec-fetch-site")!))return authJson({error:"origin_not_allowed"},403);
      const operation=request.method==="GET"?"business-read":"business-write";
      const ip=await limiter.consumeIp(operation,connection.rateTransport),ipReply=limited(ip);if(ipReply)return ipReply;
      let input:unknown;
      if(request.method==="POST"){
        const decoded=await decodeAuthRequest(request);if(!decoded.ok)return decoded.response;
        const parsed=businessWriteSchema.safeParse(decoded.value);if(!parsed.success)return authJson({error:"validation_failed"},422);
        input=parsed.data;
      }
      const current=await sessions.lookup(request.headers);if(!current.session)return authJson({error:"unauthenticated"},401);
      const accountReply=limited(await limiter.consumeAccount(operation,connection.rateTransport,current.session.user.email),ip.retryAfterSeconds!);if(accountReply)return accountReply;
      const result=request.method==="GET"?await business.read(request.headers):await business.write(request.headers,input);
      return authJson({business:result},200);
    }catch(error){
      if(error instanceof BusinessError){
        if(error.code==="unauthenticated")return authJson({error:"unauthenticated"},401);
        if(error.code==="invalid_input")return authJson({error:"validation_failed"},422);
        if(error.code==="conflict")return authJson({error:"business_conflict"},409);
      }
      return authJson({error:"business_unavailable"},503);
    }
  };
}
