// Public, nonsecret local-test configuration only; never an authorization signal.
import {localDevelopmentHttpOrigin,isLocalDevelopmentHttpOrigin} from "../product-auth/development-policy.ts";
import {localSessionRatePolicy} from "../product-auth/session-policy.ts";
import {createSessionClient} from "./session-client.ts";
export const LOCAL_SESSION_ORIGIN = "https://127.0.0.1:3443";
export function localFrontendSessionOrigin(env:Readonly<Record<string,string|undefined>>,host:string|null):string|undefined {
  const http=localDevelopmentHttpOrigin(env),origin=http??LOCAL_SESSION_ORIGIN;
  // Legacy gateway UI may use a normal production build. Direct Next session
  // activation additionally requires the explicit development-only transport flags.
  if(env.ENABLE_LOCAL_AUTH_FRONTEND!=="true" || (!http&&env.PRODUCT_SINGLE_ORIGIN_CONFIRMED!=="true") ||
    env.PRODUCT_DATABASE_MODE!=="test" || env.PRODUCT_DATABASE_CONFIRMED!=="true" ||
    env.PRODUCT_SESSION_HTTP_ORIGIN!==origin ||
    host!==new URL(origin).host)return;
  if(env.ENABLE_PRODUCT_SESSION_HTTP==="true") {
    if(env.NODE_ENV!=="development"||(!http&&env.PRODUCT_LOCAL_HTTPS_CONFIRMED!=="true")||env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED!=="true")return;
    try{localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"");}catch{return;}
  }
  return origin;
}
export function createLocalSessionClient(origin:string|undefined,dependencies:{fetch?:typeof fetch;currentOrigin?:()=>string|undefined}={}) {
  return createSessionClient({enabled:origin===LOCAL_SESSION_ORIGIN||isLocalDevelopmentHttpOrigin(origin),origin:origin??LOCAL_SESSION_ORIGIN,...dependencies});
}

// Presentation-only local opt-in. The actual handlers/service independently
// require NODE_ENV=development; Next may serve its normal build for the UI.
export function localFrontendRegistrationConfiguration(env:Readonly<Record<string,string|undefined>>,host:string|null) {
  const origin=localFrontendSessionOrigin(env,host);
  if(!origin||env.ENABLE_PRODUCT_REGISTRATION_HTTP!=="true"||env.PRODUCT_DEVELOPMENT_CONSENT_DEFERRED!=="true"||
    env.PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED!=="true")return;
  return {origin,developmentConsentDeferred:true as const};
}

export function localFrontendPasswordResetOrigin(env:Readonly<Record<string,string|undefined>>,host:string|null){
 if(env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_PASSWORD_RESET_HTTP!=="true"||env.PRODUCT_RESET_RATE_POLICY_CONFIRMED!=="true")return;
 return localFrontendSessionOrigin(env,host);
}
