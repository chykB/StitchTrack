// OWNER ONLY. Import is inert: no dotenv, keys, connections or timers are read/started.
import {pathToFileURL} from "node:url";
import {productDatabaseConfig} from "../prisma/product/targets.ts";
export function authorizeEmailWorker(args, env) {
  if(args.length!==1 || args[0]!=="--owner-run" || env.PRODUCT_EMAIL_WORKER_ENABLED!=="true" ||
    env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE)throw new Error("Explicit reviewed product worker configuration required.");
  return productDatabaseConfig(env);
}
// Testable lifecycle pieces only; importing them creates no client or timer.
export async function connectWorkerSession(client, fatal) {
  let alive=true;
  const disconnected=()=>{if(alive){alive=false;fatal();}};
  client.on("error",disconnected);
  client.on("end",disconnected);
  // Mark intentional closure BEFORE pg emits end (or a late error).
  const end=async()=>{alive=false;await client.end();};
  try{await client.connect();if(!alive)throw new Error();}
  catch{await end().catch(()=>{});throw new Error("Worker connection unavailable.");}
  return {query:client.query.bind(client),alive:()=>alive,end};
}
export async function runGuardedWorkerPass(worker, fatal) {
  // Keep the dedicated session/lock until runOnce settles, or kill the whole
  // process. Never time out with Promise.race and detach a continuing SMTP send.
  const watchdog=setTimeout(fatal,30_000);
  try{return await worker.runOnce();}finally{clearTimeout(watchdog);}
}
async function main(target, env) {
  await import("./register-server-only.mjs");
  const {Client}=await import("pg");
  const {setTimeout:sleep}=await import("node:timers/promises");
  const {createOutboxWorker}=await import("../lib/product-auth/outbox-worker.server.ts");
  const {createSecretTools}=await import("../lib/product-auth/secrets.server.ts");
  const {createVerificationMailer}=await import("../lib/product-auth/smtp.server.ts");
  const keyRing=prefix=>{
    const id=env[prefix+"_KEY_ID"], encoded=env[prefix+"_KEY"];
    if(!id || !encoded || !/^[A-Za-z0-9+/]{43}=$/u.test(encoded))throw new Error("Worker key configuration required.");
    const key=Buffer.from(encoded,"base64");if(key.length!==32 || key.toString("base64")!==encoded)throw new Error("Worker key configuration required.");
    return {currentId:id,keys:new Map([[id,key]])};
  };
  const secrets=createSecretTools(keyRing("PRODUCT_EMAIL_VERIFIER"),keyRing("PRODUCT_EMAIL_OUTBOX"));
  const mailer=createVerificationMailer(env);
  const stop=new AbortController();
  const shutdown=()=>stop.abort();process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
  const fatal=()=>{console.error("Email worker stopped: connection or dispatch state is uncertain. No automatic restart.");process.exit(1);};
  const worker=createOutboxWorker(env,{secrets,mailer,connect:async()=>{
    const client=new Client({connectionString:target.url,connectionTimeoutMillis:5000,query_timeout:5000,keepAlive:true});
    return connectWorkerSession(client,fatal);
  }});
  try {
    while(!stop.signal.aborted) {
      const outcome=await runGuardedWorkerPass(worker,fatal);
      console.log("Email worker: "+outcome); // Fixed outcome only, no job/payload/provider data.
      if(outcome==="busy" || stop.signal.aborted)break;
      try{await sleep(2000,undefined,{signal:stop.signal});}catch{if(!stop.signal.aborted)throw new Error("Worker wait failed.");}
    }
  } finally {process.off("SIGINT",shutdown);process.off("SIGTERM",shutdown);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{await main(authorizeEmailWorker(process.argv.slice(2),process.env),process.env);}
  catch{console.error("Email worker stopped: configuration or delivery operation unavailable. Preserve state; inspect privately.");process.exit(1);}
}
