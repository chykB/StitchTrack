// Offline unit/static checks only. Never invokes the owner HTTP benchmark.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp,readFile,readdir,rmdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {authorizeTiming,validEnvelope,FIXTURE,fileStore,controlledTransport,createTimingWorkflow,completeResponse,TRANSPORT_DELAY_MS} from "../../task-04-server-security/experiments/email-timing/workflow.mjs";
import {summary} from "../../task-04-server-security/experiments/email-timing/measure.mjs";

test("timing import is inert and explicit authorization rejects production/default/extra arguments",()=>{
 const env={NODE_ENV:"development",TASK04_EMAIL_TIMING_CONFIRMED:"true"};
 assert.doesNotThrow(()=>authorizeTiming(["--owner-measure"],env));
 for(const bad of [{},{...env,NODE_ENV:"production"},{...env,NODE_ENV:"test"},{...env,TASK04_EMAIL_TIMING_CONFIRMED:"false"}])assert.throws(()=>authorizeTiming(["--owner-measure"],bad));
 for(const args of [[],["--owner-measure","--force"],["--owner-run"]])assert.throws(()=>authorizeTiming(args,env));
});
test("HTTP guard requires genuine loopback peers, exact host, token and request shape",()=>{
 const req={socket:{remoteAddress:"127.0.0.1",localAddress:"127.0.0.1"},method:"POST",url:"/sync",headers:{host:"127.0.0.1:12345",authorization:"Bearer synthetic-token","content-type":"application/json"}};
 assert.equal(validEnvelope(req,req.headers.host,"synthetic-token"),true);
 for(const change of [{socket:{...req.socket,remoteAddress:"10.0.0.1"}},{method:"GET"},{url:"/auth?signup"},
  {headers:{...req.headers,host:"evil.example"}},{headers:{...req.headers,origin:"https://evil.example"}},
  {headers:{...req.headers,cookie:"session=unexpected"}},{headers:{...req.headers,authorization:"Bearer wrong"}}])assert.equal(validEnvelope({...req,...change},req.headers.host,"synthetic-token"),false);
});
test("sync waits after commit; background finishes response before the identical single dispatch",async()=>{
 for(const mode of ["sync","background"]) {
  const events=["commit"];let calls=0;
  const job={dispatch:async()=>{calls++;events.push("dispatch");return {completedAt:3,dispatchMs:1};}};
  await completeResponse(mode,job,async()=>{events.push("HTTP finish");return 2;},async()=>{events.push("next turn");});
  assert.equal(calls,1);
  assert.deepEqual(events,mode==="sync"?["commit","dispatch","HTTP finish"]:["commit","HTTP finish","next turn","dispatch"]);
 }
});
test("controlled transport reports only controlled completion and forwards the configured wait",async()=>{
 const waits=[];const transport=controlledTransport(async ms=>waits.push(ms));
 assert.equal(await transport.deliver({html:"<p>Synthetic</p>",text:"Synthetic"}),"controlled_complete");
 assert.deepEqual(waits,[TRANSPORT_DELAY_MS]);await assert.rejects(transport.deliver({text:"incomplete"}));
});
test("shared validation, exact password, encrypted file content and real renderer are reused without Terms",async()=>{
 let record,password,calls=0;
 const transport={deliver:async message=>{calls++;assert.ok(message.text.includes("five minutes"));assert.match(message.html,/<h1/u);return "controlled_complete";}};
 const workflow=createTimingWorkflow({commit:async value=>{record=value;}},transport,{hash:async value=>{password=value;return "synthetic-unit-test-hash";}});
 const job=await workflow.prepare({...FIXTURE});assert.equal(password,FIXTURE.password);assert.equal(calls,0);
 assert.equal(record.kind,"synthetic-timing-only");assert.equal(record.passwordHash,"synthetic-unit-test-hash");
 assert.equal(Buffer.from(record.nonce,"base64").length,12);assert.equal(Buffer.from(record.authTag,"base64").length,16);
 assert.equal(Buffer.from(record.verifier,"base64").length,32);assert.equal(record.expiresAt-record.createdAt,300000);
 assert.ok(!JSON.stringify(record).includes(FIXTURE.password));assert.ok(!JSON.stringify(record).includes(FIXTURE.email));assert.equal(record.termsAccepted,undefined);
 assert.ok(Number.isFinite(job.commitMs));await job.dispatch();assert.equal(calls,1);
 await assert.rejects(workflow.prepare({...FIXTURE,email:"real@example.invalid"}));
 await assert.rejects(workflow.prepare({...FIXTURE,password:"short"}));
});
test("commit or controlled transport failure is not converted into success",async()=>{
 let dispatched=false;
 const workflow=createTimingWorkflow({commit:async()=>{throw new Error("controlled failure");}},{deliver:async()=>{dispatched=true;}},{hash:async()=>"unit-test"});
 await assert.rejects(workflow.prepare(FIXTURE));assert.equal(dispatched,false);
 const other=createTimingWorkflow({commit:async()=>{}},{deliver:async()=>"accepted"},{hash:async()=>"unit-test"});
 const job=await other.prepare(FIXTURE);await assert.rejects(job.dispatch());
});
test("private synthetic file publication is complete and cleanup removes only run-owned files",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"stitchtrack-timing-unit-")),store=fileStore(dir);
 try {
  const record={id:"00000000-0000-4000-8000-000000000001",kind:"synthetic-unit-test"};
  const file=await store.commit(record);assert.deepEqual(JSON.parse(await readFile(file,"utf8")),record);
  assert.deepEqual(await readdir(dir),[record.id+".json"]);
  await assert.rejects(store.commit({id:"../outside"}));await store.cleanup();assert.deepEqual(await readdir(dir),[]);
 } finally {await store.cleanup();await rmdir(dir);}
});
test("statistics derive only from supplied samples and harness contains no product worker/database/SMTP integration",()=>{
 assert.deepEqual(summary([1,3,2,4]),{n:4,meanMs:2.5,medianMs:2.5,minMs:1,maxMs:4});assert.throws(()=>summary([]));assert.throws(()=>summary([NaN]));
 const code=readFileSync(new URL("../../task-04-server-security/experiments/email-timing/measure.mjs",import.meta.url),"utf8");
 assert.match(code,/server.listen\(0,"127.0.0.1"/u);assert.match(code,/performance.now\(\)/u);assert.match(code,/await store.cleanup\(\)/u);
 assert.doesNotMatch(code,/from ["'][^"']*(?:pg|prisma|smtp.server|registration.server|outbox-worker)|readFile|dotenv|fetch\(/u);
 assert.match(code,/NOT PostgreSQL\/Better Auth registration/u);assert.match(code,/no real delivery/iu);
});
