// Offline database behavior double. No PostgreSQL, job CLI, SMTP or fixture setup executes.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,chmodSync,writeFileSync,rmSync,rmdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {authorizeErasure,readErasureReceipt} from "../../scripts/account-erasure.mjs";
import {authorizeErasureProof} from "./account-erasure.integration.mjs";
const {runControlledErasure,erasureProofPlan,erasureDeadline,ERASURE_TABLES,EXPECTED_ERASURE_FKS}=await import("../../lib/product-auth/account-erasure.server.ts");
const run="cd3c1c18-24d3-45e8-bb70-8d541e8c1e68",plan=erasureProofPlan(run),now=new Date("2026-11-02T12:00:00Z");
const externalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No external requests in erasure tests");test.after(()=>globalThis.fetch=externalFetch);
function fixture(){
 const shared={owner:null,rows:{
  User:[{id:plan.target,name:plan.name,emailCanonical:plan.target+"@example.invalid",image:null,deletionRequestedAt:new Date(+now-1000),now},
   {id:"primary-existing-user",name:"Unrelated",emailCanonical:"unrelated@example.invalid",deletionRequestedAt:new Date(+now-31*86400000)},
   {id:plan.keep,name:plan.name,emailCanonical:plan.keep+"@example.invalid",deletionRequestedAt:null}],
  Account:[{id:"target-account",userId:plan.target,password:"synthetic encoded credential"},{id:"other-account",userId:"primary-existing-user"},{id:"keep-account",userId:plan.keep,password:"synthetic retained credential"}],
  Session:[{id:"target-session",userId:plan.target},{id:"other-session",userId:"primary-existing-user"}],
  Verification:[{id:plan.target+"-linked",identifier:"forget-password-otp-"+plan.target+"@example.invalid"},{id:plan.target+"-orphan",identifier:"email-verification-otp-"+plan.target+"@example.invalid"},{id:"other-verification",identifier:"other"}],
  TermsVersion:[{id:plan.terms,isTestFixture:true,approvedAt:null,effectiveAt:null},{id:"historical-terms",isTestFixture:true}],
  TermsAcceptance:[{id:"target-acceptance",userId:plan.target,termsVersionId:plan.terms,context:"synthetic-test"},{id:"other-acceptance",userId:"primary-existing-user",termsVersionId:"historical-terms",context:"synthetic-test"},{id:"keep-acceptance",userId:plan.keep,termsVersionId:plan.terms,context:"synthetic-test"}],
  EmailVerificationIssuance:[{id:"target-issue",userId:plan.target,emailCanonical:plan.target+"@example.invalid",purpose:"password-reset",verificationId:plan.target+"-linked"},{id:"other-issue",userId:"primary-existing-user",verificationId:"other-verification"}],
  EmailOutbox:[{id:plan.target+"-mail",issuanceId:"target-issue",payloadCiphertext:"synthetic encrypted payload",status:"pending"},{id:"other-mail",issuanceId:"other-issue"}],
  AuthRateBucket:[{keyDigest:plan.rateKeys[0],expiresAt:new Date(+now-1)},{keyDigest:plan.rateKeys[1],expiresAt:new Date(+now+86400000)},{keyDigest:"unrelated-expired-counter",expiresAt:new Date(0)}],
 }};
 // Deterministic row fingerprints in this double are not PostgreSQL JSON serialization proof.
 const digest=rows=>createHash("sha256").update(JSON.stringify(rows)).digest("hex");
 const historical=table=>shared.rows[table].filter(r=>
  table==="User"?![plan.target,plan.keep].includes(r.id):
  table==="TermsVersion"?r.id!==plan.terms:table==="Verification"?![plan.target+"-linked",plan.target+"-orphan"].includes(r.id):
  table==="AuthRateBucket"?!plan.rateKeys.includes(r.keyDigest):table==="EmailOutbox"?r.id!==plan.target+"-mail":![plan.target,plan.keep].includes(r.userId));
 const baseline=()=>Object.fromEntries(ERASURE_TABLES.map(table=>{const rows=historical(table);return [table,{count:rows.length,digest:digest(rows)}];}));
 const retained=()=>digest(["User","Account","Session","EmailVerificationIssuance","TermsAcceptance","TermsVersion","AuthRateBucket"].flatMap(table=>shared.rows[table].filter(r=>
  table==="User"?r.id===plan.keep:table==="TermsVersion"?r.id===plan.terms:table==="AuthRateBucket"?r.keyDigest===plan.rateKeys[1]:r.userId===plan.keep).map(row=>({table,row}))));
 const receipt={format:1,created:true,run,baseline:baseline(),retainedDigest:retained()};
 const connection=()=>{const id=Symbol();let prior,dirty=false,held=false;const db={events:[],fault:undefined,beforeUserDelete:undefined,
  async query(sql,args=[]){db.events.push(sql);const result=rows=>({rows,rowCount:rows.length});
   if(sql==="BEGIN"){prior=structuredClone(shared.rows);dirty=false;return result([]);}
   if(sql==="ROLLBACK"){if(dirty)shared.rows=prior;if(held)shared.owner=null;held=false;dirty=false;return result([]);}
   if(sql==="COMMIT"){if(held)shared.owner=null;held=false;dirty=false;if(db.fault==="commit")throw new Error("Synthetic lost acknowledgement");return result([]);}
   if(sql.startsWith("SET LOCAL"))return result([]);
   if(sql.includes("erasure:identity"))return result([{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",login:"stitchtrack_product_test_migrator",port:"5432",timezone:"UTC",safe:true,owns:true,...db.identity}]);
   if(sql.includes("erasure:tables"))return result([...ERASURE_TABLES,"_prisma_migrations",...(db.extraTables??[])].map(name=>({name,owner:"stitchtrack_product_test_migrator",kind:"r"})));
   if(sql.includes("erasure:history"))return result(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum,finished_at:now,rolled_back_at:null,logs:null,applied_steps_count:1,...db.history})));
   if(sql.includes("erasure:fks"))return result(EXPECTED_ERASURE_FKS.map(([conname,source,column,target,reference,confdeltype,confupdtype])=>({conname,source,target,columns:[column],referenced_columns:[reference],source_schema:"product",target_schema:"product",confdeltype,confupdtype,...db.fk})));
   if(sql.includes("erasure:lock")){if(shared.owner)return result([{locked:false}]);shared.owner=id;held=true;return result([{locked:true}]);}
   if(sql.includes("erasure:protect-snapshots")){assert.ok(prior,"snapshot protection requires a transaction");assert.ok(held,"worker lock precedes table locks");return result([]);}
   const baselineTable=/erasure:baseline:([A-Za-z]+)/u.exec(sql)?.[1];
   if(baselineTable){assert.ok(db.events.some(s=>s.includes("erasure:protect-snapshots")));return result([baseline()[baselineTable]]);}
   if(sql.includes("erasure:retained"))return result([{digest:retained()}]);
   if(sql.includes("erasure:metrics"))return result([{pending:2,approaching:1,overdue:1}]);
   if(sql.includes("erasure:user"))return result(shared.rows.User.filter(r=>r.id===args[0]));
   if(sql.includes("erasure:terms"))return result(shared.rows.TermsAcceptance.filter(a=>a.userId===args[0]).map(a=>({...shared.rows.TermsVersion.find(t=>t.id===a.termsVersionId),context:a.context})));
   if(sql.includes("erasure:unmapped"))return result([{invalid:db.unmapped===true}]);
   if(sql.includes("erasure:verification"))return result(shared.rows.Verification.filter(v=>args[1].includes(v.identifier)||shared.rows.EmailVerificationIssuance.some(i=>i.userId===args[0]&&i.verificationId===v.id)));
   if(sql.includes("erasure:ownership"))return result([{invalid:shared.rows.EmailVerificationIssuance.some(i=>args[1].includes(i.verificationId)&&i.userId!==args[0]||i.userId===args[0]&&(i.emailCanonical!==args[2]||!["email-verification","password-reset"].includes(i.purpose)))}]);
   if(sql.includes("erasure:counts"))return result([Object.fromEntries(["Account","Session","EmailVerificationIssuance","EmailOutbox"].map(t=>[t,shared.rows[t].filter(r=>t==="EmailOutbox"?shared.rows.EmailVerificationIssuance.some(i=>i.userId===args[0]&&i.id===r.issuanceId):r.userId===args[0]).length]))]);
   if(sql.includes("erasure:residual"))return result([{found:shared.rows.Verification.some(v=>args[0].includes(v.identifier)||args[1].includes(v.id))}]);
   if(sql.includes("erasure:expired"))return result(shared.rows.AuthRateBucket.filter(r=>args[0].includes(r.keyDigest)&&r.expiresAt<=now));
   const table=/erasure:delete:([A-Za-z]+)/u.exec(sql)?.[1];
   if(table){if(db.fault===table)throw new Error("Synthetic private SQL failure");if(table==="User"&&db.beforeUserDelete)await db.beforeUserDelete();
    if(table==="EmailVerificationIssuance")assert.equal(shared.rows.EmailOutbox.some(j=>shared.rows.EmailVerificationIssuance.some(i=>i.id===j.issuanceId&&i.userId===args[0])),false,"FK child must be deleted first");
    if(table==="User")for(const child of ["Account","Session","TermsAcceptance","EmailVerificationIssuance"])assert.equal(shared.rows[child].some(r=>r.userId===args[0]),false,"User FKs must be removed first");
    const match=r=>table==="User"?r.id===args[0]&&+r.deletionRequestedAt===+args[1]:table==="Verification"?args[0].includes(r.id):table==="AuthRateBucket"?args[0].includes(r.keyDigest):table==="EmailOutbox"?shared.rows.EmailVerificationIssuance.some(i=>i.userId===args[0]&&i.id===r.issuanceId):r.userId===args[0];
    const count=shared.rows[table].filter(match).length;shared.rows[table]=shared.rows[table].filter(r=>!match(r));dirty=true;return {rows:[],rowCount:count};
   }
   throw new Error("Unexpected offline query");
  }};return db;};
 return {shared,connection,receipt,rows:()=>shared.rows};
}
test("eligibility starts immediately, uses a 30-day maximum, warns before deadline and does not delay overdue erasure",()=>{
 assert.equal(erasureDeadline(null,now).eligible,false);assert.equal(erasureDeadline(new Date(+now+1),now).eligible,false);
 assert.deepEqual(erasureDeadline(now,now),{eligible:true,approaching:false,overdue:false});
 assert.deepEqual(erasureDeadline(new Date(+now-28*86400000),now),{eligible:true,approaching:true,overdue:false});
 assert.equal(erasureDeadline(new Date(+now-30*86400000-1),now).overdue,true);assert.throws(()=>erasureDeadline(new Date(NaN),now));
});
test("dry-run writes nothing; execute deletes credentials, linked/orphan challenges and ciphertext in FK order, preserving unrelated and shared data",async()=>{
 const f=fixture(),before=structuredClone(f.rows()),db=f.connection();const dry=await runControlledErasure(db,f.receipt,"dry-run");assert.equal(dry.outcome,"dry_run");assert.equal(dry.wouldErase.Verification,2);assert.deepEqual(f.rows(),before);
 const result=await runControlledErasure(db,f.receipt,"execute");assert.equal(result.outcome,"erased");assert.deepEqual(result.counts,{User:1,Account:1,Session:1,Verification:2,TermsVersion:0,TermsAcceptance:1,EmailOutbox:1,EmailVerificationIssuance:1,AuthRateBucket:1});
 assert.equal(f.rows().User[0].id,"primary-existing-user");assert.deepEqual(f.rows().TermsVersion,before.TermsVersion);assert.equal(f.rows().TermsAcceptance[0].id,"other-acceptance");assert.equal(f.rows().AuthRateBucket.length,2);
 const again=await runControlledErasure(db,f.receipt,"execute");assert.equal(again.outcome,"noop");assert.ok(Object.values(again.counts).every(n=>n===0));
});
test("active counters, shared Terms and existing non-fixture deletion requests never enter the erasure scope",async()=>{
 const f=fixture();await runControlledErasure(f.connection(),f.receipt,"execute");assert.ok(f.rows().User[0].deletionRequestedAt);assert.equal(f.rows().User[0].id,"primary-existing-user");assert.ok(f.rows().AuthRateBucket.some(r=>r.keyDigest===plan.rateKeys[1]));assert.ok(f.rows().AuthRateBucket.some(r=>r.keyDigest==="unrelated-expired-counter"));
});
test("unreviewed real acceptances, external assets, future requests and ambiguous verification ownership fail closed",async()=>{
 for(const change of [f=>{f.rows().TermsVersion[0].isTestFixture=false;},f=>{f.rows().User[0].image="https://example.invalid/private-object";},f=>{f.rows().User[0].deletionRequestedAt=new Date(+now+1000);},f=>{f.rows().EmailVerificationIssuance[1].verificationId=plan.target+"-linked";}]){
  const f=fixture();change(f);const before=structuredClone(f.rows()),r=await runControlledErasure(f.connection(),f.receipt,"execute");assert.ok(["blocked","failed_rolled_back"].includes(r.outcome));assert.deepEqual(f.rows(),before);
 }
});
test("unsupported challenge formats block erasure rather than leaving attributable secrets behind",async()=>{
 const f=fixture(),db=f.connection(),before=structuredClone(f.rows());db.unmapped=true;const result=await runControlledErasure(db,f.receipt,"execute");assert.equal(result.outcome,"blocked");assert.equal(result.reason,"verification_mapping_review");assert.deepEqual(f.rows(),before);
});
test("missing user plus residual challenge cannot be misreported as completed erasure",async()=>{
 const f=fixture();f.rows().User=f.rows().User.filter(r=>r.id!==plan.target);const result=await runControlledErasure(f.connection(),f.receipt,"execute");assert.equal(result.outcome,"blocked");assert.equal(result.reason,"orphan_cleanup_review");assert.equal(f.rows().Verification.length,3);
});
test("each required-delete failure restores all data and reports no successful count; lost COMMIT acknowledgement remains uncertain",async()=>{
 for(const stage of ["EmailOutbox","TermsAcceptance","Session","Account","EmailVerificationIssuance","Verification","User","AuthRateBucket"]){const f=fixture(),before=structuredClone(f.rows()),db=f.connection();db.fault=stage;const result=await runControlledErasure(db,f.receipt,"execute");assert.equal(result.outcome,"failed_rolled_back");assert.ok(Object.values(result.counts).every(n=>n===0));assert.deepEqual(f.rows(),before);}
 const f=fixture(),db=f.connection();db.fault="commit";const unknown=await runControlledErasure(db,f.receipt,"execute");assert.equal(unknown.outcome,"unconfirmed");assert.equal(unknown.counts,null);assert.equal(f.rows().User.length,2);
});
test("DOUBLE: concurrent worker/job lock contention returns busy, then release permits an idempotent pass",async()=>{
 const f=fixture(),a=f.connection(),b=f.connection();let reached,release;const entered=new Promise(r=>reached=r),continueRun=new Promise(r=>release=r);a.beforeUserDelete=async()=>{reached();await continueRun;};
 const running=runControlledErasure(a,f.receipt,"execute");await entered;assert.equal((await runControlledErasure(b,f.receipt,"execute")).outcome,"busy");release();assert.equal((await running).outcome,"erased");assert.equal((await runControlledErasure(b,f.receipt,"execute")).outcome,"noop");
});
test("actual database/role/schema/history/FK drift is rejected before any erasure",async()=>{
 for(const patch of [{identity:{database:"stitchtrack_product_dev"}},{identity:{role:"stitchtrack_product_test_app"}},{identity:{safe:false}},{identity:{timezone:"Africa/Lagos"}},{extraTables:["FutureBusinessTable"]},{history:{checksum:"wrong"}},{fk:{confdeltype:"c"}}]){
  const f=fixture(),db=f.connection();Object.assign(db,patch);const before=structuredClone(f.rows()),result=await runControlledErasure(db,f.receipt,"execute");assert.equal(result.outcome,"failed_rolled_back");assert.deepEqual(f.rows(),before);assert.equal(db.events.some(s=>s.includes("erasure:delete:")),false);
 }
});
test("native errors and personal fields never appear in reported counts or logs",async t=>{
 const logs=[];for(const key of ["log","error","warn","info","debug"])t.mock.method(console,key,(...args)=>logs.push(args));const f=fixture(),db=f.connection();db.fault="Account";const r=await runControlledErasure(db,f.receipt,"execute");assert.doesNotMatch(JSON.stringify(r),/example.invalid|credential|payload|password|private SQL/);assert.deepEqual(logs,[]);
});
test("owner CLI/harness are inert on import, exact-test-only, require successful private setup receipt and reject unsafe commands",()=>{
 const directory=mkdtempSync(join(tmpdir(),"stitchtrack-erasure-"));chmodSync(directory,0o700);
 const receipt={format:1,run,created:true,retainedDigest:"0".repeat(64),baseline:Object.fromEntries(ERASURE_TABLES.map(t=>[t,{count:0,digest:"0".repeat(64)}]))},file=join(directory,"proof.json");writeFileSync(file,JSON.stringify(receipt),{mode:0o600});
 const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_ACCOUNT_ERASURE_ENABLED:"true",PRODUCT_ACCOUNT_ERASURE_CONFIRMED:"true",PRODUCT_ERASURE_PROOF_DIRECTORY:directory,
  PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
 try{
  assert.equal(authorizeErasure(["--owner-run","--dry-run"],env).mode,"dry-run");assert.equal(authorizeErasureProof(["--owner-setup"],env).target.mode,"test");
  for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_ACCOUNT_ERASURE_ENABLED:undefined},{PRODUCT_ACCOUNT_ERASURE_CONFIRMED:undefined},{PRODUCT_EMAIL_WORKER_ENABLED:"true"},{NODE_DEBUG:"pg"},{PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("_migrator:","_app:")}])assert.throws(()=>authorizeErasure(["--owner-run","--execute"],{...env,...patch}));
  assert.throws(()=>authorizeErasure(["--owner-run","--execute","--all-users"],env));receipt.created=false;writeFileSync(file,JSON.stringify(receipt));assert.throws(()=>readErasureReceipt(directory));
  const core=readFileSync(new URL("../../lib/product-auth/account-erasure.server.ts",import.meta.url),"utf8");assert.doesNotMatch(core,/TRUNCATE|DROP TABLE|DELETE FROM product\."TermsVersion"/);assert.match(core,/WHERE "id"=\$1 AND "deletionRequestedAt"=\$2/);
 }finally{rmSync(file);rmdirSync(directory);}
});

test("changed historical rows or baseline receipt block eligible erasure before any DELETE",async()=>{
 const changes=[
  f=>{f.rows().User.find(r=>r.id==="primary-existing-user").name="Changed historical name";},
  f=>{f.rows().Account.push({id:"unexpected-account",userId:"primary-existing-user"});},
  f=>{f.rows().Verification=f.rows().Verification.filter(r=>r.id!=="other-verification");},
  f=>{f.receipt.baseline.User.count++;},
  f=>{f.receipt.baseline.Account.digest="0".repeat(64);},
 ];
 for(const mode of ["dry-run","execute"])for(const change of changes){
  const f=fixture();change(f);const before=structuredClone(f.rows()),db=f.connection();
  const result=await runControlledErasure(db,f.receipt,mode);
  assert.equal(result.outcome,"blocked");assert.equal(result.reason,"proof_snapshot_mismatch");
  assert.ok(Object.values(result.counts).every(n=>n===0));assert.deepEqual(f.rows(),before);
  assert.equal(db.events.some(sql=>sql.includes("erasure:delete:")),false);
 }
});
test("changed retained fixture or shared data block otherwise eligible deletion",async()=>{
 for(const change of [
  f=>{f.rows().User.find(r=>r.id===plan.keep).name="Changed keep fixture";},
  f=>{f.rows().Account.find(r=>r.userId===plan.keep).password="Changed retained credential";},
  f=>{f.rows().TermsAcceptance.find(r=>r.userId===plan.keep).context="Changed context";},
  f=>{f.rows().TermsVersion.find(r=>r.id===plan.terms).isTestFixture=false;},
  f=>{f.rows().AuthRateBucket.find(r=>r.keyDigest===plan.rateKeys[1]).expiresAt=new Date(0);},
  f=>{f.rows().Session.push({id:"unexpected-keep-session",userId:plan.keep});},
  f=>{f.rows().EmailVerificationIssuance.push({id:"unexpected-keep-issuance",userId:plan.keep});},
 ]){
  const f=fixture();change(f);const before=structuredClone(f.rows()),db=f.connection();
  const result=await runControlledErasure(db,f.receipt,"execute");
  assert.equal(result.outcome,"blocked");assert.equal(result.reason,"proof_snapshot_mismatch");assert.deepEqual(f.rows(),before);
  assert.equal(db.events.some(sql=>sql.includes("erasure:delete:")),false);
 }
});
test("repeat execution checks the original receipt before reporting noop",async()=>{
 for(const change of [f=>{f.rows().User.find(r=>r.id===plan.keep).name="Changed";},f=>{f.rows().Account.find(r=>r.userId==="primary-existing-user").changed=true;}]){
  const f=fixture(),db=f.connection();assert.equal((await runControlledErasure(db,f.receipt,"execute")).outcome,"erased");change(f);
  const before=structuredClone(f.rows());db.events.length=0;
  assert.equal((await runControlledErasure(db,f.receipt,"execute")).outcome,"blocked");assert.deepEqual(f.rows(),before);
  assert.equal(db.events.some(sql=>sql.includes("erasure:delete:")),false);
 }
});
test("shared snapshot helpers run after table protection and before deletion within the transaction",async()=>{
 const f=fixture(),db=f.connection();assert.equal((await runControlledErasure(db,f.receipt,"execute")).outcome,"erased");
 const protect=db.events.findIndex(sql=>sql.includes("erasure:protect-snapshots"));
 const retained=db.events.findIndex(sql=>sql.includes("erasure:retained"));
 const deletion=db.events.findIndex(sql=>sql.includes("erasure:delete:"));
 assert.ok(protect>db.events.indexOf("BEGIN")&&retained>protect&&deletion>retained);
 assert.equal(db.events.filter(sql=>sql.includes("erasure:baseline:")).length,9);
 assert.match(db.events[protect],/IN SHARE ROW EXCLUSIVE MODE$/);assert.equal(db.events.at(-1),"COMMIT");
});
test("a bare run UUID or incomplete setup receipt cannot bypass the owner receipt workflow",async()=>{
 const f=fixture(),db=f.connection();
 for(const receipt of [run,null,{...f.receipt,created:false},{...f.receipt,retainedDigest:null}])await assert.rejects(runControlledErasure(db,receipt,"execute"));
 assert.deepEqual(db.events,[]);
 const cli=readFileSync(new URL("../../scripts/account-erasure.mjs",import.meta.url),"utf8");assert.match(cli,/runControlledErasure\(db,scope\.receipt,scope\.mode\)/);
 const harness=readFileSync(new URL("./account-erasure.integration.mjs",import.meta.url),"utf8");assert.match(harness,/erasureHistoricalSnapshot:snapshot,erasureRetainedDigest:retained/);
 assert.doesNotMatch(harness,/string_agg\(to_jsonb/);
});
