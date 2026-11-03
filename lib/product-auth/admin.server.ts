import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {authJson,decodeAuthRequest} from "../auth/request.server.ts";
import {accountAccessEnabled,lockAccountAccess,withAccountAccessTransaction} from "./account-access.server.ts";
import {createHttpSessionService,isVerifiedSessionConnection,localSessionHttpConfiguration,type VerifiedSessionConnection} from "./session-http.server.ts";
import {createAuthRateLimiter} from "./rate-limit.server.ts";
import {localSessionRatePolicy} from "./session-policy.ts";

type Environment=Readonly<Record<string,string|undefined>>;
type Sessions=Pick<ReturnType<typeof createHttpSessionService>,"lookup"|"hasSessionForLockedUser">;
export type AdminSummary={activeSessions:number;pendingDeletionRequests:number;generatedAt:string};
export type AdminResult={status:401|403}|{status:200;summary?:AdminSummary};
// Session cookies remain Better Auth's; neither role claims nor identity come from input.
export function createAdministratorService(client:PrismaClient,sessions:Sessions) {
 return {async request(headers:Headers,refresh:boolean):Promise<AdminResult> {
  const current=await sessions.lookup(headers);
  if(!current.session)return {status:401};
  return withAccountAccessTransaction(client,"test",async tx=>{
   const user=await lockAccountAccess(tx,{id:current.session!.user.id});
   if(!user?.emailVerified||!accountAccessEnabled(user)||!await sessions.hasSessionForLockedUser(tx,headers,user))return {status:401};
   // This lock also serializes owner role revocation and account lifecycle changes.
   const roles=await tx.$queryRaw<{isAdministrator:boolean;roleProtected:boolean}[]>`SELECT "isAdministrator",
    NOT (has_column_privilege(current_user,'product."User"','isAdministrator','INSERT') OR
         has_column_privilege(current_user,'product."User"','isAdministrator','UPDATE')) AS "roleProtected"
    FROM product."User" WHERE "id"=${user.id}`;
   if(roles.length!==1||roles[0].roleProtected!==true)throw new Error();
   if(roles[0].isAdministrator!==true)return {status:403};
   if(!refresh)return {status:200};
   const [counts]=await tx.$queryRaw<{activeSessions:number;pendingDeletionRequests:number;generatedAt:Date}[]>`
    SELECT (SELECT count(*)::int FROM product."Session" s JOIN product."User" u ON u."id"=s."userId"
      WHERE s."expiresAt">CURRENT_TIMESTAMP AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL) AS "activeSessions",
      (SELECT count(*)::int FROM product."User" WHERE "deletionRequestedAt" IS NOT NULL) AS "pendingDeletionRequests",
      clock_timestamp() AS "generatedAt"`;
   if(!counts||![counts.activeSessions,counts.pendingDeletionRequests].every(n=>Number.isSafeInteger(n)&&n>=0)||
    !(counts.generatedAt instanceof Date)||!Number.isFinite(+counts.generatedAt))throw new Error();
   return {status:200,summary:{activeSessions:counts.activeSessions,pendingDeletionRequests:counts.pendingDeletionRequests,generatedAt:counts.generatedAt.toISOString()}};
  });
 }};
}
export type AdminDispatcher=(request:Request,operation:"page"|"summary",connection:VerifiedSessionConnection)=>Promise<Response>;
// Inert, default-off composition. Uses the already approved shared session-lookup
// IP budget for both operations; no new threshold or in-memory counter.
export function createLocalAdminDispatcher(client:PrismaClient,env:Environment,identifierKey:Uint8Array):AdminDispatcher {
 if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_ADMIN_HTTP!=="true"||
  env.ENABLE_PRODUCT_SESSION_HTTP!=="true"||env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED!=="true")throw new Error();
 const config=localSessionHttpConfiguration(env),policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"");
 if(Buffer.from(identifierKey).equals(Buffer.from(config.sessionTokenKey))||Buffer.from(identifierKey).equals(Buffer.from(config.authSecret)))throw new Error();
 const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey,policies:{login:policy.login},ipOnlyPolicies:{session:policy.session}});
 const admin=createAdministratorService(client,createHttpSessionService(client,config));
 return async(request,operation,connection)=>{
  try{
   const url=new URL(request.url),origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
   if(process.env.NODE_ENV!=="development"||!isVerifiedSessionConnection(connection)||connection.peerAddress!=="127.0.0.1"||
    connection.secure!==(url.protocol==="https:")||url.origin!==config.origin||request.headers.get("host")!==url.host||
    (operation==="page"?!["/admin","/api/internal/tailor-session/admin-page"].includes(url.pathname):url.pathname!=="/api/internal/tailor-session/admin-summary"))return authJson({error:"not_found"},404);
   if(url.search)return authJson({error:"query_not_allowed"},400);
   if(request.method!==(operation==="page"?"GET":"POST"))return authJson({error:"method_not_allowed"},405);
   if((operation==="summary"&&origin!==config.origin)||(origin!==null&&origin!==config.origin)||
    site!==null&&!["same-origin","none"].includes(site))return authJson({error:"origin_not_allowed"},403);
   const budget=await limiter.consumeIp("session",connection.rateTransport);
   if(!budget.allowed)return budget.reason==="unavailable"?authJson({error:"administration_unavailable"},503):authJson({error:"rate_limited"},429,{"retry-after":String(budget.retryAfterSeconds)});
   if(operation==="summary"){
    const parsed=await decodeAuthRequest(request);if(!parsed.ok)return parsed.response;
    if(!parsed.value||typeof parsed.value!=="object"||Array.isArray(parsed.value)||Object.keys(parsed.value).length)return authJson({error:"validation_failed"},422);
   }
   const result=await admin.request(request.headers,operation==="summary");
   return result.status===200?authJson(result.summary??{authorized:true},200):authJson({error:result.status===401?"unauthenticated":"forbidden"},result.status);
  }catch{return authJson({error:"administration_unavailable"},503);}
 };
}
