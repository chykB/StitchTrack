// OWNER ONLY. Import is inert: no environment-file read, client, listener or fixture.
import {pathToFileURL} from "node:url";
import {isAbsolute,sep} from "node:path";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {X509Certificate,createPrivateKey,createPublicKey} from "node:crypto";
import {localSessionRatePolicy} from "../lib/product-auth/session-policy.ts";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig} from "../prisma/product/targets.ts";
const ORIGIN="https://127.0.0.1:3443";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function authorizeLocalGateway(args,env) {
  if(process.platform!=="linux" || args.length!==1 || args[0]!=="--owner-start-single-origin" ||
    env.NODE_ENV!=="development" || env.PRODUCT_DATABASE_MODE!=="test" ||
    env.PRODUCT_SINGLE_ORIGIN_CONFIRMED!=="true" || env.PRODUCT_LOCAL_HTTPS_CONFIRMED!=="true" ||
    env.PRODUCT_LOCAL_RATE_POLICY_CONFIRMED!=="true" || env.ENABLE_PRODUCT_SESSION_HTTP!=="true" ||
    env.PRODUCT_SESSION_HTTP_ORIGIN!==ORIGIN || !UUID.test(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"") ||
    env.PRODUCT_EMAIL_WORKER_ENABLED==="true" || env.ENABLE_LOCAL_AUTH_FRONTEND==="true" ||
    ["NODE_OPTIONS","NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new Error("Explicit isolated gateway configuration required.");
  const target=productDatabaseConfig(env),raw=env.PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN;
  if(!raw)throw new Error();
  const next=new URL(raw),port=Number(next.port);
  if(raw!==next.origin || next.protocol!=="http:" || next.hostname!=="127.0.0.1" ||
    !Number.isSafeInteger(port) || port<1024 || port>65535 || port===3443 || next.username || next.password)throw new Error();
  const key=Buffer.from(env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY??"","base64");
  const session=Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY??"","base64");
  if(key.length!==32 || key.toString("base64")!==env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY || session.length!==32 ||
    session.toString("base64")!==env.PRODUCT_SESSION_TOKEN_KEY || key.equals(session) ||
    !env.PRODUCT_SESSION_HTTP_AUTH_SECRET || env.PRODUCT_SESSION_HTTP_AUTH_SECRET.length<32 ||
    key.equals(Buffer.from(env.PRODUCT_SESSION_HTTP_AUTH_SECRET)) || session.equals(Buffer.from(env.PRODUCT_SESSION_HTTP_AUTH_SECRET)))throw new Error();
  for(const file of [env.PRODUCT_HTTPS_CERT_FILE,env.PRODUCT_HTTPS_KEY_FILE])if(!file||!isAbsolute(file))throw new Error();
  if(env.PRODUCT_HTTPS_CERT_FILE===env.PRODUCT_HTTPS_KEY_FILE)throw new Error();
  return {target,identifierKey:key,policy:localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID)};
}
export function readLocalCertificate(env) {
  const root=realpathSync(process.cwd());
  const read=file=>{
    if(!file||!isAbsolute(file)||realpathSync(file)!==file||file===root||file.startsWith(root+sep))throw new Error();
    const stat=lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o600||stat.size>16384)throw new Error();
    return readFileSync(file);
  };
  const cert=read(env.PRODUCT_HTTPS_CERT_FILE),key=read(env.PRODUCT_HTTPS_KEY_FILE),x=new X509Certificate(cert);
  if(x.checkIP("127.0.0.1")!=="127.0.0.1"||Date.parse(x.validFrom)>Date.now()||Date.parse(x.validTo)<=Date.now()||
    !x.publicKey.export({type:"spki",format:"der"}).equals(createPublicKey(createPrivateKey(key)).export({type:"spki",format:"der"})))throw new Error();
  return {cert,key};
}
// Exported solely for offline lifecycle tests; no database/listen call on import.
export async function serveLocalGateway(server,client,signal,ready=()=>{}) {
  let stop;const stopped=new Promise(resolve=>{stop=resolve;});
  signal.addEventListener("abort",stop,{once:true});
  try {
    if(signal.aborted)return;
    await server.listen();
    if(!signal.aborted){ready();await stopped;}
  }finally{
    signal.removeEventListener("abort",stop);
    try{await server.close();}finally{await client.$disconnect();}
  }
}
async function main(args,env) {
  const options=authorizeLocalGateway(args,env),tls=readLocalCertificate(env);
  await import("./register-server-only.mjs");
  const {assertProductMigrationFiles}=await import("../prisma/product/migration-files.ts");assertProductMigrationFiles();
  const {PrismaPg}=await import("@prisma/adapter-pg"),{PrismaClient}=await import("../prisma/product/generated/client.ts");
  const {createSingleOriginServer}=await import("../lib/product-auth/single-origin.server.ts");
  let client,server;const stop=new AbortController(),shutdown=()=>stop.abort();
  process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
  try {
    client=new PrismaClient({adapter:new PrismaPg({options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionString:options.target.url,max:4,connectionTimeoutMillis:5000,query_timeout:10000,
      statement_timeout:7000,lock_timeout:3000,idle_in_transaction_session_timeout:10000},
      {schema:"product",onPoolError:()=>{},onConnectionError:()=>{}}),log:[]});
    server=createSingleOriginServer(client,{env,policy:options.policy,identifierKey:options.identifierKey,...tls});
    await serveLocalGateway(server,client,stop.signal,()=>console.log("Local HTTPS gateway listening at "+ORIGIN+"; stop with Ctrl-C. No public authentication."));
  }finally{
    // Factory failure precedes serveLocalGateway's ownership of cleanup.
    if(client&&!server)await client.$disconnect();
    process.off("SIGINT",shutdown);process.off("SIGTERM",shutdown);options.identifierKey.fill(0);tls.key.fill(0);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{await main(process.argv.slice(2),process.env);}
  catch{console.error("Local gateway stopped: configuration, bind or shutdown unconfirmed. Inspect privately; no automatic retry or cleanup.");process.exitCode=1;}
}
