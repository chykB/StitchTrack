import "server-only";
import { signupSchema, loginSchema, resetSchema } from "./schemas.ts";
import type { SignupData, LoginData, ResetData } from "./schemas.ts";

export const AUTH_BODY_LIMIT = 16 * 1024; // Transport budget, not an enrollment password-length rule.
export type AuthOperation = "signup" | "login" | "reset";
export type ValidatedAuth = { operation: "signup"; data: SignupData } |
  { operation: "login"; data: LoginData } | { operation: "reset"; data: ResetData };
type Invalid = { ok: false; fields: string[]; formError: boolean };
export type AuthParseResult = { ok: true; value: ValidatedAuth } | Invalid;
export function authJson(body: unknown, status: number, headers: Record<string,string> = {}): Response {
  return Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
}
function invalid(error: { issues: readonly { path: readonly PropertyKey[] }[] }): Invalid {
  const fields = [...new Set(error.issues.map(issue=>issue.path[0]).filter((key): key is string=>
    key === "name" || key === "email" || key === "password"))];
  // Never serialize raw Zod issues: unknown key names/values may contain secrets.
  return {ok:false,fields,formError:error.issues.some(issue=>!fields.includes(String(issue.path[0])))};
}
export function parseAuthInput(operation: AuthOperation, input: unknown): AuthParseResult {
  if(operation === "signup") {
    const result=signupSchema.safeParse(input);
    return result.success ? {ok:true,value:{operation,data:result.data}} : invalid(result.error);
  }
  if(operation === "login") {
    const result=loginSchema.safeParse(input);
    return result.success ? {ok:true,value:{operation,data:result.data}} : invalid(result.error);
  }
  const result=resetSchema.safeParse(input);
  return result.success ? {ok:true,value:{operation:"reset",data:result.data}} : invalid(result.error);
}
export async function decodeAuthRequest(request: Request): Promise<{ok:true;value:unknown}|{ok:false;response:Response}> {
  const reject=(error:string,status:number,headers:Record<string,string>={})=>({ok:false as const,response:authJson({error},status,headers)});
  if(request.method !== "POST") return reject("method_not_allowed",405,{allow:"POST"});
  const url=new URL(request.url);
  if(url.search) return reject("query_not_allowed",400);
  const origin=request.headers.get("origin");
  if((origin && origin!==url.origin) || request.headers.get("sec-fetch-site")==="cross-site") return reject("origin_not_allowed",403);
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") return reject("json_required",415);
  if(request.headers.has("content-encoding") && request.headers.get("content-encoding")!=="identity") return reject("encoding_not_supported",415);
  const length=request.headers.get("content-length");
  if(length && !/^\d+$/u.test(length)) return reject("invalid_length",400);
  if(length && Number(length)>AUTH_BODY_LIMIT) return reject("body_too_large",413);
  try {
    const reader=request.body?.getReader();
    if(!reader) return reject("invalid_json",400);
    const chunks:Uint8Array[]=[];let size=0;
    try {
      while(true) {
        const next=await reader.read();if(next.done)break;
        size+=next.value.byteLength;
        if(size>AUTH_BODY_LIMIT) { await reader.cancel();return reject("body_too_large",413); }
        chunks.push(next.value);
      }
    } finally {reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return {ok:true,value:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)) as unknown};
  } catch {return reject("invalid_json",400);}
}
// The callback receives only a discriminated, validated/canonicalized data object.
// It cannot run on envelope/JSON/schema failure. No persistence/auth callback is wired yet.
export async function validateAuthRequest(request:Request,operation:AuthOperation,
  next:(input:ValidatedAuth)=>Promise<Response>):Promise<Response> {
  const body=await decodeAuthRequest(request);if(!body.ok)return body.response;
  const parsed=parseAuthInput(operation,body.value);
  if(!parsed.ok) return authJson({error:"validation_failed",fields:parsed.fields,formError:parsed.formError},422);
  return next(parsed.value);
}
