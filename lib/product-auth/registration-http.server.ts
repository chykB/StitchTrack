import "server-only";
import {reportRegistrationFailure,type RegistrationFailureStage} from "./secrets.server.ts";
import {isLocalDevelopmentHttpOrigin} from "./development-policy.ts";
import {authJson,decodeAuthRequest} from "../auth/request.server.ts";
import {developmentSignupSchema,registrationSchema,emailVerificationSchema,resendVerificationSchema,registrationTermsSchema,registrationPaths,type RegistrationTerms,type RegistrationOperation} from "../auth/registration-contract.ts";
import type {createRegistrationService} from "./registration.server.ts";
import {isVerifiedSessionConnection,type VerifiedSessionConnection} from "./session-http.server.ts";

const rateOperations={signup:"signup",verify:"verify-email",resend:"resend-verification"} as const;
type RateOperation=typeof rateOperations[RegistrationOperation];
type Decision={allowed:boolean;retryAfterSeconds:number};
export type RegistrationHttpDependencies={
  origin:string;terms?:RegistrationTerms;developmentConsentDeferred?:boolean;
  connection:(request:Request)=>VerifiedSessionConnection|undefined;
  limits:{storage:"shared";consumeIp:(operation:RateOperation,connection:VerifiedSessionConnection)=>Promise<Decision>;
    consumeAccount:(operation:RateOperation,email:string,connection:VerifiedSessionConnection)=>Promise<Decision>};
  service:Pick<ReturnType<typeof createRegistrationService>,"beginSignup"|"verifyEmail"|"reissue">;
};
function limited(d:Decision) {
  if(typeof d?.allowed!=="boolean"||!Number.isSafeInteger(d.retryAfterSeconds)||d.retryAfterSeconds<1)throw new Error();
  return d.allowed?null:authJson({error:"rate_limited"},429,{"retry-after":String(d.retryAfterSeconds)});
}
// Inert product boundary. No route/flag constructs a DB client or enables this.
// The reviewed direct Node transport must supply socket metadata and explicit shared
// operation policies. Normal Next Request/forwarded headers cannot supply trust.
export async function registrationHttpRequest(request:Request,operation:RegistrationOperation,dependencies?:RegistrationHttpDependencies):Promise<Response> {
  if(!dependencies)return authJson({error:"not_found"},404);
  let stage:RegistrationFailureStage="http_boundary";
  try {
    const d=dependencies,origin=new URL(d.origin),url=new URL(request.url),deferred=d.developmentConsentDeferred===true;
    const localHttp=deferred&&process.env.NODE_ENV==="development"&&isLocalDevelopmentHttpOrigin(d.origin);
    if((origin.protocol!=="https:"&&!localHttp)||origin.origin!==d.origin||origin.username||origin.password||(deferred?(process.env.NODE_ENV!=="development"||(d.origin!=="https://127.0.0.1:3443"&&!localHttp)):!registrationTermsSchema.safeParse(d.terms).success))throw new Error();
    if(url.origin!==d.origin||url.pathname!==registrationPaths[operation]||request.headers.get("host")!==origin.host)return authJson({error:"not_found"},404);
    if(request.method!=="POST")return authJson({error:"method_not_allowed"},405,{allow:"POST"});
    if(request.headers.get("origin")!==d.origin||request.headers.has("forwarded")||request.headers.has("x-real-ip")||
      [...request.headers.keys()].some(k=>k.startsWith("x-forwarded-"))||
      request.headers.get("sec-fetch-site")!==null&&!["same-origin","none"].includes(request.headers.get("sec-fetch-site")!))return authJson({error:"origin_not_allowed"},403);
    const connection=d.connection(request);
    if(!isVerifiedSessionConnection(connection)||connection.secure!==(origin.protocol==="https:")||(localHttp&&connection.peerAddress!=="127.0.0.1")||d.limits?.storage!=="shared")throw new Error();
    stage="rate_limit_ip";
    const ip=limited(await d.limits.consumeIp(rateOperations[operation],connection));if(ip)return ip;
    stage="http_boundary";
    const decoded=await decodeAuthRequest(request);if(!decoded.ok)return decoded.response;
    const schema=operation==="signup"?(deferred?developmentSignupSchema:registrationSchema):operation==="verify"?emailVerificationSchema:resendVerificationSchema;
    const parsed=schema.safeParse(decoded.value);
    if(!parsed.success)return authJson({error:"validation_failed"},422);
    if(operation==="signup"&&!deferred&&("termsVersionId" in parsed.data&&parsed.data.termsVersionId!==d.terms?.id))return authJson({error:"validation_failed"},422);
    stage="rate_limit_account";
    const account=limited(await d.limits.consumeAccount(rateOperations[operation],parsed.data.email,connection));if(account)return account;
    stage=operation==="signup"?"registration_execution":operation==="verify"?"verification_execution":"resend_execution";
    if(operation==="signup")await d.service.beginSignup(parsed.data);
    else if(operation==="verify") {
      return await d.service.verifyEmail(parsed.data)==="verified"?authJson({verified:true},200):authJson({error:"invalid_code"},400);
    }else await d.service.reissue(parsed.data.email);
    // Queued/conditional acknowledgement, never an account-existence or SMTP-delivery claim.
    return authJson({accepted:true},202);
  }catch(error){reportRegistrationFailure(stage,error);return authJson({error:"registration_unavailable"},503);}
}
