// A processing marker, never a Terms version or acceptance record.
export const DEVELOPMENT_VERIFICATION_TEMPLATE="tailor-verification-v1-development-deferred";
export function developmentConsentDeferred(env:Readonly<Record<string,string|undefined>>) {
  return env.NODE_ENV==="development" && env.PRODUCT_DEVELOPMENT_CONSENT_DEFERRED==="true" &&
    ["development","test"].includes(env.PRODUCT_DATABASE_MODE??"") && env.PRODUCT_DATABASE_CONFIRMED==="true";
}

// Exact direct-loopback Next development origins. Never a proxy-trust policy.
export function isLocalDevelopmentHttpOrigin(value:string|undefined):value is string {
  return value==="http://127.0.0.1:3000"||value==="http://localhost:3000";
}
export function localDevelopmentHttpOrigin(env:Readonly<Record<string,string|undefined>>):string|undefined {
  if(env.NODE_ENV==="development"&&env.PRODUCT_LOCAL_HTTP_CONFIRMED==="true"&&isLocalDevelopmentHttpOrigin(env.PRODUCT_SESSION_HTTP_ORIGIN))
    return env.PRODUCT_SESSION_HTTP_ORIGIN;
}
