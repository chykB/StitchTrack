import "server-only";
import type {NextApiRequest,NextApiResponse} from "next";
import {Readable} from "node:stream";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig} from "../../prisma/product/targets.ts";
import {reportRegistrationFailure,type RegistrationFailureStage} from "./secrets.server.ts";
import {localDevelopmentHttpOrigin} from "./development-policy.ts";
import {authJson} from "../auth/request.server.ts";
import {registrationPaths,type RegistrationOperation} from "../auth/registration-contract.ts";
import {createDevelopmentRegistrationDispatcher} from "./registration-development.server.ts";
import {sessionPaths,sessionConnectionFromSocket,type SessionOperation} from "./session-http.server.ts";
import {localSessionRatePolicy} from "./session-policy.ts";
import {directLocalHttpsConnection,sendHttpsResponse,createLocalSessionDispatcher} from "./session-https.server.ts";

import {resetPaths,type ResetOperation} from "../auth/password-reset-contract.ts";
import {createLocalPasswordResetDispatcher} from "./password-reset-http.server.ts";

import {accountDeletionPath} from "../auth/account-deletion-contract.ts";
import {createLocalAccountDeletionDispatcher} from "./account-deletion-http.server.ts";

const legacyOrigin="https://127.0.0.1:3443";
function localOrigin(env:Environment):string {
  const http=localDevelopmentHttpOrigin(env);
  if(http)return http;
  if(env.PRODUCT_LOCAL_HTTPS_CONFIRMED==="true"&&env.PRODUCT_SESSION_HTTP_ORIGIN===legacyOrigin)return legacyOrigin;
  throw new Error();
}
type Environment=Readonly<Record<string,string|undefined>>;
type Dispatcher=ReturnType<typeof createDevelopmentRegistrationDispatcher>;
type SessionDispatcher=ReturnType<typeof createLocalSessionDispatcher>;
type HandlerDependencies<D>={environment?:()=>Environment;runtime?:(env:Environment)=>Promise<D>};
// One lazy pool across the six API bundles and development hot reloads. A
// target change requires restart, never silently reuses another database client.
const local=globalThis as typeof globalThis & {__stitchtrackRegistration?:{url:string;connectionOptions:string;client:PrismaClient}};
async function localRuntime(env:Environment,diagnoseRegistration=false) {
  let stage:RegistrationFailureStage="database_target_configuration";
  try {
    const target=productDatabaseConfig(env);
    localOrigin(env);
    if(target.mode!=="test")throw new Error();
    stage="runtime_override_configuration";
    if(
      ["PGOPTIONS","PGSERVICE","PGSERVICEFILE","NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL"].some(k=>env[k]))throw new Error();
    stage="rate_key_configuration";
    const key=Buffer.from(env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY??"","base64");
    if(key.length!==32||key.toString("base64")!==env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY)throw new Error();
    stage="dependency_initialization";
    const {PrismaPg}=await import("@prisma/adapter-pg"),{PrismaClient}=await import("../../prisma/product/generated/client.ts");
    // No await between checking and assigning: simultaneous first requests share
    // one pool. Dynamic imports themselves are cached by the module loader.
    stage="prisma_client_initialization";
    const existing=local.__stitchtrackRegistration;
    // Hot reload must not silently reuse an adapter created before the UTC fix.
    // Preserve pool ownership: require an owner restart, never disconnect in-flight work.
    if(existing&&(existing.url!==target.url||existing.connectionOptions!==PRODUCT_PRISMA_CONNECTION_OPTIONS))throw new Error();
    const client=existing?.client??new PrismaClient({adapter:new PrismaPg({options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionString:target.url,max:4,connectionTimeoutMillis:5000,
      query_timeout:10000,statement_timeout:7000,lock_timeout:3000,idle_in_transaction_session_timeout:10000},
      {schema:"product",onPoolError:()=>{},onConnectionError:()=>{}}),log:[]});
    local.__stitchtrackRegistration??={url:target.url,connectionOptions:PRODUCT_PRISMA_CONNECTION_OPTIONS,client};
    return {client,identifierKey:key};
  }catch(error){if(diagnoseRegistration)reportRegistrationFailure(stage,error);throw error;}
}
function wireHeaders(raw:readonly string[]) {
  const headers:Record<string,string>=Object.create(null);
  if(raw.length%2||raw.length>100)throw new Error();
  for(let i=0;i<raw.length;i+=2) {
    const name=raw[i].toLowerCase(),value=raw[i+1];
    if(Object.hasOwn(headers,name)||! /^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(name)||/[\r\n\0]/u.test(value))throw new Error();
    headers[name]=value;
  }
  return headers;
}
async function registrationRuntime(env:Environment):Promise<Dispatcher> {
  const {client,identifierKey}=await localRuntime(env,true);
  return createDevelopmentRegistrationDispatcher(client,env,identifierKey);
}
async function sessionRuntime(env:Environment):Promise<SessionDispatcher> {
  const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"");
  const {client,identifierKey}=await localRuntime(env);
  return createLocalSessionDispatcher(client,{env,identifierKey,policy});
}
// One supported Node API transport for the two existing auth boundaries. No
// custom server. Never use req.headers: Next has already modified them.
function nodeHandler(path:string,method:"GET"|"POST",flag:string,unavailable:string,
  environment:(()=>Environment)|undefined,
  runtime:(env:Environment)=>Promise<(request:Request,connection:Parameters<Dispatcher>[2])=>Promise<Response>>) {
  return async(incoming:NextApiRequest,outgoing:NextApiResponse):Promise<void>=>{
    const reply=(error:string,status:number,headers?:Record<string,string>)=>sendHttpsResponse(outgoing,authJson({error},status,headers));
    let stage:RegistrationFailureStage="transport_configuration";
    try {
      const env=(environment??(()=>process.env))();
      if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env[flag]!=="true") {
        await reply("not_found",404);return;
      }
      const origin=localOrigin(env),url=new URL(origin);
      const connection=url.protocol==="https:"?directLocalHttpsConnection(incoming,origin):sessionConnectionFromSocket(incoming.socket);
      if(url.protocol==="http:"&&(connection?.secure||incoming.socket.localAddress!=="127.0.0.1"||
        incoming.socket.localPort!==3000||incoming.aborted)) {await reply("not_found",404);return;}
      if(!connection||connection.peerAddress!=="127.0.0.1") {await reply("not_found",404);return;}
      let headers:Record<string,string>;
      try{headers=wireHeaders(incoming.rawHeaders);}catch{await reply("invalid_headers",400);return;}
      if(Object.keys(headers).some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))) {await reply("forwarded_metadata_not_allowed",403);return;}
      const incomingPath=incoming.url?.split("?")[0];
      if(headers.host!==url.host||incomingPath!==path||/[\\#\x00-\x20\x7f]/u.test(incoming.url??"")) {await reply("not_found",404);return;}
      if(incoming.method!==method) {await reply("method_not_allowed",405,{allow:method});return;}
      if((method==="POST"||headers.origin!==undefined)&&headers.origin!==origin) {await reply("origin_not_allowed",403);return;}
      if(headers.upgrade||headers.expect||headers.trailer||headers.connection&&headers.connection.split(",").some(t=>!["close","keep-alive"].includes(t.trim().toLowerCase()))) {await reply("unsupported_transport",400);return;}
      if(headers["content-length"]!==undefined&&(!/^\d+$/u.test(headers["content-length"])||headers["transfer-encoding"]!==undefined)||
        headers["transfer-encoding"]!==undefined&&headers["transfer-encoding"].toLowerCase()!=="chunked") {await reply("invalid_framing",400);return;}
      if(method==="GET"&&(headers["transfer-encoding"]||headers["content-length"]!==undefined&&headers["content-length"]!=="0")) {await reply("body_not_allowed",400);return;}
      stage="runtime_initialization";
      const dispatch=await runtime(env);
      stage="request_execution";
      const init:RequestInit&{duplex?:"half"}={method,headers};
      if(method==="POST"){init.body=Readable.toWeb(incoming) as ReadableStream<Uint8Array>;init.duplex="half";}
      const request=new Request(new URL(incoming.url!,origin),init);
      await sendHttpsResponse(outgoing,await dispatch(request,connection));
    }catch(error){if(flag==="ENABLE_PRODUCT_REGISTRATION_HTTP")reportRegistrationFailure(stage,error);await reply(unavailable,503).catch(()=>{});}
  };
}

export function createNextRegistrationHandler(operation:RegistrationOperation,dependencies:HandlerDependencies<Dispatcher>={}) {
  return nodeHandler(registrationPaths[operation],"POST","ENABLE_PRODUCT_REGISTRATION_HTTP","registration_unavailable",dependencies.environment,async env=>{
    const dispatch=await (dependencies.runtime??registrationRuntime)(env);
    return (request,connection)=>dispatch(request,operation,connection);
  });
}
export function createNextSessionHandler(operation:SessionOperation,dependencies:HandlerDependencies<SessionDispatcher>={}) {
  return nodeHandler(sessionPaths[operation],operation==="session"?"GET":"POST","ENABLE_PRODUCT_SESSION_HTTP","authentication_unavailable",dependencies.environment,async env=>{
    const dispatch=await (dependencies.runtime??sessionRuntime)(env);
    return (request,connection)=>dispatch(request,operation,connection);
  });
}

export function createNextPasswordResetHandler(operation:ResetOperation,dependencies:HandlerDependencies<ReturnType<typeof createLocalPasswordResetDispatcher>>={}) {
 return nodeHandler(resetPaths[operation],"POST","ENABLE_PRODUCT_PASSWORD_RESET_HTTP","reset_unavailable",dependencies.environment,async env=>{
  const dispatch=await (dependencies.runtime??(async settings=>{const {client,identifierKey}=await localRuntime(settings);return createLocalPasswordResetDispatcher(client,settings,identifierKey);}))(env);
  return (request,connection)=>dispatch(request,operation,connection);
 });
}

export function createNextAccountDeletionHandler(dependencies:HandlerDependencies<ReturnType<typeof createLocalAccountDeletionDispatcher>>={}) {
 return nodeHandler(accountDeletionPath,"POST","ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP","deletion_unavailable",dependencies.environment,async env=>{
  return (dependencies.runtime??(async settings=>{const {client,identifierKey}=await localRuntime(settings);return createLocalAccountDeletionDispatcher(client,settings,identifierKey);}))(env);
 });
}
