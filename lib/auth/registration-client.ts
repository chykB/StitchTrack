import {isLocalDevelopmentHttpOrigin} from "../product-auth/development-policy.ts";
import {z} from "zod";
import {developmentSignupSchema,signupAcknowledgementsSchema,emailVerificationSchema,resendVerificationSchema,registrationTermsSchema,registrationPaths,type RegistrationTerms,type RegistrationOperation} from "./registration-contract.ts";
export type RegistrationFrontendConfig={origin:string;terms:RegistrationTerms;developmentConsentDeferred?:false}|{origin:string;developmentConsentDeferred:true;terms?:never};
export type RegistrationFailure={ok:false;kind:"disabled"|"invalid_input"|"invalid_code"|"network"|"unavailable"|"rate_limited";retryAfterSeconds?:number};
export type RegistrationResult={ok:true}|RegistrationFailure;
export function createRegistrationClient(options:{configuration?:RegistrationFrontendConfig;fetch?:typeof fetch;currentOrigin?:()=>string|undefined;now?:()=>number}={}) {
  const c=options.configuration,consentDeferred=c?.developmentConsentDeferred===true;
  let enabled=false;
  try{const u=new URL(c?.origin??"");enabled=(u.protocol==="https:"||consentDeferred&&isLocalDevelopmentHttpOrigin(c?.origin))&&u.origin===c?.origin&&!u.username&&!u.password&&(consentDeferred?(c?.origin==="https://127.0.0.1:3443"||isLocalDevelopmentHttpOrigin(c?.origin)):registrationTermsSchema.safeParse(c?.terms).success);}catch{}
  const terms=enabled?c!.terms:undefined;
  async function request(operation:RegistrationOperation,input:unknown):Promise<RegistrationResult> {
    if(!enabled||(options.currentOrigin?.()??globalThis.location?.origin)!==c!.origin)return {ok:false,kind:"disabled"};
    const schema=operation==="signup"?(consentDeferred?developmentSignupSchema:signupAcknowledgementsSchema):operation==="verify"?emailVerificationSchema:resendVerificationSchema;
    const parsed=schema.safeParse(input);
    if(!parsed.success||operation==="signup"&&!consentDeferred&&"termsVersionId" in parsed.data&&parsed.data.termsVersionId!==terms!.id)return {ok:false,kind:"invalid_input"};
    const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),15000);
    try {
      const response=await (options.fetch??globalThis.fetch)(registrationPaths[operation],{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
        headers:{"content-type":"application/json"},body:JSON.stringify(parsed.data),signal:stop.signal});
      if(response.redirected)return {ok:false,kind:"unavailable"};
      if(response.status===429){const raw=response.headers.get("retry-after"),now=(options.now??Date.now)(),n=raw&&/^\d+$/u.test(raw)?Number(raw):raw?Math.ceil((Date.parse(raw)-now)/1000):NaN;
        return {ok:false,kind:"rate_limited",retryAfterSeconds:Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(now+n*1000)?Math.max(1,n):undefined};}
      if(operation==="verify"&&response.status===400)return {ok:false,kind:"invalid_code"};
      if(response.status===422)return {ok:false,kind:"invalid_input"};
      if(response.status!==(operation==="verify"?200:202)||!response.headers.get("content-type")?.startsWith("application/json"))return {ok:false,kind:"unavailable"};
      const result=(operation==="verify"?z.strictObject({verified:z.literal(true)}):z.strictObject({accepted:z.literal(true)})).safeParse(await response.json());
      return result.success?{ok:true}:{ok:false,kind:"unavailable"};
    }catch{return {ok:false,kind:"network"};}finally{clearTimeout(timer);}
  }
  return {enabled,terms,consentDeferred,signup:(input:unknown)=>request("signup",input),verify:(input:unknown)=>request("verify",input),resend:(email:string)=>request("resend",{email})};
}
export type RegistrationClient=ReturnType<typeof createRegistrationClient>;
