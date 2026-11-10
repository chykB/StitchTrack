// Offline orchestration/filesystem tests only; operation doubles never connect to PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,existsSync,readFileSync,mkdirSync,writeFileSync,statSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {runScheduledErasure,authorizeScheduledErasure} from "../../scripts/account-erasure-scheduled.mjs";
const {ERASURE_TABLES}=await import("../../lib/product-auth/account-erasure.server.ts");
const env={NODE_ENV:"test",PRODUCT_ERASURE_SCHEDULER_ENABLED:"true"};
const config={format:1,ownerApproved:true,userId:"disposable-schedule-test",requestedAt:"2026-11-03T01:00:00.000Z",
 databaseUrl:"postgresql://stitchtrack_product_test_cleanup:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 executionEnabled:false,executionConfirmed:false};
const zeros=()=>Object.fromEntries(ERASURE_TABLES.map(t=>[t,0]));
const counts=()=>({...zeros(),User:1,Account:1});
function fixture(t,options={}){
 const directory=mkdtempSync(join(tmpdir(),"stitchtrack-schedule-test-"));
 t.after(()=>{assert.ok(directory.startsWith(join(tmpdir(),"stitchtrack-schedule-test-")));rmSync(directory,{recursive:true});});
 let configuration=structuredClone(config);const logs=[],calls=[];
 const operation=async(scope,mode)=>{calls.push(mode);return options.operation?.(scope,mode)??{status:"eligible",wouldAffect:counts()};};
 const run=patch=>runScheduledErasure({directory,env,readConfig:()=>configuration,operation,log:r=>logs.push(r),...patch});
 return {directory,logs,calls,run,configure:patch=>Object.assign(configuration,patch)};
}
test("default-disabled and production refuse before reading credentials or opening a connection",async t=>{
 const f=fixture(t),forbidden=()=>assert.fail("No configuration/database access");
 assert.equal((await f.run({env:{},readConfig:forbidden,operation:forbidden})).status,"disabled");
 assert.equal((await f.run({env:{...env,NODE_ENV:"production"},readConfig:forbidden,operation:forbidden})).status,"blocked");
 assert.equal(existsSync(join(f.directory,"guard")),false);assert.deepEqual(f.calls,[]);
 const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","scripts/account-erasure-scheduled.mjs","--owner-hourly"],
  {env:{PATH:process.env.PATH,NODE_ENV:"test"},encoding:"utf8",timeout:5000});
 assert.equal(child.status,0);assert.equal(child.stderr,"");assert.equal(JSON.parse(child.stdout.trim().split("\n").at(-1)).status,"disabled");
});
test("one exact account approval, original timestamp and separate destructive confirmations are mandatory",async t=>{
 const good=await authorizeScheduledErasure(config,env);assert.equal(good.cleanup,true);assert.equal(good.execution,false);
 for(const patch of [{ownerApproved:false},{ownerApproved:undefined},{userId:"*"},{userId:"someone@example.invalid"},
  {requestedAt:undefined},{requestedAt:"2026-02-30T01:00:00.000Z"},{executionEnabled:true},{executionConfirmed:true},
  {extra:"ignored"},{databaseUrl:config.databaseUrl.replace("_cleanup:","_migrator:")},
  {databaseUrl:config.databaseUrl.replace("/stitchtrack_product_test?","/stitchtrack_product_dev?")}])
  await assert.rejects(authorizeScheduledErasure({...config,...patch},env));
 const f=fixture(t);f.configure({ownerApproved:false});assert.equal((await f.run()).status,"blocked");
 assert.deepEqual(f.calls,[]);assert.ok(existsSync(join(f.directory,"guard")));
});
test("database-reported grace allows later hourly checks; eligible defaults to dry-run only",async t=>{
 let grace=true;const f=fixture(t,{operation:()=>grace?{status:"grace_period"}:{status:"eligible",wouldAffect:counts()}});
 f.configure({executionEnabled:true,executionConfirmed:true});
 for(let n=0;n<2;n++){assert.equal((await f.run()).status,"grace_period");assert.equal(existsSync(join(f.directory,"guard")),false);}
 assert.deepEqual(f.calls,["dry-run","dry-run"]);
 grace=false;f.configure({executionEnabled:false,executionConfirmed:false});assert.equal((await f.run()).status,"eligible_dry_run");
 assert.deepEqual(f.calls,["dry-run","dry-run","dry-run"]);assert.equal(existsSync(join(f.directory,"erased.json")),false);
});
test("blocked, failed and unconfirmed runs preserve latch and prevent automatic database retries",async t=>{
 for(const status of ["blocked","failed","missing"]){
  const f=fixture(t,{operation:()=>({status})});const first=await f.run();assert.equal(first.status,status==="failed"?"failed":"blocked");
  const before=f.calls.length;assert.equal((await f.run()).status,"blocked_previous_or_concurrent_run");assert.equal(f.calls.length,before);
 }
 for(const outcome of ["blocked","failed_rolled_back","unconfirmed"]){
  const f=fixture(t,{operation:(_s,m)=>m==="dry-run"?{status:"eligible",wouldAffect:counts()}:{outcome,counts:outcome==="failed_rolled_back"?zeros():null}});
  f.configure({executionEnabled:true,executionConfirmed:true});assert.equal((await f.run()).status,outcome);
  assert.ok(existsSync(join(f.directory,"guard")));assert.equal((await f.run()).status,"blocked_previous_or_concurrent_run");
  assert.deepEqual(f.calls,["dry-run","execute"]);
 }
});
test("a second invocation cannot overlap, and a crash marker never becomes an automatic retry",async t=>{
 let entered,release;const reached=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 const f=fixture(t,{operation:async()=>{entered();await wait;return {status:"grace_period"};}});
 const pending=f.run();await reached;assert.equal((await f.run()).status,"blocked_previous_or_concurrent_run");
 assert.deepEqual(f.calls,["dry-run"]);release();assert.equal((await pending).status,"grace_period");
 mkdirSync(join(f.directory,"guard"),{mode:0o700});
 assert.equal((await f.run()).status,"blocked_previous_or_concurrent_run");assert.deepEqual(f.calls,["dry-run"]);
});
test("recorded erasure preserves first receipt and allows an authoritative safe second-run noop",async t=>{
 let erased=false;const f=fixture(t,{operation:(_s,m)=>{
  if(m==="dry-run")return erased?{status:"missing"}:{status:"eligible",wouldAffect:counts()};
  if(erased)return {outcome:"noop",counts:zeros()};erased=true;return {outcome:"erased",counts:counts()};
 }});
 f.configure({executionEnabled:true,executionConfirmed:true});const first=await f.run();assert.equal(first.status,"erased");
 const receipt=readFileSync(join(f.directory,"erased.json"),"utf8");assert.equal(statSync(join(f.directory,"erased.json")).mode&0o777,0o600);
 assert.equal((await f.run()).status,"noop_after_recorded_erasure");assert.equal(readFileSync(join(f.directory,"erased.json"),"utf8"),receipt);
 assert.deepEqual(f.calls,["dry-run","execute","dry-run","execute"]);
 assert.equal(JSON.parse(readFileSync(join(f.directory,"last-run.json"))).status,"noop_after_recorded_erasure");
 f.configure({userId:"different-disposable-user"});assert.equal((await f.run()).status,"blocked");assert.equal(f.calls.length,4);
});
test("connection loss or receipt failure after execution remains unconfirmed and is never retried",async t=>{
 const f=fixture(t,{operation:(_s,m)=>{if(m==="dry-run")return {status:"eligible",wouldAffect:counts()};throw new Error("private database URL and token");}});
 f.configure({executionEnabled:true,executionConfirmed:true});assert.equal((await f.run()).status,"unconfirmed");
 assert.equal((await f.run()).status,"blocked_previous_or_concurrent_run");assert.deepEqual(f.calls,["dry-run","execute"]);
 const receipt=fixture(t,{operation:(_s,m)=>{
  if(m==="dry-run")return {status:"eligible",wouldAffect:counts()};
  mkdirSync(join(receipt.directory,"erased.json"));return {outcome:"erased",counts:counts()};
 }});
 receipt.configure({executionEnabled:true,executionConfirmed:true});assert.equal((await receipt.run()).status,"unconfirmed");
 assert.ok(existsSync(join(receipt.directory,"guard")));
});
test("malformed state/counts and missing approval fail closed without printing personal data",async t=>{
 const f=fixture(t);writeFileSync(join(f.directory,"scope.json"),"broken",{mode:0o600});assert.equal((await f.run()).status,"blocked");assert.deepEqual(f.calls,[]);
 const bad=fixture(t,{operation:()=>({status:"eligible",wouldAffect:{password:"sensitive"}})});assert.equal((await bad.run()).status,"failed");
 const secret=fixture(t);await secret.run();const output=JSON.stringify([...f.logs,...bad.logs,...secret.logs]);
 assert.doesNotMatch(output,/synthetic-only|postgresql:|disposable-schedule-test|2026-11-03T01:00:00|sensitive|private database/);
 for(const logs of [f.logs,bad.logs,secret.logs]){
  assert.equal(logs[0].phase,"start");assert.equal(logs.at(-1).phase,"finish");
  assert.equal(logs[0].run,logs.at(-1).run);assert.ok(Number.isFinite(Date.parse(logs.at(-1).timestamp)));
 }
});
test("systemd templates are hourly, inert by default, use private credentials and have no automatic service restart",()=>{
 const service=readFileSync(new URL("../../prisma/product/setup/systemd/stitchtrack-account-erasure.service",import.meta.url),"utf8");
 const timer=readFileSync(new URL("../../prisma/product/setup/systemd/stitchtrack-account-erasure.timer",import.meta.url),"utf8");
 assert.match(service,/PRODUCT_ERASURE_SCHEDULER_ENABLED=false/);assert.match(service,/LoadCredential=erasure.json:%h\/\.config\/stitchtrack-erasure\/owner.json/);
 assert.match(service,/Restart=no/);assert.match(service,/TimeoutStartSec=75s/);assert.match(service,/StateDirectoryMode=0700/);
 assert.match(timer,/OnCalendar=hourly/);assert.match(timer,/Persistent=true/);
 assert.doesNotMatch(service+timer,/postgres(?:ql)?:|PRODUCT_ERASURE_TARGET_USER_ID|PRODUCT_ERASURE_EXPECTED_REQUESTED_AT|User=root|--execute/);
});
