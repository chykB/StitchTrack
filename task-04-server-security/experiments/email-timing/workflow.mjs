// Isolated benchmark primitives. No listener, credentials, SMTP or database on import.
import {randomBytes, randomInt, randomUUID} from "node:crypto";
import {open, rename, unlink} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as sleep} from "node:timers/promises";
import "../../../scripts/register-server-only.mjs";
import {signupSchema} from "../../../lib/auth/schemas.ts";
const {hashPassword}=await import("../../../lib/auth/password.server.ts");
const {createSecretTools}=await import("../../../lib/product-auth/secrets.server.ts");
const {renderVerificationEmail, VERIFICATION_EMAIL_TEMPLATE}=await import("../../../lib/product-auth/verification-email.server.ts");

export const TRANSPORT_DELAY_MS=250;
export const FIXTURE=Object.freeze({name:"Synthetic Timing Person",email:"timing@example.invalid",password:" Synthetic timing password 004281 "});
export function authorizeTiming(args,env) {
  if(args.length!==1 || args[0]!=="--owner-measure" || env.NODE_ENV!=="development" || env.TASK04_EMAIL_TIMING_CONFIRMED!=="true")
    throw new Error("Explicit isolated development timing authorization required.");
}
export function validEnvelope(request,authority,token) {
  return request.socket.remoteAddress==="127.0.0.1" && request.socket.localAddress==="127.0.0.1" &&
    request.headers.host===authority && !request.headers.origin && !request.headers.cookie &&
    request.headers.authorization==="Bearer "+token && request.method==="POST" &&
    ["/sync","/background"].includes(request.url) && request.headers["content-type"]==="application/json";
}
// Private run-owned directory only. Atomic rename publishes a complete file;
// fsync before/after rename is a LOCAL FILE commit, never a PostgreSQL transaction.
export function fileStore(directory) {
  const files=new Set();
  return {
    async commit(record) {
      if(!/^[0-9a-f-]{36}$/u.test(record.id))throw new Error("Invalid synthetic record ID");
      const file=join(directory,record.id+".json"),temporary=file+".writing";
      let handle;
      try {
        handle=await open(temporary,"wx",0o600);
        await handle.writeFile(JSON.stringify(record));await handle.sync();await handle.close();handle=undefined;
        await rename(temporary,file);files.add(file);
        const dir=await open(directory,"r");try{await dir.sync();}finally{await dir.close();}
        return file;
      } finally {if(handle)await handle.close();await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
    },
    async cleanup(){for(const file of files)await unlink(file);files.clear();},
  };
}
// Deliberately controlled completion, not an SMTP implementation or acceptance.
export function controlledTransport(wait=sleep) {
  return {async deliver(message) {
    if(!message.html || !message.text)throw new Error("Missing rendered alternatives");
    await wait(TRANSPORT_DELAY_MS);
    return "controlled_complete";
  }};
}
export function createTimingWorkflow(store,transport,{hash=hashPassword,clock=()=>performance.now()}={}) {
  const ring=id=>({currentId:id,keys:new Map([[id,randomBytes(32)]])});
  const secrets=createSecretTools(ring("timing-verifier"),ring("timing-outbox"));
  return {
    async prepare(input) {
      const started=clock(),data=signupSchema.parse(input);
      // Only the public synthetic fixture is permitted; never accept real input.
      if(Object.keys(FIXTURE).some(key=>data[key]!==FIXTURE[key]))throw new Error("Synthetic fixture required");
      const passwordHash=await hash(data.password),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+300_000);
      const context={id:randomUUID(),issuanceId:randomUUID(),templateVersion:VERIFICATION_EMAIL_TEMPLATE};
      const payload={email:data.email,otp:randomInt(0,1_000_000).toString().padStart(6,"0")};
      const envelope=secrets.seal(context,payload),verifier=secrets.mac(context.issuanceId,data.email,payload.otp);
      const preCommitMs=clock()-started,commitStarted=clock();
      await store.commit({...context,kind:"synthetic-timing-only",passwordHash,createdAt,expiresAt,
        ...Object.fromEntries(Object.entries(envelope).map(([key,value])=>[key,typeof value==="string"?value:Buffer.from(value).toString("base64")])),
        verifier:verifier.toString("base64")});
      const committedAt=clock(),commitMs=committedAt-commitStarted;
      // No raw password or plaintext code is written. No Terms or account exists.
      return {committedAt,preCommitMs,commitMs,async dispatch() {
        const started=clock(),opened=secrets.open(context,envelope);
        if(!secrets.matches(verifier,context.issuanceId,opened.email,opened.otp,secrets.verifierKeyId) || expiresAt<=new Date())throw new Error("Synthetic job invalid");
        const result=await transport.deliver(renderVerificationEmail(opened,expiresAt));
        if(result!=="controlled_complete")throw new Error("Controlled transport failed");
        const completedAt=clock();return {completedAt,dispatchMs:completedAt-started};
      }};
    },
  };
}
// Both modes publish first and invoke the identical dispatcher exactly once.
// Background work starts on HTTP finish, not before the response is handed off.
export async function completeResponse(mode,job,respond,afterFinish) {
  if(mode==="sync") {
    const delivery=await job.dispatch();const responseAt=await respond();return {delivery,responseAt};
  }
  if(mode!=="background")throw new Error("Invalid benchmark mode");
  const responseAt=await respond();
  await afterFinish();
  const delivery=await job.dispatch();return {delivery,responseAt};
}
