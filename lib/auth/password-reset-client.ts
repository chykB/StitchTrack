import {resetPaths,resetRequestSchema,resetCodeSchema,resetCompleteSchema,type ResetOperation} from "./password-reset-contract.ts";
import {z} from "zod";
export type ResetResult={ok:true}|{ok:false;kind:"disabled"|"validation"|"invalid_code"|"rate_limited"|"password_rejected"|"unavailable";retryAfter?:number};
const replies={request:z.strictObject({accepted:z.literal(true)}),check:z.strictObject({valid:z.literal(true)}),complete:z.strictObject({reset:z.literal(true)})};
export function createPasswordResetClient(origin:string|undefined,request:typeof fetch=globalThis.fetch,currentOrigin=()=>globalThis.location?.origin){
 const enabled=!!origin;
 return {enabled,async send(operation:ResetOperation,input:unknown):Promise<ResetResult>{
  if(!enabled||currentOrigin()!==origin)return {ok:false,kind:"disabled"};
  const schema=operation==="request"?resetRequestSchema:operation==="check"?resetCodeSchema:resetCompleteSchema;
  const parsed=schema.safeParse(input);if(!parsed.success)return {ok:false,kind:"validation"};
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
  try{
   const response=await request(resetPaths[operation],{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",signal:abort.signal,
    headers:{"content-type":"application/json"},body:JSON.stringify(parsed.data)});
   if(response.status===429){const raw=response.headers.get("retry-after"),seconds=raw&&/^\d+$/u.test(raw)?Number(raw):undefined;
    return {ok:false,kind:"rate_limited",retryAfter:Number.isSafeInteger(seconds)&&seconds!>0&&Number.isSafeInteger(Date.now()+seconds!*1000)?seconds:undefined};}
   if(response.status===400)return {ok:false,kind:"invalid_code"};
   if(response.status===422){const body=await response.json();return {ok:false,kind:body?.error==="password_rejected"?"password_rejected":"validation"};}
   if(response.status!==(operation==="request"?202:200)||response.redirected||!response.headers.get("content-type")?.startsWith("application/json"))return {ok:false,kind:"unavailable"};
   return replies[operation].safeParse(await response.json()).success?{ok:true}:{ok:false,kind:"unavailable"};
  }catch{return {ok:false,kind:"unavailable"};}finally{clearTimeout(timer);}
 }};
}
