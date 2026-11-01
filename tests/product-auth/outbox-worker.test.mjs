// Injected PostgreSQL session/SMTP tests, not database or delivery evidence.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EventEmitter} from "node:events";
import "../../scripts/register-server-only.mjs";
const {createOutboxWorker,emailWorkerConfig,OUTBOX_LOCK}=await import("../../lib/product-auth/outbox-worker.server.ts");
const {createSecretTools,ProductAuthError}=await import("../../lib/product-auth/secrets.server.ts");
const {authorizeEmailWorker,connectWorkerSession,runGuardedWorkerPass}=await import("../../scripts/email-outbox-worker.mjs");
const environment={NODE_ENV:"test",PRODUCT_EMAIL_WORKER_ENABLED:"true",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
function fixture() {
 let time=new Date("2026-10-29T12:00:00Z"),owner=null,serial=0;
 const tools=createSecretTools({currentId:"v",keys:new Map([["v",Buffer.alloc(32,1)]])},{currentId:"m",keys:new Map([["m",Buffer.alloc(32,2)]])});
 const payload={email:"synthetic@example.invalid",otp:"004281"},context={id:"synthetic-job",issuanceId:"synthetic-issue",templateVersion:"tailor-verification-v1"};
 // approvedTerms represents a mocked approved operational acceptance, never an
 // approval of real policies or a row inserted into any PostgreSQL database.
 const row={...context,...tools.seal(context,payload),status:"pending",attemptCount:0,availableAt:time,createdAt:time,updatedAt:time,sentAt:null,
  userId:"synthetic-user",userEmail:payload.email,emailVerified:false,issueEmail:payload.email,issueVerificationId:"synthetic-vendor",
  issueExpiresAt:new Date(+time+300_000),failedAttempts:0,consumedAt:null,supersededAt:null,
  verifier:tools.mac(context.issuanceId,payload.email,payload.otp),verifierKeyId:"v",verificationRecordId:"synthetic-vendor",
  verificationExpiresAt:new Date(+time+300_000),approvedTerms:true};
 const events=[],sessions=[];let opens=0,sends=0;
 const f={row,events,payload,tools,sessions,onQuery:()=>{},send:async()=>({status:"accepted"}),
  advance:ms=>{time=new Date(+time+ms);},now:()=>new Date(time),opens:()=>opens,sends:()=>sends};
 const deps={clock:()=>new Date(time),secrets:{matches:tools.matches.bind(tools),open:(...args)=>{opens++;return tools.open(...args);}},
  mailer:{sendVerification:async(data,expiry)=>{sends++;assert.deepEqual(data,payload);assert.equal(+expiry,+row.issueExpiresAt);
    assert.ok(events.every(e=>!/^BEGIN\b/iu.test(e)));return f.send(data,expiry);}},
  connect:async()=>{
   const id=++serial;let alive=true;const session={alive:()=>alive,lose:()=>{alive=false;if(owner===id)owner=null;},
    end:async()=>{alive=false;if(owner===id)owner=null;events.push("end");},
    query:async(sql,values=[])=>{
     if(!alive)throw new Error("Synthetic lost connection");
     const tag=sql.match(/outbox:(\w+)/u)?.[1]??sql;events.push(tag);await f.onQuery(tag,values);
     const result=rows=>({rows,rowCount:rows.length});
     if(sql.includes("current_database"))return result([{database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",namespace:"product",rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false}]);
     if(sql.startsWith("SET "))return result([]);
     if(sql.includes("pg_try_advisory_lock")){assert.deepEqual(values,[...OUTBOX_LOCK]);if(owner!==null)return result([{locked:false}]);owner=id;return result([{locked:true}]);}
     if(tag==="next")return result(row.status==="pending" && row.availableAt<=values[0] && row.approvedTerms && row.templateVersion===values[1]?[{id:row.id}]:[]);
     if(tag==="load")return result([structuredClone(row)]);
     if(tag==="cancel"){if(row.status==="pending"){row.status="cancelled";row.updatedAt=values[1];return result([{}]);}return result([]);}
     if(tag==="reserve"){
      if(row.status!=="pending" || row.attemptCount!==values[1] || +row.availableAt!==+values[2])return result([]);
      row.attemptCount++;row.availableAt=values[3];row.updatedAt=values[4];return result([{attemptCount:row.attemptCount}]);
     }
     if(tag==="sent" || tag==="finish"){
      if(row.status!=="pending" || row.attemptCount!==values[1] || +row.availableAt!==+values[2])return result([]);
      if(tag==="sent"){row.status="sent";row.sentAt=values[3];row.availableAt=values[3];row.updatedAt=values[3];}
      else {row.status=values[3];row.availableAt=values[4];row.updatedAt=values[5];}
      return result([{}]);
     }
     throw new Error("Unexpected offline SQL contract");
    }};sessions.push(session);return session;
  }};
 return Object.assign(f,{deps,worker:()=>createOutboxWorker(environment,deps)});
}
test("activation is default-off, exact-target and owner-argument guarded; imports open nothing",()=>{
 assert.equal(emailWorkerConfig(environment).mode,"test");assert.equal(authorizeEmailWorker(["--owner-run"],environment).mode,"test");
 for(const env of [{},{...environment,PRODUCT_EMAIL_WORKER_ENABLED:"false"},{...environment,NODE_ENV:"production"},
  {...environment,PGOPTIONS:"override"},{...environment,PRODUCT_TEST_DATABASE_URL:environment.PRODUCT_TEST_DATABASE_URL.replace("stitchtrack_product_test?","stitchtrack_assessment?")},
  {...environment,PRODUCT_TEST_DATABASE_URL:environment.PRODUCT_TEST_DATABASE_URL.replace("_app:","_migrator:")}]) {
  assert.throws(()=>emailWorkerConfig(env));assert.throws(()=>authorizeEmailWorker(["--owner-run"],env));
 }
 assert.throws(()=>authorizeEmailWorker(["--owner-run","--reset"],environment));
});
test("successful reservation/decryption/recheck precedes SMTP and only acceptance records sentAt",async()=>{
 const f=fixture();f.send=async()=>{assert.equal(f.row.attemptCount,1);assert.equal(f.row.sentAt,null);assert.ok(f.row.availableAt>f.now());return {status:"accepted"};};
 assert.equal(await f.worker().runOnce(),"sent");assert.equal(f.row.status,"sent");assert.equal(+f.row.sentAt,+f.now());
 assert.ok(f.row.sentAt>=f.row.availableAt);assert.equal(f.sends(),1);assert.equal(f.opens(),1);
 assert.deepEqual(f.events.filter(e=>["load","reserve"].includes(e)),["load","reserve","load","load"]);
 assert.equal(f.sessions[0].alive(),false);
});
test("competing worker cannot dispatch while the first dedicated session owns the advisory lock",async()=>{
 const f=fixture();let release,started;const entered=new Promise(resolve=>started=resolve);
 f.send=async()=>{started();return new Promise(resolve=>release=()=>resolve({status:"accepted"}));};
 const first=f.worker().runOnce();await entered;
 assert.equal(await f.worker().runOnce(),"busy");assert.equal(f.sends(),1);
 release();assert.equal(await first,"sent");assert.equal(await f.worker().runOnce(),"idle");
});
test("expired/exhausted/missing challenge/changed identity states cancel without decrypting",async()=>{
 for(const edit of [{issueExpiresAt:new Date(0)},{verificationExpiresAt:new Date(0)},{verificationRecordId:null},
  {consumedAt:new Date()},{supersededAt:new Date()},{failedAttempts:3},{emailVerified:true},{issueEmail:"other@example.invalid"},{attemptCount:3}]) {
  const f=fixture();Object.assign(f.row,edit);assert.equal(await f.worker().runOnce(),"cancelled");assert.equal(f.opens(),0);assert.equal(f.sends(),0);
 }
});
test("historical synthetic Terms fixtures and unknown templates are not dispatched or modified",async()=>{
 for(const edit of [{approvedTerms:false},{templateVersion:"unknown-v2"}]) {
  const f=fixture();Object.assign(f.row,edit);const before=structuredClone(f.row);
  assert.equal(await f.worker().runOnce(),"idle");assert.deepEqual(structuredClone(f.row),before);assert.equal(f.sends(),0);assert.equal(f.opens(),0);
 }
});
test("cancellation before decrypt or final handoff prevents sending; cancellation during SMTP is never reopened",async()=>{
 for(const phase of [2,3]) {
  const f=fixture();let loads=0;f.onQuery=async tag=>{if(tag==="load" && ++loads===phase)f.row.status="cancelled";};
  assert.equal(await f.worker().runOnce(),"cancelled");assert.equal(f.sends(),0);assert.equal(f.opens(),phase===2?0:1);
 }
 const f=fixture();f.send=async()=>{f.row.status="cancelled";return {status:"accepted"};};
 assert.equal(await f.worker().runOnce(),"accepted_unrecorded");assert.equal(f.row.status,"cancelled");assert.equal(f.row.sentAt,null);
});
test("definite rejection retries at 15/30 seconds, spends at most three attempts and respects expiry",async()=>{
 const f=fixture();f.send=async()=>{throw new ProductAuthError("email_delivery_rejected");};
 assert.equal(await f.worker().runOnce(),"rejected_retry");assert.equal(+f.row.availableAt,+f.now()+15_000);
 assert.equal(await f.worker().runOnce(),"idle");f.advance(15_000);
 assert.equal(await f.worker().runOnce(),"rejected_retry");assert.equal(+f.row.availableAt,+f.now()+30_000);f.advance(30_000);
 assert.equal(await f.worker().runOnce(),"rejected_stop");assert.equal(f.row.attemptCount,3);assert.equal(f.row.sentAt,null);
 const g=fixture();g.row.issueExpiresAt=new Date(+g.now()+5000);g.send=f.send;
 assert.equal(await g.worker().runOnce(),"rejected_stop");assert.equal(g.row.status,"cancelled");
});
test("uncertain outcomes stop automatic retries and never pretend sent/inbox delivery",async()=>{
 const f=fixture();f.send=async()=>{throw new ProductAuthError("email_delivery_unconfirmed");};
 assert.equal(await f.worker().runOnce(),"unconfirmed_stop");assert.equal(f.row.status,"cancelled");assert.equal(f.row.sentAt,null);
 f.advance(60_000);assert.equal(await f.worker().runOnce(),"idle");assert.equal(f.sends(),1);
});
test("crash after reservation preserves spent budget and delay; recovered session can process after delay",async()=>{
 const f=fixture();let crash=true;f.onQuery=async tag=>{if(tag==="load" && f.row.attemptCount===1 && crash)throw new Error("Synthetic crash");};
 await assert.rejects(f.worker().runOnce(),error=>error instanceof ProductAuthError && error.code==="email_worker_unavailable");
 assert.equal(f.row.attemptCount,1);assert.equal(f.sends(),0);assert.equal(await f.worker().runOnce(),"idle");
 crash=false;f.advance(60_000);assert.equal(await f.worker().runOnce(),"sent");assert.equal(f.row.attemptCount,2);
});
test("connection loss and SMTP-accepted database failure retain uncertainty, not fabricated sent state",async()=>{
 const f=fixture();f.send=async()=>{f.sessions[0].lose();return {status:"accepted"};};
 await assert.rejects(f.worker().runOnce());assert.equal(f.row.sentAt,null);assert.equal(f.row.attemptCount,1);
 const g=fixture();g.onQuery=async tag=>{if(tag==="sent")throw new Error("Synthetic acknowledgement persistence failure");};
 await assert.rejects(g.worker().runOnce());assert.equal(g.row.sentAt,null);assert.equal(g.sends(),1);
 // At-least-once recovery may duplicate a previously accepted send after this
 // crash window. This is explicit uncertainty, never exactly-once evidence.
 g.onQuery=async()=>{};g.advance(60_000);assert.equal(await g.worker().runOnce(),"sent");assert.equal(g.sends(),2);
});
test("corrupt ciphertext or inconsistent verifier fails closed without leaking native errors",async t=>{
 const logs=[];t.mock.method(console,"error",(...args)=>logs.push(args));
 for(const edit of [{authTag:new Uint8Array(16)},{verifier:new Uint8Array(32)}]) {
  const f=fixture();Object.assign(f.row,edit);await assert.rejects(f.worker().runOnce(),error=>{
   assert.equal(error.code,"email_worker_unavailable");assert.equal(error.cause,undefined);assert.ok(!String(error.stack).includes("004281"));return true;
  });assert.equal(f.sends(),0);
 }
 assert.deepEqual(logs,[]);
});
test("prepared additive privileges and watchdog preserve identity/Terms/history restrictions",()=>{
 const sql=readFileSync(new URL("../../prisma/product/setup/worker-permissions.sql",import.meta.url),"utf8");
 assert.match(sql,/GRANT UPDATE \("attemptCount", "availableAt", "sentAt"\) ON product\."EmailOutbox"/u);
 assert.equal((sql.match(/^GRANT /gmu)??[]).length,1);assert.doesNotMatch(sql,/CREATE |ALTER |DROP |GRANT ALL|GRANT.*Terms/u);
 const cli=readFileSync(new URL("../../scripts/email-outbox-worker.mjs",import.meta.url),"utf8");
 assert.match(cli,/setTimeout\(fatal,30_000\)/u);assert.match(cli,/process\.exit\(1\)/u);
 assert.doesNotMatch(cli,/(?:import|readFile)[^\n]*dotenv|\.env\.local|console\.error\(error/u);
});

test("claim race and post-decryption identity change cannot dispatch stale payloads",async()=>{
 const f=fixture();f.onQuery=async tag=>{if(tag==="reserve")f.row.status="cancelled";};
 assert.equal(await f.worker().runOnce(),"idle");assert.equal(f.row.attemptCount,0);assert.equal(f.sends(),0);
 const g=fixture();let loads=0;g.onQuery=async tag=>{if(tag==="load" && ++loads===3){g.row.userEmail="changed@example.invalid";g.row.issueEmail="changed@example.invalid";}};
 await assert.rejects(g.worker().runOnce());assert.equal(g.opens(),1);assert.equal(g.sends(),0);
});
test("actual connected identity is independently checked before locking or writes; native errors are sanitized",async()=>{
 const f=fixture(),connect=f.deps.connect;
 f.deps.connect=async()=>{const db=await connect(),query=db.query;db.query=async(sql,values)=>{
  const result=await query(sql,values);if(sql.includes("current_database"))result.rows[0].role="unexpected-role";return result;
 };return db;};
 await assert.rejects(f.worker().runOnce(),error=>error.code==="email_worker_unavailable");
 assert.equal(f.row.attemptCount,0);assert.equal(f.sends(),0);assert.equal(f.events.length,2);
 const g=fixture();g.onQuery=async()=>{throw new Error("Synthetic credential and payload details must remain private");};
 await assert.rejects(g.worker().runOnce(),error=>error.code==="email_worker_unavailable" && !String(error.stack).includes("credential and payload"));
});

function lifecycleClient() {
 const client=new EventEmitter();let ends=0;
 client.connect=async()=>{};
 client.query=async()=>({rows:[],rowCount:0});
 client.end=async()=>{ends++;client.emit("end");};
 return {client,ends:()=>ends};
}
test("both unexpected pg error/end invalidate the session and invoke fatal exactly once",async()=>{
 for(const event of ["error","end"]) {
  const f=lifecycleClient(),calls=[];const session=await connectWorkerSession(f.client,(...args)=>calls.push(args));
  assert.equal(session.alive(),true);
  f.client.emit(event,new Error("Synthetic private native diagnostic"));
  assert.equal(session.alive(),false);assert.deepEqual(calls,[[]]);
  f.client.emit("end");f.client.emit("error",new Error("Later diagnostic"));
  assert.equal(calls.length,1);
  await session.end();assert.equal(calls.length,1);assert.equal(f.ends(),1);
 }
});
test("intentional client.end and connect-failure cleanup suppress fatal disconnect events",async()=>{
 const f=lifecycleClient();let fatals=0;
 const session=await connectWorkerSession(f.client,()=>fatals++);
 await session.end();assert.equal(session.alive(),false);assert.equal(fatals,0);
 f.client.emit("error",new Error("Late shutdown diagnostic"));assert.equal(fatals,0);
 const g=lifecycleClient();g.client.connect=async()=>{throw new Error("Private connection diagnostic");};
 await assert.rejects(connectWorkerSession(g.client,()=>fatals++),error=>error.message==="Worker connection unavailable." && error.cause===undefined);
 assert.equal(g.ends(),1);assert.equal(fatals,0);
});
test("30-second watchdog invokes fail-stop without locally releasing the in-flight session lock",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});
 const f=fixture();let release,started,fatals=0;
 const entered=new Promise(resolve=>started=resolve);
 f.send=async()=>{started();return new Promise(resolve=>release=()=>resolve({status:"accepted"}));};
 let settled=false;
 const pass=runGuardedWorkerPass(f.worker(),()=>fatals++).finally(()=>{settled=true;});
 await entered;t.mock.timers.tick(29_999);assert.equal(fatals,0);assert.equal(settled,false);
 assert.equal(f.sessions[0].alive(),true);assert.equal(await f.worker().runOnce(),"busy");
 t.mock.timers.tick(1);assert.equal(fatals,1);assert.equal(settled,false);assert.equal(f.sessions[0].alive(),true);
 // The test fatal stub returns so state can be inspected; the real CLI fatal
 // exits the whole process, closing both sockets. No detached Promise is used.
 release();assert.equal(await pass,"sent");assert.equal(f.sessions[0].alive(),false);
});
test("watchdog is cleared on both completed and failed passes",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});let fatals=0;
 assert.equal(await runGuardedWorkerPass({runOnce:async()=>"idle"},()=>fatals++),"idle");
 t.mock.timers.tick(30_000);assert.equal(fatals,0);
 await assert.rejects(runGuardedWorkerPass({runOnce:async()=>{throw new Error("Synthetic pass failure");}},()=>fatals++));
 t.mock.timers.tick(30_000);assert.equal(fatals,0);
});
