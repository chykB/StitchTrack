// Offline transaction/SQL doubles only. No PostgreSQL, CLI execution, SMTP or receipt access.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import "../../scripts/register-server-only.mjs";
import {authorizeAccountErasureExecute} from "../../scripts/account-erasure-execute.mjs";
import {authorizeAccountErasurePreflight} from "../../scripts/account-erasure-preflight.mjs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
const {runTestAccountErasureDryRun,runTestAccountErasureExecute,validateErasureTestAccountApproval,ERASURE_TABLES,EXPECTED_ERASURE_FKS,runCleanupTestAccountErasure,CLEANUP_DELETE_TABLES,CLEANUP_SELECT_COLUMNS,assertErasureDatabase,runControlledErasure}=await import("../../lib/product-auth/account-erasure.server.ts");
const time=Date.parse("2026-11-03T12:00:00.000Z"),id="disposable-test-account";
const approval={userId:id,expectedDeletionRequestedAt:new Date(time-86400000).toISOString(),disposableTestAccount:true};
const environment={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",
 PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_ENABLED:"true",PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_CONFIRMED:"true",PRODUCT_ERASURE_DISPOSABLE_TEST_ACCOUNT_CONFIRMED:"true",
 PRODUCT_ERASURE_TARGET_USER_ID:id,PRODUCT_ERASURE_EXPECTED_REQUESTED_AT:approval.expectedDeletionRequestedAt,
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
function fixture({execution=false,cleanup=false}={}){
 const state={now:time,requested:approval.expectedDeletionRequestedAt,missing:false,permission:true,busy:false,cross:false,fail:undefined,rollbackFail:false,
  identity:{},history:{},fks:undefined,extraTables:[],onLock:null,onTargetRead:null,commitUncertain:false,countMismatch:false,
  user:{id,emailCanonical:"private-synthetic@example.invalid",hasImage:false,emailVerified:true,isAdministrator:false},
  accounts:[{id:"credential",userId:id,accountId:id,providerId:"credential",hasPassword:true}],sessions:[],
  issues:[{id:"issue",userId:id,emailCanonical:"private-synthetic@example.invalid",verificationId:"linked",purpose:"email-verification"}],
  jobs:[{id:"mail",issuanceId:"issue",status:"sent",templateVersion:"tailor-verification-v1-development-deferred"}],terms:[],
  challenges:[{id:"linked",identifier:"email-verification-otp-private-synthetic@example.invalid"},{id:"orphan",identifier:"forget-password-otp-private-synthetic@example.invalid"}],
  unrelated:{user:"historical-control",session:"historical-session",rateBucket:"historical-security-counter"}};
 let transaction=false,worker=false,tableLock=false,userLock=false,prior,dirty=false,targetReads=0;const events=[],deniedDeletes=[];
 const dataKeys=["requested","missing","user","accounts","sessions","issues","jobs","terms","challenges","unrelated"];
 const snapshot=()=>Object.fromEntries(dataKeys.map(key=>[key,structuredClone(state[key])]));
 const db={async query(sql,args=[]){
  events.push({sql,args});const plain=sql.replace(/\/\*[\s\S]*?\*\//g,"").trim();
  assert.doesNotMatch(plain,execution?/^(UPDATE|INSERT|TRUNCATE|ALTER|CREATE|DROP)\b/i:/^(DELETE|UPDATE|INSERT|COMMIT|TRUNCATE|ALTER|CREATE|DROP)\b/i);
  const result=rows=>({rows,rowCount:rows.length});
  if(sql==="BEGIN"){assert.equal(transaction,false);transaction=true;prior=snapshot();dirty=false;return result([]);}
  if(sql==="ROLLBACK"){if(state.rollbackFail)throw new Error("private rollback diagnostic");if(dirty)Object.assign(state,prior);transaction=false;worker=false;tableLock=false;userLock=false;dirty=false;return result([]);}
  if(sql==="COMMIT"){
   assert.equal(transaction,true);transaction=false;worker=false;tableLock=false;userLock=false;dirty=false;
   if(state.commitUncertain)throw new Error("private lost COMMIT acknowledgement");return result([]);
  }
  assert.equal(transaction,true,"every inspection requires the same open transaction");
  // PostgreSQL checks DELETE privileges before matching rows, including empty tables.
  const deleteTable=/^DELETE FROM product\."(\w+)"/.exec(plain)?.[1];
  if(cleanup&&deleteTable&&!CLEANUP_DELETE_TABLES.includes(deleteTable)){
   deniedDeletes.push(deleteTable);throw Object.assign(new Error("Synthetic permission denial"),{code:"42501"});
  }
  if(state.fail&&sql.includes(state.fail))throw new Error("private credentials must not be reported");
  if(sql.startsWith("SET LOCAL"))return result([]);
  if(sql.includes("erasure:identity"))return result([{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",login:"stitchtrack_product_test_migrator",port:"5432",timezone:"UTC",safe:true,owns:!cleanup,...(cleanup?{role:"stitchtrack_product_test_cleanup",login:"stitchtrack_product_test_cleanup"}:{}),...state.identity}]);
  if(sql.includes("erasure:cleanup-identity")||sql.includes("erasure:cleanup-permissions"))return result([{allowed:state.permission}]);
   if(sql.includes("erasure:cleanup-shared-lock"))return result([]);
   if(sql.includes("erasure:cleanup-lock")){assert.equal(worker,true);tableLock=true;return result([]);}
   if(sql.includes("erasure:tables"))return result([...ERASURE_TABLES,"_prisma_migrations",...state.extraTables].map(name=>({name,owner:"stitchtrack_product_test_migrator",kind:"r"})));
  if(sql.includes("erasure:history"))return result(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum,finished_at:new Date(time),rolled_back_at:null,logs:null,applied_steps_count:1,...state.history})));
  if(sql.includes("erasure:fks"))return result((state.fks??EXPECTED_ERASURE_FKS).map(([conname,source,column,target,ref,confdeltype,confupdtype])=>({conname,source,target,columns:[column],referenced_columns:[ref],source_schema:"product",target_schema:"product",confdeltype,confupdtype})));
  if(sql.includes("preflight-permissions")){assert.deepEqual(args,[[...ERASURE_TABLES]]);return result([{allowed:state.permission}]);}
  if(sql.includes("preflight-lock")){worker=!state.busy;return result([{locked:worker}]);}
  if(sql.includes("erasure:protect-snapshots")){assert.equal(worker,true);tableLock=true;return result([]);}
  if(sql==="SAVEPOINT erasure_grace_check"||sql==="RELEASE SAVEPOINT erasure_grace_check")return result([]);
  if(sql.includes("erasure:grace-lock")){assert.equal(tableLock,true);assert.deepEqual(args,[id]);userLock=true;state.onLock?.();return result(state.missing?[]:[{id}]);}
  if(sql.includes("erasure:grace-check")){
   assert.equal(userLock,true);assert.match(sql,/clock_timestamp\(\)/);
   const stamp=state.requested===null?null:Date.parse(state.requested);
   const decision=stamp===null?"no_request":!Number.isFinite(stamp)?"invalid_request":stamp>state.now?"future_request":stamp<=state.now-86400000?"eligible":"grace_period";
   return result([{decision}]);
  }
  assert.equal(userLock,true);
  if(sql.includes("preflight-target")){assert.deepEqual(args,[id,args[1]]);state.onTargetRead?.(++targetReads);return result([{...state.user,requestMatches:state.requested===args[1]}]);}
  const tags={"preflight-accounts":"accounts","preflight-sessions":"sessions","preflight-issuances":"issues","preflight-outbox":"jobs","preflight-terms":"terms","preflight-challenges":"challenges"};
  for(const [tag,field]of Object.entries(tags))if(sql.includes(tag)){
   assert.match(sql,/LIMIT 1001/);if(!["jobs","challenges"].includes(field))assert.deepEqual(args,[id]);
   if(field==="jobs")assert.deepEqual(args,[state.issues.map(row=>row.id)]);
   if(field==="challenges")assert.deepEqual(args,[state.issues.filter(row=>row.verificationId!==null).map(row=>row.verificationId),["email-verification-otp-"+state.user.emailCanonical,"forget-password-otp-"+state.user.emailCanonical],state.user.emailCanonical,id]);
   let rows=state[field];
   if(field==="challenges")rows=rows.filter(row=>args[0].includes(row.id)||args[1].includes(row.identifier)||row.identifier.includes(args[2])||row.identifier.includes(args[3]));
   return result(structuredClone(rows));
  }
  if(sql.includes("preflight-cross-owner"))return result([{invalid:state.cross}]);
  if(sql.includes("erasure:execute-missing"))return result([{found:state.accounts.some(row=>row.userId===id)||state.sessions.some(row=>row.userId===id)||state.terms.some(row=>row.userId===id)||state.issues.some(row=>row.userId===id)||state.challenges.some(row=>row.identifier.includes(id))}]);
  const table=/erasure:delete:([A-Za-z]+)/.exec(sql)?.[1];
  if(table){
   assert.equal(execution,true);assert.equal(worker&&tableLock&&userLock,true);dirty=true;
   if(table==="User"){
    for(const field of ["accounts","sessions","issues","terms"])assert.equal(state[field].some(row=>row.userId===id),false);
    const affected=!state.missing&&state.user.id===args[0]&&state.requested===args[1]?1:0;state.missing=true;return {rows:[],rowCount:affected};
   }
   const field={EmailOutbox:"jobs",TermsAcceptance:"terms",Session:"sessions",Account:"accounts",EmailVerificationIssuance:"issues",Verification:"challenges"}[table];
   assert.ok(field);if(table==="EmailVerificationIssuance")assert.equal(state.jobs.some(row=>state.issues.some(issue=>issue.userId===id&&issue.id===row.issuanceId)),false);
   const matches=row=>table==="Verification"?args[0].includes(row.id):table==="EmailOutbox"?state.issues.some(issue=>issue.id===row.issuanceId&&issue.userId===args[0]):row.userId===args[0];
   const count=state[field].filter(matches).length;state[field]=state[field].filter(row=>!matches(row));
   return {rows:[],rowCount:state.countMismatch&&table==="Account"?count+1:count};
  }

  assert.fail("Unexpected SQL");
 }};
 return {state,db,events,deniedDeletes,active:()=>transaction};
}
test("default-off exact CLI authorization rejects alternate targets, wildcards, missing approval and execution mode before connecting",async()=>{
 assert.equal((await authorizeAccountErasurePreflight(["--owner-preflight","--dry-run"],environment)).approval.userId,id);
 for(const patch of [{PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_ENABLED:undefined},{PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_CONFIRMED:undefined},
  {PRODUCT_ERASURE_DISPOSABLE_TEST_ACCOUNT_CONFIRMED:undefined},{PRODUCT_DATABASE_MODE:"development"},{NODE_ENV:"production"},
  {PRODUCT_ERASURE_TARGET_USER_ID:"*"},{PRODUCT_ERASURE_TARGET_USER_ID:"%"},{PRODUCT_ERASURE_TARGET_USER_ID:"email@example.invalid"},
  {PRODUCT_ERASURE_EXPECTED_REQUESTED_AT:undefined},{PRODUCT_ERASURE_EXPECTED_REQUESTED_AT:"2026-02-30T00:00:00.000Z"},
  {PRODUCT_ERASURE_TARGET_USER_ID:"erasure-proof-old-target"},{PRODUCT_EMAIL_WORKER_ENABLED:"true"},{PGOPTIONS:"unsafe"},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:environment.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("_migrator:","_app:")}])
  await assert.rejects(authorizeAccountErasurePreflight(["--owner-preflight","--dry-run"],{...environment,...patch}));
 for(const args of [["--owner-preflight","--execute"],["--owner-preflight","--dry-run",id],[]])await assert.rejects(authorizeAccountErasurePreflight(args,environment));
 for(const value of [{...approval,userId:""},{...approval,userId:[id]},{...approval,disposableTestAccount:false},{...approval,email:"not-an-authority@example.invalid"}])assert.throws(()=>validateErasureTestAccountApproval(value));
 const f=fixture();assert.equal((await runTestAccountErasureDryRun(f.db,{...approval,disposableTestAccount:false})).status,"failed");assert.deepEqual(f.events,[]);
});
test("actual database, schema, role, migration, permissions and FK drift fail before target inspection",async()=>{
 for(const patch of [{identity:{database:"stitchtrack_product_dev"}},{identity:{role:"stitchtrack_product_test_app"}},{identity:{owns:false}},
  {history:{checksum:"wrong"}},{extraTables:["Business"]},{permission:false},{fks:[...EXPECTED_ERASURE_FKS,["unexpected","User","id","User","id","r","r"]]}]){
  const f=fixture();Object.assign(f.state,patch);const result=await runTestAccountErasureDryRun(f.db,approval);
  assert.equal(result.status,"failed");assert.equal(f.events.some(e=>e.sql.includes("grace-lock")),false);assert.equal(f.active(),false);
 }
});
test("eligible exact account dry-run counts attributable linked and orphaned records, retains counters/shared records and never mutates",async()=>{
 const f=fixture(),before=structuredClone(f.state);const result=await runTestAccountErasureDryRun(f.db,approval);
 assert.equal(result.status,"eligible");assert.deepEqual(result.wouldAffect,{User:1,Account:1,Session:0,Verification:2,TermsVersion:0,TermsAcceptance:0,EmailOutbox:1,EmailVerificationIssuance:1,AuthRateBucket:0});
 assert.deepEqual(result.rateBuckets,{action:"retain_all",attribution:"not_available"});assert.equal(result.pendingEmailCount,0);
 assert.deepEqual(f.state,before);assert.equal(f.events.at(-1).sql,"ROLLBACK");assert.equal(f.active(),false);
 const permission=f.events.findIndex(e=>e.sql.includes("preflight-permissions")),lock=f.events.findIndex(e=>e.sql.includes("preflight-lock")),tables=f.events.findIndex(e=>e.sql.includes("protect-snapshots")),user=f.events.findIndex(e=>e.sql.includes("grace-lock"));
 assert.ok(permission<lock&&lock<tables&&tables<user);
});
test("grace boundaries use the locked database request without restamping it",async()=>{
 for(const [age,status,reason]of [[-1,"grace_period","future_request"],[86399000,"grace_period","grace_period"],[86400000,"eligible","scoped_database_dry_run_only"],[86400001,"eligible","scoped_database_dry_run_only"]]){
  const f=fixture();f.state.requested=new Date(time-age).toISOString();const scope={...approval,expectedDeletionRequestedAt:f.state.requested};
  const before=f.state.requested,result=await runTestAccountErasureDryRun(f.db,scope);assert.equal(result.status,status);assert.equal(result.reason,reason);assert.equal(f.state.requested,before);
  if(status!=="eligible")assert.equal(result.wouldAffect,null);
 }
 const f=fixture();f.state.onLock=()=>{f.state.requested=new Date(time-1000).toISOString();};assert.equal((await runTestAccountErasureDryRun(f.db,approval)).reason,"request_timestamp_mismatch");
});
test("missing account and mismatched original timestamp cannot masquerade as eligible or already erased",async()=>{
 const f=fixture();f.state.missing=true;const missing=await runTestAccountErasureDryRun(f.db,approval);assert.equal(missing.status,"missing");assert.match(missing.reason,/not_proof_of_erasure/);
 const changed=fixture();changed.state.requested=new Date(time-172800000).toISOString();assert.equal((await runTestAccountErasureDryRun(changed.db,approval)).reason,"request_timestamp_mismatch");
 const absent=fixture();absent.state.requested=null;assert.equal((await runTestAccountErasureDryRun(absent.db,approval)).status,"blocked");
});
test("retention, external image, administrator, credential and ambiguous challenge relationships block",async()=>{
 const changes=[
  [f=>f.state.terms.push({id:"acceptance",userId:id,termsVersionId:"shared-terms",versionId:"shared-terms"}),"acceptance_retention_review"],
  [f=>f.state.user.hasImage=true,"external_image_review"],[f=>f.state.user.isAdministrator=true,"administrator_review"],
  [f=>f.state.accounts[0].hasPassword=false,"credential_eligibility"],[f=>f.state.accounts[0].accountId="other","credential_eligibility"],
  [f=>f.state.issues[0].emailCanonical="other@example.invalid","relationship_or_challenge_attribution"],
  [f=>f.state.issues[0].purpose="unsupported","relationship_or_challenge_attribution"],
  [f=>f.state.challenges[0].identifier="unexpected-format-private-synthetic@example.invalid","relationship_or_challenge_attribution"],
  [f=>f.state.challenges=f.state.challenges.filter(row=>row.id!=="linked"),"relationship_or_challenge_attribution"],
  [f=>f.state.cross=true,"relationship_or_challenge_attribution"],[f=>f.state.jobs[0].issuanceId="other","relationship_or_challenge_attribution"],
  [f=>f.state.jobs[0].templateVersion="unknown","relationship_or_challenge_attribution"],
 ];
 for(const [change,reason]of changes){const f=fixture();change(f);const before=structuredClone(f.state);const result=await runTestAccountErasureDryRun(f.db,approval);
  assert.equal(result.status,"blocked",reason);assert.equal(result.reason,reason);assert.equal(result.wouldAffect,null);assert.deepEqual(f.state,before);assert.equal(f.active(),false);
 }
});
test("bounded reads, busy worker, failed query and rollback failure refuse without committed effects",async()=>{
 const busy=fixture();busy.state.busy=true;assert.equal((await runTestAccountErasureDryRun(busy.db,approval)).reason,"worker_or_erasure_busy");assert.equal(busy.events.some(e=>e.sql.includes("grace-lock")),false);
 const large=fixture();large.state.accounts=Array.from({length:1001},(_,i)=>({id:"row-"+i,userId:id}));assert.equal((await runTestAccountErasureDryRun(large.db,approval)).status,"failed");
 const failed=fixture();failed.state.fail="preflight-outbox";assert.equal((await runTestAccountErasureDryRun(failed.db,approval)).status,"failed");assert.equal(failed.active(),false);
 const rollback=fixture();rollback.state.rollbackFail=true;assert.equal((await runTestAccountErasureDryRun(rollback.db,approval)).reason,"rollback_unconfirmed");
});
test("reported output and failures contain no private identity, secret material or raw diagnostics",async t=>{
 const logs=[];for(const name of ["log","warn","error","info"])t.mock.method(console,name,(...args)=>logs.push(args));
 for(const mode of ["eligible","blocked","failed"]){const f=fixture();if(mode==="blocked")f.state.user.hasImage=true;if(mode==="failed")f.state.fail="preflight-outbox";
  const output=JSON.stringify(await runTestAccountErasureDryRun(f.db,approval));assert.doesNotMatch(output,/example.invalid|disposable-test-account|password|ciphertext|private credentials|2026-/);
 }assert.deepEqual(logs,[]);
 const cli=readFileSync(new URL("../../scripts/account-erasure-preflight.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(cli,/readErasureReceipt|runControlledErasure|proof.json|--execute|\.listen\(/);
 assert.match(cli,/withErasureConnection/);
});

test("execution requires independent opt-ins and exact approval; production and wrong timestamp cannot delete",async()=>{
 const enabled={...environment,PRODUCT_ACCOUNT_ERASURE_EXECUTION_ENABLED:"true",PRODUCT_ACCOUNT_ERASURE_EXECUTION_CONFIRMED:"true"};
 assert.equal((await authorizeAccountErasureExecute(["--owner-execute","--execute"],enabled)).approval.userId,id);
 for(const patch of [{PRODUCT_ACCOUNT_ERASURE_EXECUTION_ENABLED:undefined},{PRODUCT_ACCOUNT_ERASURE_EXECUTION_CONFIRMED:undefined},
  {PRODUCT_ERASURE_DISPOSABLE_TEST_ACCOUNT_CONFIRMED:undefined},{PRODUCT_ERASURE_TARGET_USER_ID:"*"},{PRODUCT_DATABASE_MODE:"development"},{NODE_ENV:"production"}])
  await assert.rejects(authorizeAccountErasureExecute(["--owner-execute","--execute"],{...enabled,...patch}));
 await assert.rejects(authorizeAccountErasureExecute(["--owner-execute","--execute","--all"],enabled));
 const f=fixture({execution:true});assert.equal((await runTestAccountErasureExecute(f.db,approval,false)).outcome,"blocked");assert.deepEqual(f.events,[]);
 assert.equal((await runTestAccountErasureExecute(f.db,{...approval,disposableTestAccount:false},true)).outcome,"blocked");assert.deepEqual(f.events,[]);
 const old=process.env.NODE_ENV;process.env.NODE_ENV="production";try{assert.equal((await runTestAccountErasureExecute(f.db,approval,true)).outcome,"blocked");}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
 f.state.requested=new Date(time-172800000).toISOString();assert.equal((await runTestAccountErasureExecute(f.db,approval,true)).reason,"request_timestamp_mismatch");assert.equal(f.events.some(e=>e.sql.includes("erasure:delete:")),false);
});
test("dry-run and execute share the grace boundary, including exactly 24 hours",async()=>{
 for(const age of [-1,86399000,86400000,86400001]){
  const f=fixture({execution:true});f.state.requested=new Date(time-age).toISOString();const approved={...approval,expectedDeletionRequestedAt:f.state.requested};
  const dry=await runTestAccountErasureDryRun(f.db,approved);const result=await runTestAccountErasureExecute(f.db,approved,true);
  assert.equal(dry.status,age<86400000?"grace_period":"eligible");assert.equal(result.outcome,age<86400000?"blocked":"erased");
  if(age<86400000)assert.equal(f.events.some(e=>e.sql.includes("erasure:delete:")),false);else assert.deepEqual(result.counts,dry.wouldAffect);
 }
});
test("shared plan deletes residual sessions, pending ciphertext jobs, identity and exact challenges in FK order, preserving unrelated data",async()=>{
 const f=fixture({execution:true});f.state.sessions.push({id:"residual-session",userId:id});f.state.jobs[0].status="pending";
 f.state.challenges.push({id:"unrelated-challenge",identifier:"other@example.invalid"});const unrelated=structuredClone(f.state.unrelated),requested=f.state.requested;
 const dry=await runTestAccountErasureDryRun(f.db,approval);assert.equal(dry.status,"eligible");assert.equal(dry.wouldAffect.Session,1);assert.equal(dry.pendingEmailCount,1);
 const result=await runTestAccountErasureExecute(f.db,approval,true);assert.equal(result.outcome,"erased");assert.deepEqual(result.counts,dry.wouldAffect);
 assert.equal(result.counts.TermsVersion,0);assert.equal(result.counts.AuthRateBucket,0);assert.deepEqual(f.state.unrelated,unrelated);assert.equal(f.state.requested,requested);
 assert.deepEqual(f.state.challenges,[{id:"unrelated-challenge",identifier:"other@example.invalid"}]);
 assert.deepEqual(f.events.filter(e=>e.sql.includes("erasure:delete:")).map(e=>/erasure:delete:(\w+)/.exec(e.sql)[1]),["EmailOutbox","TermsAcceptance","Session","Account","EmailVerificationIssuance","Verification","User"]);
 const again=await runTestAccountErasureExecute(f.db,approval,true);assert.equal(again.outcome,"noop");assert.ok(Object.values(again.counts).every(n=>n===0));assert.match(again.reason,/not_proof_of_prior_erasure/);
});
test("execution preserves blockers and refuses changed counts/attribution on immediate pre-delete recheck",async()=>{
 for(const change of [f=>f.state.user.hasImage=true,f=>f.state.user.isAdministrator=true,f=>f.state.cross=true,
  f=>f.state.terms.push({id:"acceptance",userId:id,termsVersionId:"shared",versionId:"shared"}),f=>f.state.issues[0].emailCanonical="changed@example.invalid"]){
  const f=fixture({execution:true});change(f);const before=structuredClone(f.state);const result=await runTestAccountErasureExecute(f.db,approval,true);
  assert.equal(result.outcome,"blocked");assert.deepEqual(f.state,before);assert.equal(f.events.some(e=>e.sql.includes("erasure:delete:")),false);
 }
 const changed=fixture({execution:true});changed.state.onTargetRead=count=>{if(count===2)changed.state.sessions.push({id:"changed-residual",userId:id});};
 assert.equal((await runTestAccountErasureExecute(changed.db,approval,true)).reason,"predelete_recheck_changed");assert.equal(changed.events.some(e=>e.sql.includes("erasure:delete:")),false);
});
test("each required DELETE or count mismatch rolls back the whole account without partial erasure",async()=>{
 for(const table of ["EmailOutbox","TermsAcceptance","Session","Account","EmailVerificationIssuance","Verification","User"]){
  const f=fixture({execution:true});f.state.fail="erasure:delete:"+table;const before=structuredClone(f.state);
  const result=await runTestAccountErasureExecute(f.db,approval,true);assert.equal(result.outcome,"failed_rolled_back",table);assert.ok(Object.values(result.counts).every(n=>n===0));assert.deepEqual(f.state,before);assert.equal(f.active(),false);
 }
 const f=fixture({execution:true});f.state.countMismatch=true;const before=structuredClone(f.state);assert.equal((await runTestAccountErasureExecute(f.db,approval,true)).outcome,"failed_rolled_back");assert.deepEqual(f.state,before);
});
test("lost COMMIT acknowledgement stays unconfirmed with null counts and is never retried automatically",async()=>{
 const f=fixture({execution:true});f.state.commitUncertain=true;
 const result=await runTestAccountErasureExecute(f.db,approval,true);assert.equal(result.outcome,"unconfirmed");assert.equal(result.counts,null);assert.equal(f.state.missing,true);
 assert.equal(f.events.filter(e=>e.sql==="COMMIT").length,1);assert.equal(f.events.filter(e=>e.sql.includes("erasure:delete:User")).length,1);
});
test("missing account with attributable residual state is blocked rather than falsely completed",async()=>{
 const f=fixture({execution:true});f.state.missing=true;const result=await runTestAccountErasureExecute(f.db,approval,true);assert.equal(result.outcome,"blocked");assert.equal(result.reason,"residual_attribution_review");
 assert.equal(f.events.some(e=>e.sql.includes("erasure:delete:")),false);
});

test("execute CLI is disabled before connection and only serializes fixed lifecycle output",()=>{
 const script=new URL("../../scripts/account-erasure-execute.mjs",import.meta.url);
 const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",script.pathname,"--owner-execute","--execute"],{env:{PATH:process.env.PATH,NODE_ENV:"test"},encoding:"utf8",timeout:5000});
 assert.equal(child.status,1);assert.equal(child.stdout,"");
 const refused=JSON.parse(child.stderr.trim());assert.equal(refused.outcome,"blocked");assert.equal(refused.phase,"refused");assert.equal(refused.counts,null);
 const source=readFileSync(script,"utf8");assert.match(source,/phase:"start"/);assert.match(source,/phase:"finish"/);
 assert.doesNotMatch(source,/JSON.stringify\((?:scope|error)|console\.(?:log|error)\((?:scope|error)|setInterval|readErasureReceipt|proof.json/);
});
test("execution reports only committed counts or uncertainty without identity/secret disclosure",async t=>{
 const logs=[];for(const name of ["log","warn","error","info"])t.mock.method(console,name,(...args)=>logs.push(args));
 for(const mode of ["erased","blocked","failed_rolled_back","unconfirmed"]){
  const f=fixture({execution:true});if(mode==="blocked")f.state.user.isAdministrator=true;if(mode==="failed_rolled_back")f.state.fail="erasure:delete:User";if(mode==="unconfirmed")f.state.commitUncertain=true;
  const result=await runTestAccountErasureExecute(f.db,approval,true);assert.equal(result.outcome,mode);assert.doesNotMatch(JSON.stringify(result),/example.invalid|disposable-test-account|ciphertext|2026-|private|credential/);
 }assert.deepEqual(logs,[]);
});

const cleanupEnvironment={...environment,PRODUCT_CLEANUP_CONFIRMED:"true",
 PRODUCT_TEST_CLEANUP_DATABASE_URL:"postgresql://stitchtrack_product_test_cleanup:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
async function withCleanupEnvironment(operation){
 const old=process.env.NODE_ENV;process.env.NODE_ENV="test";
 try{return await operation();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
}
test("cleanup connection is distinct, test-only, owner-confirmed and has no migrator/runtime fallback",async()=>{
 const {productCleanupConfig}=await import("../../prisma/product/targets.ts");
 assert.equal(productCleanupConfig(cleanupEnvironment).user,"stitchtrack_product_test_cleanup");
 for(const patch of [{NODE_ENV:"development"},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},
  {PRODUCT_CLEANUP_CONFIRMED:undefined},{PRODUCT_DATABASE_CONFIRMED:undefined},{PRODUCT_TEST_CLEANUP_DATABASE_URL:undefined},
  {PGOPTIONS:"-c timezone=UTC"},...[
   ["127.0.0.1","localhost"],[":5432/",":5433/"],["_cleanup:","_app:"],["_cleanup:","_migrator:"],
   ["/stitchtrack_product_test?","/stitchtrack_product_dev?"],["schema=product","schema=public"],
  ].map(([a,b])=>({PRODUCT_TEST_CLEANUP_DATABASE_URL:cleanupEnvironment.PRODUCT_TEST_CLEANUP_DATABASE_URL.replace(a,b)}))])
  assert.throws(()=>productCleanupConfig({...cleanupEnvironment,...patch}));
 const scope=await authorizeAccountErasurePreflight(["--owner-preflight","--dry-run","--cleanup-role"],cleanupEnvironment);
 assert.equal(scope.cleanup,true);assert.equal(scope.approval.userId,id);
 const {erasureEnvironment}=await import("../../scripts/account-erasure.mjs");
 assert.throws(()=>erasureEnvironment({...cleanupEnvironment,PRODUCT_ACCOUNT_ERASURE_ENABLED:"true",PRODUCT_ACCOUNT_ERASURE_CONFIRMED:"true",
  PRODUCT_TEST_MIGRATION_DATABASE_URL:cleanupEnvironment.PRODUCT_TEST_CLEANUP_DATABASE_URL}));
 const enabled={...cleanupEnvironment,PRODUCT_ACCOUNT_ERASURE_EXECUTION_ENABLED:"true",PRODUCT_ACCOUNT_ERASURE_EXECUTION_CONFIRMED:"true"};
 assert.equal((await authorizeAccountErasureExecute(["--owner-execute","--execute","--cleanup-role"],enabled)).target.user,"stitchtrack_product_test_cleanup");
 for(const patch of [{PRODUCT_ERASURE_TARGET_USER_ID:"*"},{PRODUCT_ERASURE_EXPECTED_REQUESTED_AT:undefined},
  {PRODUCT_ERASURE_DISPOSABLE_TEST_ACCOUNT_CONFIRMED:undefined},{PRODUCT_ACCOUNT_ERASURE_EXECUTION_CONFIRMED:undefined}])
  await assert.rejects(authorizeAccountErasureExecute(["--owner-execute","--execute","--cleanup-role"],{...enabled,...patch}));
 await assert.rejects(authorizeAccountErasurePreflight(["--owner-preflight","--dry-run","--other-role"],cleanupEnvironment));
});
test("cleanup live identity and least-privilege checks refuse before target inspection",async()=>withCleanupEnvironment(async()=>{
 for(const patch of [{identity:{database:"stitchtrack_product_dev"}},{identity:{role:"stitchtrack_product_test_migrator"}},
  {identity:{login:"stitchtrack_product_test_app"}},{identity:{owns:true}},{identity:{safe:false}},
  {identity:{timezone:"Africa/Lagos"}},{permission:false},{history:{checksum:"wrong"}}]){
  const f=fixture({cleanup:true});Object.assign(f.state,patch);
  const result=await runCleanupTestAccountErasure(f.db,approval,"dry-run",true);
  assert.equal(result.status,"failed");assert.equal(f.events.some(e=>e.sql.includes("grace-lock")),false);
 }
}));
test("cleanup reuses exact grace/ownership/retention checks and excludes shared tables from write locks",async()=>withCleanupEnvironment(async()=>{
 const f=fixture({cleanup:true,execution:true});const dry=await runCleanupTestAccountErasure(f.db,approval,"dry-run",true);
 assert.equal(dry.status,"eligible");
 const lock=f.events.find(e=>e.sql.includes("erasure:cleanup-lock"));
 assert.deepEqual([...lock.sql.matchAll(/product\."(\w+)"/g)].map(m=>m[1]),[...CLEANUP_DELETE_TABLES]);
 assert.equal(f.events.some(e=>e.sql.includes("protect-snapshots")),false);
 const permissions=f.events.find(e=>e.sql.includes("cleanup-permissions"));
 assert.deepEqual(permissions.args,[[...CLEANUP_DELETE_TABLES],JSON.stringify(CLEANUP_SELECT_COLUMNS)]);
 assert.match(permissions.sql,/a.attname='updatedAt'/);
 const result=await runCleanupTestAccountErasure(f.db,approval,"execute",true);assert.equal(result.outcome,"erased");
 assert.deepEqual(result.counts,dry.wouldAffect);assert.equal(f.events.some(e=>e.sql.includes("erasure:delete:TermsAcceptance")),false);
 assert.equal(result.counts.AuthRateBucket,0);assert.equal(result.counts.TermsVersion,0);
 assert.equal((await runCleanupTestAccountErasure(f.db,approval,"execute",true)).outcome,"noop");
 for(const [mutate,reason]of [[s=>s.requested=new Date(time-1000).toISOString(),"request_timestamp_mismatch"],
  [s=>s.terms.push({id:"retained",userId:id,termsVersionId:"shared",versionId:"shared"}),"acceptance_retention_review"],
  [s=>s.cross=true,"relationship_or_challenge_attribution"]]){
  const other=fixture({cleanup:true,execution:true});mutate(other.state);
  const refused=await runCleanupTestAccountErasure(other.db,approval,"execute",true);assert.equal(refused.reason,reason);
  assert.equal(other.events.some(e=>e.sql.includes("erasure:delete:")),false);
 }
 const young=fixture({cleanup:true,execution:true});young.state.requested=new Date(time-86399000).toISOString();
 assert.equal((await runCleanupTestAccountErasure(young.db,{...approval,expectedDeletionRequestedAt:young.state.requested},"execute",true)).outcome,"blocked");
}));
test("cleanup does not authorize historical/default APIs and never bypasses owner confirmation",async()=>withCleanupEnvironment(async()=>{
 const f=fixture({cleanup:true,execution:true});
 await f.db.query("BEGIN");await assert.rejects(assertErasureDatabase(f.db));await f.db.query("ROLLBACK");
 const historical=await runControlledErasure(f.db,{format:1,created:true,run:"01234567-89ab-4cde-8abc-0123456789ab",retainedDigest:"a".repeat(64),baseline:{}},"execute");
 assert.equal(historical.outcome,"failed_rolled_back");assert.equal(f.events.some(e=>e.sql.includes("protect-snapshots")||e.sql.includes("erasure:delete:")),false);
 assert.equal((await runTestAccountErasureExecute(f.db,approval,true)).outcome,"failed_rolled_back");
 const untouched=fixture({cleanup:true,execution:true});
 assert.equal((await runCleanupTestAccountErasure(untouched.db,approval,"execute",false)).outcome,"blocked");assert.deepEqual(untouched.events,[]);
 assert.equal((await runCleanupTestAccountErasure(untouched.db,{...approval,userId:"erasure-proof-old-target"},"execute",true)).outcome,"blocked");assert.deepEqual(untouched.events,[]);
 for(const nodeEnv of ["development","production"]){process.env.NODE_ENV=nodeEnv;
  assert.equal((await runCleanupTestAccountErasure(untouched.db,approval,"execute",true)).outcome,"blocked");assert.deepEqual(untouched.events,[]);}
}));
test("cleanup rollback, uncertain commit and logging preserve the existing failure contract",async()=>withCleanupEnvironment(async()=>{
 for(const [patch,outcome]of [[{fail:"erasure:delete:User"},"failed_rolled_back"],[{commitUncertain:true},"unconfirmed"]]){
  const f=fixture({cleanup:true,execution:true});Object.assign(f.state,patch);const before=structuredClone(f.state.unrelated);
  const result=await runCleanupTestAccountErasure(f.db,approval,"execute",true);assert.equal(result.outcome,outcome);
  assert.deepEqual(f.state.unrelated,before);if(outcome==="unconfirmed")assert.equal(result.counts,null);else assert.equal(f.state.missing,false);
  assert.doesNotMatch(JSON.stringify(result),/example.invalid|synthetic-only|disposable-test-account|2026-/);
 }
}));

test("permission proposal and live guard agree on exact columns, deletes and unchanged migration hashes",()=>{
 const sql=readFileSync(new URL("../../prisma/product/setup/account-erasure-cleanup-permissions.sql",import.meta.url),"utf8");
 const grants=[...sql.matchAll(/GRANT SELECT \(([^)]+)\) ON product\."([^"\n]+)" TO stitchtrack_product_test_cleanup;/g)];
 assert.deepEqual(Object.fromEntries(grants.map(m=>[m[2],[...m[1].matchAll(/"([^"\n]+)"/g)].map(c=>c[1])])),
  Object.fromEntries(Object.entries(CLEANUP_SELECT_COLUMNS).filter(([,columns])=>columns.length)));
 const deletion=/GRANT DELETE ON ([^;]+) TO stitchtrack_product_test_cleanup;/.exec(sql);
 assert.deepEqual([...deletion[1].matchAll(/product\."(\w+)"/g)].map(m=>m[1]),[...CLEANUP_DELETE_TABLES]);
 assert.deepEqual([...sql.matchAll(/GRANT UPDATE ([^;]+);/g)].map(m=>m[1]),['("updatedAt") ON product."User" TO stitchtrack_product_test_cleanup']);
 assert.doesNotMatch(sql,/CREATE ROLE|GRANT ALL|GRANT INSERT|ALTER DEFAULT|TO PUBLIC/);
 assert.match(sql,/session_user<>current_user/);assert.match(sql,/pg_auth_members/);
 // Historical permission proposal remains pinned to its original five migrations.
 for(const [name,checksum]of Object.entries(PRODUCT_MIGRATIONS))if(name<="20261102_user_administrator"){assert.ok(sql.includes(name));assert.ok(sql.includes(checksum));}
 const map=JSON.parse(/'({"User":.+})'::jsonb/.exec(sql)[1]);assert.deepEqual(map,JSON.parse(JSON.stringify(CLEANUP_SELECT_COLUMNS)));
});

test("restricted cleanup refuses unauthorized DELETE even with zero matches, and never issues it during erasure",async()=>withCleanupEnvironment(async()=>{
 const empty=fixture({execution:true,cleanup:true});assert.deepEqual(empty.state.terms,[]);
 await empty.db.query("BEGIN");
 for(const table of ["TermsAcceptance","TermsVersion","AuthRateBucket","_prisma_migrations"])
  await assert.rejects(empty.db.query('DELETE FROM product."'+table+'" WHERE false'),{code:"42501"});
 await empty.db.query("ROLLBACK");
 const f=fixture({execution:true,cleanup:true}),unrelated=structuredClone(f.state.unrelated);
 const result=await runCleanupTestAccountErasure(f.db,approval,"execute",true);
 assert.equal(result.outcome,"erased");assert.equal(result.counts.TermsAcceptance,0);assert.deepEqual(f.deniedDeletes,[]);
 assert.deepEqual(f.state.unrelated,unrelated);
 const deletes=f.events.filter(e=>/^DELETE /.test(e.sql.replace(/\/\*[\s\S]*?\*\//g,"").trim()));
 assert.deepEqual(deletes.map(e=>/DELETE FROM product\."(\w+)"/.exec(e.sql)[1]),
  ["EmailOutbox","Session","Account","EmailVerificationIssuance","Verification","User"]);
 // A regression that attempted the forbidden statement would fail and roll back.
 const failed=fixture({execution:true,cleanup:true}),before=structuredClone(failed.state);
 const db={query:async(sql,args)=>{
  if(sql.includes("erasure:delete:EmailOutbox"))await failed.db.query('DELETE FROM product."TermsAcceptance" WHERE "userId"=$1',[id]);
  return failed.db.query(sql,args);
 }};
 const refused=await runCleanupTestAccountErasure(db,approval,"execute",true);
 assert.equal(refused.outcome,"failed_rolled_back");assert.ok(Object.values(refused.counts).every(count=>count===0));
 assert.deepEqual(failed.deniedDeletes,["TermsAcceptance"]);assert.deepEqual(failed.state,before);assert.equal(failed.active(),false);
}));
test("acceptance discovered on initial inspection or immediate recheck blocks restricted cleanup before any DELETE",async()=>withCleanupEnvironment(async()=>{
 for(const appearance of [1,2]){
  const f=fixture({execution:true,cleanup:true});
  f.state.onTargetRead=count=>{if(count===appearance)f.state.terms.push({id:"must-retain",userId:id,termsVersionId:"shared",versionId:"shared"});};
  const result=await runCleanupTestAccountErasure(f.db,approval,"execute",true);
  assert.equal(result.outcome,"blocked");assert.equal(f.events.some(e=>e.sql.includes("erasure:delete:")),false);
  assert.deepEqual(f.deniedDeletes,[]);assert.equal(f.state.missing,false);
 }
}));
