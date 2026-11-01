import "server-only";
import {request as httpRequest} from "node:http";
import type {IncomingHttpHeaders,IncomingMessage,ServerResponse} from "node:http";
import {Readable} from "node:stream";
import {registrationPaths,type RegistrationOperation} from "../auth/registration-contract.ts";
import {createDevelopmentRegistrationDispatcher} from "./registration-development.server.ts";
import {pipeline} from "node:stream/promises";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {createDirectLocalHttpsListener,createLocalSessionHttpsHandler,directLocalHttpsConnection,sendHttpsResponse,type LocalHttpsOptions} from "./session-https.server.ts";
import {localSessionHttpConfiguration} from "./session-http.server.ts";
import {ProductAuthError} from "./secrets.server.ts";

type Route={kind:"registration";operation:RegistrationOperation}|{kind:"auth";method:"GET"|"POST"}|{kind:"application"}|{kind:"deny";status:number;allow?:string};
const authRoutes:Readonly<Record<string,"GET"|"POST">>={"/api/internal/tailor-session/login":"POST","/api/internal/tailor-session/session":"GET","/api/internal/tailor-session/logout":"POST"};
const hops=new Set(["connection","keep-alive","proxy-authenticate","proxy-authorization","te","trailer","transfer-encoding","upgrade"]);
const requestHeaders=new Set(["accept","accept-encoding","accept-language","cache-control","if-none-match","if-modified-since","range","if-range","pragma","user-agent","origin","rsc","next-router-state-tree","next-router-prefetch","next-router-segment-prefetch","next-url","purpose","sec-purpose"]);
const authCookie=(name:string)=>/^(?:__Secure-|__Host-)?better-auth[.-]/u.test(name);
export function singleOriginRoute(target:string,method:string):Route {
  try {
    if(!target.startsWith("/")||target.startsWith("//")||/[\\\x00-\x20\x7f]/u.test(target)||target.includes("#"))throw new Error();
    const raw=target.split("?")[0],url=new URL(target,"https://127.0.0.1:3443"),decoded=decodeURIComponent(raw);
    if(url.pathname!==raw||decoded.includes("//")||/[\\%?#\x00-\x20\x7f]/u.test(decoded)||decoded.split("/").some(p=>p==="."||p===".."))throw new Error();
    const registration=(Object.keys(registrationPaths) as RegistrationOperation[]).find(op=>registrationPaths[op]===raw);
    if(registration)return method==="POST"?{kind:"registration",operation:registration}:{kind:"deny",status:405,allow:"POST"};
    if(Object.hasOwn(authRoutes,raw))return method===authRoutes[raw]?{kind:"auth",method:authRoutes[raw]}:{kind:"deny",status:405,allow:authRoutes[raw]};
    // Never proxy any API spelling/encoding, unknown private route, image
    // optimizer or internal dev endpoints into an alternate execution path.
    if(/^\/api(?:\/|$)/iu.test(decoded)||/^\/_next\/(?:image|webpack-hmr)(?:\/|$)/u.test(decoded)||decoded.startsWith("/__nextjs"))return {kind:"deny",status:404};
    return ["GET","HEAD"].includes(method)?{kind:"application"}:{kind:"deny",status:405,allow:"GET, HEAD"};
  }catch{return {kind:"deny",status:400};}
}
function incomingHeaders(raw:readonly string[],host:string) {
  const values:Record<string,string>=Object.create(null);
  if(raw.length%2)throw new Error();
  for(let i=0;i<raw.length;i+=2){const name=raw[i].toLowerCase();
    if(Object.hasOwn(values,name)||! /^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(name)||/[\r\n\0]/u.test(raw[i+1]))throw new Error();values[name]=raw[i+1];
  }
  if(values.host!==host)throw new Error();
  return values;
}
function safeConnection(value:string|undefined) {return !value||value.split(",").every(token=>["close","keep-alive"].includes(token.trim().toLowerCase()));}
export function applicationRequestHeaders(headers:Readonly<Record<string,string>>,origin:string) {
  const result:Record<string,string>={host:new URL(origin).host};
  for(const [key,value] of Object.entries(headers))if(requestHeaders.has(key)||key.startsWith("sec-fetch-"))result[key]=value;
  const cookies=headers.cookie?.split(";").filter(part=>!authCookie(part.split("=")[0].trim())).map(part=>part.trim()).filter(Boolean).join("; ");
  if(cookies)result.cookie=cookies;
  // These application-only URL hints originate here after actual TLS checks.
  // They are never an input to authentication or a client-IP attestation.
  result["x-forwarded-proto"]="https";result["x-forwarded-host"]=result.host;result["x-forwarded-port"]=new URL(origin).port;
  return result;
}
export function applicationResponseHeaders(headers:IncomingHttpHeaders,raw:readonly string[],origin:string,upstream:string,target:string) {
  const combinable=new Set(["set-cookie","link","vary","cache-control","server-timing"]);
  const seen=new Set<string>();for(let i=0;i<raw.length;i+=2){const name=raw[i].toLowerCase();if(seen.has(name)&&!combinable.has(name))throw new Error();seen.add(name);}
  if(!safeConnection(headers.connection)||headers.trailer||headers.upgrade||headers.refresh||Object.keys(headers).some(k=>k.startsWith("access-control-")))throw new Error();
  const result:Record<string,string|string[]>=Object.create(null);
  for(const [key,value] of Object.entries(headers)) {
    if(value===undefined||hops.has(key))continue;
    if(key==="set-cookie") {
      if(!Array.isArray(value)||value.some(v=>authCookie(v.split("=")[0].trim())))throw new Error();result[key]=value;continue;
    }
    if(Array.isArray(value))throw new Error();
    if(key==="location") {
      if(/[\\\r\n\0]/u.test(value)||value.startsWith("//"))throw new Error();
      const next=new URL(value,new URL(target,origin));
      if(next.username||next.password)throw new Error();
      if(next.origin===new URL(upstream).origin)result[key]=origin+next.pathname+next.search+next.hash;
      else if(next.origin===origin)result[key]=value;
      else throw new Error();
    }else result[key]=value;
  }return result;
}
function reply(out:ServerResponse,status:number,error:string,allow?:string) {
  if(out.destroyed||out.writableEnded)return;
  if(out.headersSent){out.destroy();return;}
  for(const name of out.getHeaderNames())out.removeHeader(name);
  out.statusCode=status;out.setHeader("content-type","application/json");out.setHeader("cache-control","no-store");out.setHeader("x-content-type-options","nosniff");if(allow)out.setHeader("allow",allow);out.end(JSON.stringify({error}));
}
function gatewayConfiguration(options:LocalHttpsOptions) {
  try {
  if(process.env.NODE_ENV==="production"||options.env.PRODUCT_SINGLE_ORIGIN_CONFIRMED!=="true")throw new ProductAuthError("configuration_unavailable");
  const origin=localSessionHttpConfiguration(options.env).origin,raw=options.env.PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN;
  if(!raw)throw new ProductAuthError("configuration_unavailable");
  const next=new URL(raw),port=Number(next.port);
  if(next.protocol!=="http:"||next.hostname!=="127.0.0.1"||!Number.isSafeInteger(port)||port<1024||port>65535||next.port===new URL(origin).port||raw!==next.origin||next.username||next.password)throw new ProductAuthError("configuration_unavailable");
  return {origin,upstream:next.origin,port};
  } catch {throw new ProductAuthError("configuration_unavailable");}
}
async function forward(incoming:IncomingMessage,outgoing:ServerResponse,config:ReturnType<typeof gatewayConfiguration>,headers:Record<string,string>,request:typeof httpRequest) {
  await new Promise<void>(resolve=>{
    let done=false;
    let upstream:ReturnType<typeof httpRequest>,activeResponse:IncomingMessage|undefined;
    const finish=()=>{if(done)return;done=true;incoming.off("aborted",abort);outgoing.off("close",abort);resolve();};
    const failed=()=>{if(done)return;reply(outgoing,502,"application_unavailable");upstream?.destroy();activeResponse?.destroy();finish();};
    const abort=()=>{upstream?.destroy();activeResponse?.destroy();finish();};
    try {
      upstream=request({hostname:"127.0.0.1",port:config.port,path:incoming.url,method:incoming.method,headers:applicationRequestHeaders(headers,config.origin),agent:false,maxHeaderSize:16*1024},response=>{
        activeResponse=response;
        void (async()=>{
          try {
            if(!response.statusCode||response.statusCode<200||response.statusCode===101)throw new Error();
            const responseHeaders=applicationResponseHeaders(response.headers,response.rawHeaders,config.origin,config.upstream,incoming.url!);
            for(const [key,value] of Object.entries(responseHeaders))outgoing.setHeader(key,value);outgoing.statusCode=response.statusCode;
            await pipeline(response,outgoing);
          }catch{response.destroy();failed();}finally{finish();}
        })();
      });
      incoming.once("aborted",abort);outgoing.once("close",abort);
      upstream.once("error",failed);
      upstream.once("upgrade",(_response,socket)=>{socket.destroy();failed();});
      upstream.setTimeout(15000,()=>upstream.destroy(new Error("Application timeout.")));
      upstream.end(); // Application forwarding is GET/HEAD only: never relay a body.
    }catch{failed();}
  });
}
// No listener, network request or database operation on import/construction.
export function createSingleOriginHandler(client:PrismaClient,options:LocalHttpsOptions,dependencies:{request?:typeof httpRequest}={}) {
  const config=gatewayConfiguration(options),auth=createLocalSessionHttpsHandler(client,options);
  const registration=options.env.ENABLE_PRODUCT_REGISTRATION_HTTP==="true"?createDevelopmentRegistrationDispatcher(client,options.env,options.identifierKey):undefined;
  return async(incoming:IncomingMessage,outgoing:ServerResponse):Promise<void>=>{
    if(process.env.NODE_ENV==="production"){reply(outgoing,404,"not_found");return;}
    try {
      const connection=directLocalHttpsConnection(incoming,config.origin);
      if(!connection){reply(outgoing,404,"not_found");return;}
      const headers=incomingHeaders(incoming.rawHeaders,new URL(config.origin).host);
      if(Object.keys(headers).some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))){reply(outgoing,403,"forwarded_metadata_not_allowed");return;}
      if(headers.upgrade||!safeConnection(headers.connection)||headers.trailer){reply(outgoing,501,"unsupported_transport");return;}
      if(headers.expect){reply(outgoing,417,"expectation_failed");return;}
      if(headers["content-length"]!==undefined && (!/^\d+$/u.test(headers["content-length"]) || headers["transfer-encoding"]!==undefined)) {
        reply(outgoing,400,"invalid_framing");return;
      }
      const route=singleOriginRoute(incoming.url??"",incoming.method??"");
      if(route.kind==="deny"){reply(outgoing,route.status,"request_not_allowed",route.allow);return;}
      if(route.kind==="registration") {
        if(!registration){reply(outgoing,404,"not_found");return;}
        const request=new Request(new URL(incoming.url!,config.origin),{method:"POST",headers,body:Readable.toWeb(incoming),duplex:"half"} as RequestInit&{duplex:"half"});
        await sendHttpsResponse(outgoing,await registration(request,route.operation,connection));return;
      }
      if(route.kind==="auth"){await auth(incoming,outgoing);return;}
      if(headers["transfer-encoding"]||headers["content-length"]!==undefined&&headers["content-length"]!=="0"){reply(outgoing,400,"body_not_allowed");return;}
      await forward(incoming,outgoing,config,headers,dependencies.request??httpRequest);
    }catch{reply(outgoing,503,"gateway_unavailable");}
  };
}
export function createSingleOriginServer(client:PrismaClient,options:LocalHttpsOptions&{key:Buffer;cert:Buffer}) {
  const handler=createSingleOriginHandler(client,options);return createDirectLocalHttpsListener(options,handler);
}
