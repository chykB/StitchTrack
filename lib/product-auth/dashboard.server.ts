import "server-only";
import {sessionReply,type FrontendSession} from "../auth/session-client.ts";
import {localFrontendSessionOrigin,localFrontendAccountDeletionEnabled,localFrontendPasswordResetOrigin} from "../auth/local-session.ts";
import {localDevelopmentHttpOrigin} from "./development-policy.ts";

type Environment=Readonly<Record<string,string|undefined>>;
export type DashboardAccess={kind:"ready";session:FrontendSession;origin:string;accountDeletionEnabled:boolean;passwordResetEnabled:boolean}|{kind:"login"|"disabled"|"unavailable"};
// The normal Next page obtains identity from the existing guarded API, once per
// request. Only the signed cookie is forwarded, never caller-supplied role/IP
// metadata. The API sees the real loopback server connection and performs its
// existing database-backed verification and shared rate limiting. This local
// composition does not establish production reverse-proxy trust.
export async function loadDashboardAccess(host:string|null,cookie:string|null,options:{environment?:Environment;fetch?:typeof fetch;now?:()=>number}={}):Promise<DashboardAccess> {
  const env=options.environment??process.env;
  if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env.ENABLE_PRODUCT_SESSION_HTTP!=="true")return {kind:"disabled"};
  const origin=localFrontendSessionOrigin(env,host);
  if(!origin||origin!==localDevelopmentHttpOrigin(env))return {kind:"disabled"};
  // An absent cookie cannot identify a session and needs no backend request.
  if(!cookie)return {kind:"login"};
  try {
    const response=await(options.fetch??fetch)(origin+"/api/internal/tailor-session/dashboard",{
      method:"GET",headers:{cookie},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000),
    });
    if(response.redirected)return {kind:"unavailable"};
    if(response.status===401)return {kind:"login"};
    if(response.status!==200||!response.headers.get("content-type")?.startsWith("application/json"))return {kind:"unavailable"};
    const parsed=sessionReply.safeParse(await response.json());
    if(!parsed.success)return {kind:"unavailable"};
    const expiresAt=Date.parse(parsed.data.expiresAt);
    if(expiresAt<=(options.now??Date.now)())return {kind:"login"};
    return {kind:"ready",origin,session:{user:parsed.data.user,expiresAt,
      ...(parsed.data.administration===undefined?{}:{administration:parsed.data.administration})},
      accountDeletionEnabled:localFrontendAccountDeletionEnabled(env,host),passwordResetEnabled:!!localFrontendPasswordResetOrigin(env,host)};
  }catch{return {kind:"unavailable"};}
}
