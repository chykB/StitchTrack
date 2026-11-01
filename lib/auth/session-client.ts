import {z} from "zod";
import {emailSchema,loginSchema} from "./schemas.ts";

// The default remains disabled. Explicit local composition additionally checks
// the browser HTTPS origin before every request; no public build-time flag.
export const FRONTEND_AUTH_ENABLED = false;
export type SessionUser = {id:string;name:string;email:string};
export type FrontendSession = {user:SessionUser;expiresAt:number};
export type AuthFailure = {ok:false;kind:"disabled"|"invalid_input"|"invalid_credentials"|"unauthenticated"|"rate_limited"|"network"|"unavailable";retryAfterSeconds?:number};
export type AuthResult<T> = {ok:true;data:T}|AuthFailure;
const user=z.strictObject({id:z.string().min(1),name:z.string().min(1),email:emailSchema});
const loginReply=z.strictObject({user});
const sessionReply=z.strictObject({user,expiresAt:z.string().datetime({offset:true})});
const logoutReply=z.strictObject({loggedOut:z.literal(true)});
const paths={login:"/api/internal/tailor-session/login",session:"/api/internal/tailor-session/session",logout:"/api/internal/tailor-session/logout"} as const;
function retryAfter(value:string|null,now:number):number|undefined {
  if(!value)return;
  const seconds=/^\d+$/u.test(value)?Number(value):Math.ceil((Date.parse(value)-now)/1000);
  return Number.isSafeInteger(seconds)&&seconds>=0&&Number.isSafeInteger(now+seconds*1000)?Math.max(1,seconds):undefined;
}
// Relative paths and same-origin credentials only. No cookie/token API, storage,
// endpoint override, forwarded headers, redirect following or mutation retry.
export function createSessionClient(options:{enabled?:boolean;fetch?:typeof fetch;now?:()=>number;origin?:string;currentOrigin?:()=>string|undefined}={}) {
  const enabled=options.enabled===true,now=options.now??Date.now;
  async function request<T>(operation:keyof typeof paths,schema:z.ZodType<T>,body?:unknown):Promise<AuthResult<T>> {
    if(!enabled || options.origin!==undefined &&
      (options.currentOrigin?.() ?? globalThis.location?.origin)!==options.origin)return {ok:false,kind:"disabled"};
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try {
      const response=await (options.fetch??globalThis.fetch)(paths[operation],{
        method:operation==="session"?"GET":"POST",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",signal:abort.signal,
        ...(operation!=="session"?{headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{}),
      });
      if(response.redirected)return {ok:false,kind:"unavailable"};
      if(response.status===429)return {ok:false,kind:"rate_limited",retryAfterSeconds:retryAfter(response.headers.get("retry-after"),now())};
      if(response.status===401)return {ok:false,kind:operation==="login"?"invalid_credentials":"unauthenticated"};
      if(response.status!==200||!response.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return {ok:false,kind:"unavailable"};
      const parsed=schema.safeParse(await response.json());
      return parsed.success?{ok:true,data:parsed.data}:{ok:false,kind:"unavailable"};
    }catch{return {ok:false,kind:"network"};}finally{clearTimeout(timer);}
  }
  return {
    enabled,
    async login(input:unknown):Promise<AuthResult<{user:SessionUser}>> {
      if(!enabled)return {ok:false,kind:"disabled"};
      const parsed=loginSchema.safeParse(input);
      return parsed.success?request("login",loginReply,parsed.data):{ok:false,kind:"invalid_input"};
    },
    async session():Promise<AuthResult<FrontendSession|null>> {
      const result=await request("session",sessionReply);
      if(!result.ok)return result.kind==="unauthenticated"?{ok:true,data:null}:result;
      return {ok:true,data:{user:result.data.user,expiresAt:Date.parse(result.data.expiresAt)}};
    },
    logout:()=>request("logout",logoutReply,{}),
  };
}
export type SessionClient=ReturnType<typeof createSessionClient>;
