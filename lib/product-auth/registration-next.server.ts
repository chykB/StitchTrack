import "server-only";
import type {NextApiRequest,NextApiResponse} from "next";
import type {IncomingMessage} from "node:http";
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
import {businessPath} from "../business-contract.ts";
import {clientRecordPath} from "../client-record-contract.ts";
import {measurementPath} from "../measurement-contract.ts";
import {orderPath} from "../order-contract.ts";
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
function nodeResponse(path:string|readonly string[],method:"GET"|"POST",flag:string,unavailable:string,
  environment:(()=>Environment)|undefined,
  runtime:(env:Environment)=>Promise<(request:Request,connection:Parameters<Dispatcher>[2])=>Promise<Response>>) {
  return async(incoming:IncomingMessage):Promise<Response>=>{
    const reply=(error:string,status:number,headers?:Record<string,string>)=>authJson({error},status,headers);
    let stage:RegistrationFailureStage="transport_configuration";
    try {
      const env=(environment??(()=>process.env))();
      if(process.env.NODE_ENV!=="development"||env.NODE_ENV!=="development"||env[flag]!=="true") {
        return reply("not_found",404);
      }
      const origin=localOrigin(env),url=new URL(origin);
      const connection=url.protocol==="https:"?directLocalHttpsConnection(incoming,origin):sessionConnectionFromSocket(incoming.socket);
      if(url.protocol==="http:"&&(connection?.secure||incoming.socket.localAddress!=="127.0.0.1"||
        incoming.socket.localPort!==3000||incoming.aborted)) {return reply("not_found",404);}
      if(!connection||connection.peerAddress!=="127.0.0.1") {return reply("not_found",404);}
      let headers:Record<string,string>;
      try{headers=wireHeaders(incoming.rawHeaders);}catch{return reply("invalid_headers",400);}
      if(Object.keys(headers).some(k=>k==="forwarded"||k==="x-real-ip"||k.startsWith("x-forwarded-"))) {return reply("forwarded_metadata_not_allowed",403);}
      const incomingPath=incoming.url?.split("?")[0];
      if(headers.host!==url.host||!incomingPath||(typeof path==="string"?incomingPath!==path:!path.includes(incomingPath))||/[\\#\x00-\x20\x7f]/u.test(incoming.url??"")) {return reply("not_found",404);}
      if(incoming.method!==method) {return reply("method_not_allowed",405,{allow:method});}
      if((method==="POST"||headers.origin!==undefined)&&headers.origin!==origin) {return reply("origin_not_allowed",403);}
      if(headers.upgrade||headers.expect||headers.trailer||headers.connection&&headers.connection.split(",").some(t=>!["close","keep-alive"].includes(t.trim().toLowerCase()))) {return reply("unsupported_transport",400);}
      if(headers["content-length"]!==undefined&&(!/^\d+$/u.test(headers["content-length"])||headers["transfer-encoding"]!==undefined)||
        headers["transfer-encoding"]!==undefined&&headers["transfer-encoding"].toLowerCase()!=="chunked") {return reply("invalid_framing",400);}
      if(method==="GET"&&(headers["transfer-encoding"]||headers["content-length"]!==undefined&&headers["content-length"]!=="0")) {return reply("body_not_allowed",400);}
      stage="runtime_initialization";
      const dispatch=await runtime(env);
      stage="request_execution";
      const init:RequestInit&{duplex?:"half"}={method,headers};
      if(method==="POST"){init.body=Readable.toWeb(incoming) as ReadableStream<Uint8Array>;init.duplex="half";}
      const request=new Request(new URL(incoming.url!,origin),init);
      return await dispatch(request,connection);
    }catch(error){if(flag==="ENABLE_PRODUCT_REGISTRATION_HTTP")reportRegistrationFailure(stage,error);return reply(unavailable,503);}
  };
}


// API responses and the server-rendered admin page use identical raw-socket checks.
function nodeHandler(...args:Parameters<typeof nodeResponse>) {
  const respond=nodeResponse(...args);
  return async(incoming:NextApiRequest,outgoing:NextApiResponse):Promise<void>=>{
    try{await sendHttpsResponse(outgoing,await respond(incoming));}
    catch{await sendHttpsResponse(outgoing,authJson({error:args[3]},503)).catch(()=>{});}
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

export function createNextAdminResponse(operation:"page"|"summary",dependencies:HandlerDependencies<import("./admin.server.ts").AdminDispatcher>={}) {
 return nodeResponse(operation==="page"?["/admin","/api/internal/tailor-session/admin-page"]:"/api/internal/tailor-session/admin-summary",operation==="page"?"GET":"POST",
  "ENABLE_PRODUCT_ADMIN_HTTP","administration_unavailable",dependencies.environment,async env=>{
   const dispatch=await (dependencies.runtime??(async settings=>{
    const {createLocalAdminDispatcher}=await import("./admin.server.ts");
    const {client,identifierKey}=await localRuntime(settings);
    return createLocalAdminDispatcher(client,settings,identifierKey);
   }))(env);
   return (request,connection)=>dispatch(request,operation,connection);
  });
}

// Same raw socket/header guard, PostgreSQL budget and authoritative tailor lookup
// as the session API. No App Router metadata shortcut or client-only page guard.
export function createNextDashboardResponse(dependencies:HandlerDependencies<SessionDispatcher>={}) {
  return nodeResponse(["/dashboard","/api/internal/tailor-session/dashboard"],"GET","ENABLE_PRODUCT_SESSION_HTTP","authentication_unavailable",dependencies.environment,async env=>{
    const dispatch=await (dependencies.runtime??sessionRuntime)(env);
    return (request,connection)=>{
      const url=new URL(request.url);url.pathname=sessionPaths.session;
      return dispatch(new Request(url,{method:"GET",headers:request.headers}),"session",connection);
    };
  });
}

// Business traffic shares the reviewed raw HTTP adapter and lazy product-test pool.
export function createNextBusinessResponse(dependencies:HandlerDependencies<ReturnType<typeof import("./business-http.server.ts").createLocalBusinessDispatcher>>={}) {
  const runtime=async(env:Environment)=>{
    const dispatch=await(dependencies.runtime??(async settings=>{
      const {createLocalBusinessDispatcher}=await import("./business-http.server.ts");
      const {client,identifierKey}=await localRuntime(settings);
      return createLocalBusinessDispatcher(client,settings,identifierKey);
    }))(env);
    return (request:Request,connection:Parameters<Dispatcher>[2])=>dispatch(request,connection);
  };
  const get=nodeResponse(businessPath,"GET","ENABLE_PRODUCT_SESSION_HTTP","business_unavailable",dependencies.environment,runtime);
  const post=nodeResponse(businessPath,"POST","ENABLE_PRODUCT_SESSION_HTTP","business_unavailable",dependencies.environment,runtime);
  return async(incoming:IncomingMessage)=>{
    const response=await(incoming.method==="POST"?post:get)(incoming);
    if(response.status===405)response.headers.set("allow","GET, POST");
    return response;
  };
}

export function createNextClientRecordHandler(dependencies:HandlerDependencies<ReturnType<typeof import("./client-records-http.server.ts").createLocalClientRecordDispatcher>>={}){
  return nodeHandler(clientRecordPath,"POST","ENABLE_PRODUCT_SESSION_HTTP","client_unavailable",dependencies.environment,async env=>{
    const dispatch=await(dependencies.runtime??(async settings=>{
      const {createLocalClientRecordDispatcher}=await import("./client-records-http.server.ts");
      const {client,identifierKey}=await localRuntime(settings);
      return createLocalClientRecordDispatcher(client,settings,identifierKey);
    }))(env);
    return (request,connection)=>dispatch(request,connection);
  });
}

export function createNextMeasurementHandler(dependencies:HandlerDependencies<ReturnType<typeof import("./measurements-http.server.ts").createLocalMeasurementDispatcher>>={}){
  return nodeHandler(measurementPath,"POST","ENABLE_PRODUCT_SESSION_HTTP","measurement_unavailable",dependencies.environment,async env=>{
    const dispatch=await(dependencies.runtime??(async settings=>{
      const {createLocalMeasurementDispatcher}=await import("./measurements-http.server.ts");
      const {client,identifierKey}=await localRuntime(settings);
      return createLocalMeasurementDispatcher(client,settings,identifierKey);
    }))(env);
    return (request,connection)=>dispatch(request,connection);
  });
}

export function createNextOrderHandler(dependencies:HandlerDependencies<ReturnType<typeof import("./orders-http.server.ts").createLocalOrderDispatcher>>={}){
  return nodeHandler(orderPath,"POST","ENABLE_PRODUCT_SESSION_HTTP","order_unavailable",dependencies.environment,async env=>{
    const dispatch=await(dependencies.runtime??(async settings=>{
      const {createLocalOrderDispatcher}=await import("./orders-http.server.ts");
      const {client,identifierKey}=await localRuntime(settings);
      return createLocalOrderDispatcher(client,settings,identifierKey);
    }))(env);
    return (request,connection)=>dispatch(request,connection);
  });
}
