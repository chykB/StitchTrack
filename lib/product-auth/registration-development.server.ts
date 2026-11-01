import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {productDatabaseConfig} from "../../prisma/product/targets.ts";
import type {RegistrationOperation} from "../auth/registration-contract.ts";
import {checkPwnedPassword} from "../auth/breach-check.server.ts";
import {createRegistrationService} from "./registration.server.ts";
import {createAuthRateLimiter,type AuthRatePolicy} from "./rate-limit.server.ts";
import {keyRingFromEnvironment,ProductAuthError,reportRegistrationFailure,type RegistrationFailureStage} from "./secrets.server.ts";
import {developmentConsentDeferred,localDevelopmentHttpOrigin} from "./development-policy.ts";
import {isVerifiedSessionConnection,type VerifiedSessionConnection} from "./session-http.server.ts";
import {registrationHttpRequest} from "./registration-http.server.ts";
// Reuses the existing direct Node transport and Prisma client. Creates neither on import.
export function createDevelopmentRegistrationDispatcher(client:PrismaClient,env:Readonly<Record<string,string|undefined>>,identifierKey:Uint8Array,
  dependencies:{checkPassword?:typeof checkPwnedPassword}={}) {
  let stage:RegistrationFailureStage="registration_configuration";
  try {
    const origin=localDevelopmentHttpOrigin(env)??"https://127.0.0.1:3443";
    if(process.env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_REGISTRATION_HTTP!=="true"||!developmentConsentDeferred(env)||
      env.PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED!=="true"||env.PRODUCT_SESSION_HTTP_ORIGIN!==origin)throw new ProductAuthError("configuration_unavailable");
    stage="database_target_configuration";
    const target=productDatabaseConfig(env);if(target.mode!=="test")throw new ProductAuthError(); // Existing local ingress boundary only.
    stage="rate_policy_configuration";
    let policies:Record<"signup"|"verify-email"|"resend-verification",AuthRatePolicy>;
    try {
      policies=JSON.parse(env.PRODUCT_REGISTRATION_RATE_POLICIES??"");
      if(Object.keys(policies).sort().join()!=="resend-verification,signup,verify-email"||Object.values(policies).some(p=>!p?.version?.startsWith("local-")))throw new Error();
    }catch{throw new ProductAuthError("configuration_unavailable");}
    const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey,policies});
    stage="verifier_key_configuration";
    const verifierKeys=keyRingFromEnvironment(env,"PRODUCT_EMAIL_VERIFIER");
    stage="outbox_key_configuration";
    const outboxKeys=keyRingFromEnvironment(env,"PRODUCT_EMAIL_OUTBOX");
    stage="key_separation_configuration";
    for(const ring of [verifierKeys,outboxKeys])for(const key of ring.keys.values())if(Buffer.from(key).equals(Buffer.from(identifierKey))||
      Buffer.from(key).equals(Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY??"","base64"))||Buffer.from(key).equals(Buffer.from(env.PRODUCT_SESSION_HTTP_AUTH_SECRET??"")))throw new ProductAuthError();
    stage="auth_secret_configuration";
    if(!env.PRODUCT_SESSION_HTTP_AUTH_SECRET||env.PRODUCT_SESSION_HTTP_AUTH_SECRET.length<32)throw new ProductAuthError("configuration_unavailable");
    stage="registration_service_initialization";
    const service=createRegistrationService(client,{mode:"test",allowSyntheticTerms:false,deferConsentInDevelopment:true,
      authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET??"",verifierKeys,outboxKeys,checkPassword:dependencies.checkPassword??checkPwnedPassword});
    const decision=(result:Awaited<ReturnType<typeof limiter.consumeIp>>)=>{if(!result.allowed&&result.reason==="unavailable")throw new ProductAuthError();return {allowed:result.allowed,retryAfterSeconds:result.retryAfterSeconds!};};
    return async(request:Request,operation:RegistrationOperation,connection:VerifiedSessionConnection):Promise<Response>=>{
      if(!isVerifiedSessionConnection(connection)||connection.secure!==origin.startsWith("https:")||connection.peerAddress!=="127.0.0.1")throw new ProductAuthError();
      return registrationHttpRequest(request,operation,{origin,developmentConsentDeferred:true,connection:candidate=>candidate===request?connection:undefined,
        limits:{storage:"shared",consumeIp:async op=>decision(await limiter.consumeIp(op,connection.rateTransport)),consumeAccount:async(op,email)=>decision(await limiter.consumeAccount(op,connection.rateTransport,email))},service});
    };
  }catch(error){reportRegistrationFailure(stage,error);throw error;}
}
