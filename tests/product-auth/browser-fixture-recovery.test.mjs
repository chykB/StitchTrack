// Offline only. No private manifests, real PostgreSQL connections or fixture operations.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {LOST_RATE_KEY_RUN,authorizeBrowserFixture,lostKeyFixturePlan,inspectLostKeyState,lostKeyRecoveryTransaction,
 browserFixturePlan,validateManifest,setupReceipt,BROWSER_FIXTURE_TABLES,BROWSER_FIXTURE_FORMAT} from "./browser-fixture.mjs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
const run=LOST_RATE_KEY_RUN,plan=lostKeyFixturePlan(run),sha=v=>createHash("sha256").update(v).digest("hex");
const time="2026-11-01T10:00:00.000Z",digest="a".repeat(64);
const empty=()=>({count:0,digest:sha("[]")});
function data() {
 const baseline=Object.fromEntries(BROWSER_FIXTURE_TABLES.map(t=>[t,empty()]));
 baseline.User={count:10,digest:sha(JSON.stringify(Array(10).fill({h:"historical-user"})))};
 baseline.Account={count:10,digest:sha(JSON.stringify(Array(10).fill({h:"historical-account"})))};
 const m={format:BROWSER_FIXTURE_FORMAT,run,createdAt:time,passwordDigest:digest,rateKeyDigest:sha(Buffer.alloc(32,3)),baseline};
 const users=[{id:plan.id,name:plan.name,emailCanonical:plan.email,emailVerified:true,disabledAt:null,deletionRequestedAt:null,image:null,createdAt:time,updatedAt:time}];
 const accounts=[{id:plan.credentialId,userId:plan.id,accountId:plan.id,providerId:"credential",passwordDigest:digest,createdAt:time,updatedAt:time,
  accessToken:null,refreshToken:null,idToken:null,accessTokenExpiresAt:null,refreshTokenExpiresAt:null,scope:null}];
 const sessions=[{id:"synthetic-session",userId:plan.id,token:"hmac-sha256:v1:"+"b".repeat(64),createdAt:time,updatedAt:time,expiresAt:"2026-11-08T10:00:00.000Z",ipAddress:null,userAgent:null}];
 return {m,setup:setupReceipt(m),users,accounts,sessions,bucketHashes:[],extraAccount:false,links:false,busy:false,badHistory:false,badBaseline:false,locked:true};
}
function database(state=data()) {
 const calls=[];let snapshot;
 const db={query:async(sql,args=[])=>{
  calls.push({sql,args});const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
  if(sql.startsWith("BEGIN")){snapshot=structuredClone(state);return result();}
  if(sql==="ROLLBACK"){if(snapshot)Object.assign(state,structuredClone(snapshot));return result();}
  if(sql==="COMMIT"||sql.startsWith("SET ")||sql.startsWith("LOCK TABLE"))return result();
  if(sql.includes("pg_try_advisory_xact_lock"))return result([{yes:state.locked}]);
  if(sql.includes("FROM pg_stat_activity"))return state.busy?result([{}]):result();
  if(sql.includes("SELECT c.relname,pg_get_userbyid"))return result([...BROWSER_FIXTURE_TABLES,"_prisma_migrations"].map(relname=>({relname,owned:true})));
  if(sql.includes("SELECT 1 FROM pg_namespace"))return result([{}]);
  if(sql.includes("n.nspname<>'product'"))return result();
  if(sql.includes("SELECT migration_name,checksum"))return result(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum:state.badHistory?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1})));
  if(sql.includes(" AS h FROM product.")){
   const table=/FROM product\."([A-Za-z]+)"/u.exec(sql)[1];
   if(table==="AuthRateBucket"){assert.deepEqual(args,[[]]);return result(state.bucketHashes.map(h=>({h})));}
   if(table==="User")return result(Array(10).fill({h:state.badBaseline?"changed-user":"historical-user"}));
   if(table==="Account")return result(Array(10).fill({h:"historical-account"}));
   return result();
  }
  if(sql.startsWith('SELECT * FROM product."User"'))return result(structuredClone(state.users));
  if(sql.includes('AS "passwordDigest"'))return result(structuredClone(state.extraAccount?[...state.accounts,{...state.accounts[0],id:"unexpected"}]:state.accounts));
  if(sql.startsWith('SELECT id,"userId",token'))return result(structuredClone(state.sessions));
  if(sql.startsWith('SELECT "keyDigest",capacity')){assert.deepEqual(args,[[]]);return result();}
  if(sql.startsWith('SELECT 1 FROM product."TermsAcceptance"')||sql.startsWith('SELECT 1 FROM product."EmailVerificationIssuance"'))return result(state.links?[{}]:[]);
  if(sql.startsWith('SELECT 1 FROM product."User"'))return result(state.users.map(()=>({})));
  if(sql.startsWith('SELECT 1 FROM product."Account"'))return result(state.accounts.map(()=>({})));
  if(sql.startsWith('SELECT 1 FROM product."Session"'))return result(state.sessions.map(()=>({})));
  if(sql.startsWith('SELECT 1 FROM product."AuthRateBucket"')){assert.deepEqual(args,[[]]);return result();}
  if(sql.startsWith('DELETE FROM product."Session"')){assert.deepEqual(args,[plan.id]);const n=state.sessions.length;state.sessions=[];return result([],n);}
  if(sql.startsWith('DELETE FROM product."Account"')){assert.deepEqual(args,[plan.credentialId,plan.id,"credential"]);const n=state.accounts.length;state.accounts=[];return result([],n);}
  if(sql.startsWith('DELETE FROM product."User"')){assert.deepEqual(args,[plan.id,plan.email]);const n=state.users.length;state.users=[];return result([],n);}
  throw new Error("Unexpected offline SQL shape");
 }};return {db,state,calls};
}
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",
 PRODUCT_BROWSER_GATEWAY_STOPPED:"true",PRODUCT_BROWSER_CLIENT_CLOSED:"true",PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED:"true",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
test("recovery is exact-run/test-migrator only, mutually exclusive, and refuses even a valid replacement rate key",()=>{
 assert.equal(authorizeBrowserFixture(["--owner-lost-key-inspect",run],env).mode,"inspect");
 for(const patch of [{PRODUCT_LOCAL_RATE_IDENTIFIER_KEY:Buffer.alloc(32,9).toString("base64")},{PRODUCT_DATABASE_MODE:"development"},{NODE_ENV:"production"},
  {PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED:undefined},{PRODUCT_BROWSER_LOST_KEY_CLEANUP_CONFIRMED:"true"},{PRODUCT_BROWSER_SETUP_CONFIRMED:"true"},{PRODUCT_BROWSER_CLEANUP_CONFIRMED:"true"},
  {PRODUCT_BROWSER_GATEWAY_STOPPED:undefined},{PRODUCT_BROWSER_CLIENT_CLOSED:undefined},{ENABLE_PRODUCT_SESSION_HTTP:"true"},{ENABLE_PRODUCT_REGISTRATION_HTTP:"true"},{PRODUCT_EMAIL_WORKER_ENABLED:"true"},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("test_migrator:","test_app:")}])assert.throws(()=>authorizeBrowserFixture(["--owner-lost-key-inspect",run],{...env,...patch}));
 assert.throws(()=>authorizeBrowserFixture(["--owner-lost-key-inspect","c12fc98d-905c-4f0b-a0f6-b9b721869d1d"],env));
 assert.throws(()=>authorizeBrowserFixture(["--owner-lost-key-cleanup",run],env));
 const apply={...env,PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED:undefined,PRODUCT_BROWSER_LOST_KEY_CLEANUP_CONFIRMED:"true",PRODUCT_BROWSER_RECOVERY_PLAN:"a".repeat(64)};
 assert.equal(authorizeBrowserFixture(["--owner-lost-key-cleanup",run],apply).mode,"apply");
 assert.throws(()=>authorizeBrowserFixture(["--owner-lost-key-cleanup",run],{...apply,PRODUCT_BROWSER_RECOVERY_PLAN:undefined}));
});
test("identity is independent of keys; standard manifest validation still rejects a replacement key",()=>{
 for(const key of [Buffer.alloc(32,3),Buffer.alloc(32,9)]){const normal=browserFixturePlan(run,key);for(const field of ["id","email","unknown","name","credentialId"])assert.equal(plan[field],normal[field]);}
 assert.deepEqual(plan.keys,[]);assert.deepEqual(plan.buckets,{});assert.throws(()=>lostKeyFixturePlan("another-run"));
 const {m}=data();assert.equal(validateManifest(m,run,Buffer.alloc(32,3)),m);assert.throws(()=>validateManifest(m,run,Buffer.alloc(32,9)));
});
test("dry run is repeatable-read READ ONLY plus ROLLBACK, validates all tables and emits no mutation",async()=>{
 const f=database(),before=structuredClone(f.state),state=await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"});
 assert.deepEqual(f.state,before);assert.deepEqual(state.counts,[1,1,1,0]);assert.match(state.approval,/^[a-f0-9]{64}$/u);
 assert.ok(f.calls.some(c=>c.sql==="BEGIN READ ONLY"));assert.ok(f.calls.some(c=>c.sql==="SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"));assert.equal(f.calls.at(-1).sql,"ROLLBACK");
 assert.equal(f.calls.filter(c=>c.sql.includes(" AS h FROM product.")).length,9);assert.ok(!f.calls.some(c=>/^DELETE|^UPDATE|^INSERT|^COMMIT|IN EXCLUSIVE MODE/u.test(c.sql)));
});
test("every changed/added opaque rate bucket stops before deletion; nonempty unchanged historical baseline is preserved",async()=>{
 for(const bucketHashes of [["unknown-bucket"],["replaced-bucket"]]) {const f=database();f.state.bucketHashes=bucketHashes;await assert.rejects(lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"}));assert.ok(!f.calls.some(c=>c.sql.startsWith("DELETE")));}
 const f=database();f.state.bucketHashes=["historical-rate-record"];f.state.m.baseline.AuthRateBucket={count:1,digest:sha(JSON.stringify([{h:"historical-rate-record"}]))};f.state.setup=setupReceipt(f.state.m);
 const dry=await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"});await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"apply",approval:dry.approval});
 assert.deepEqual(f.state.bucketHashes,["historical-rate-record"]);assert.ok(!f.calls.some(c=>c.sql.startsWith('DELETE FROM product."AuthRateBucket"')));
});
test("missing receipt/pair, changed credential/relationships, sessions, linked data and historical drift all refuse",async()=>{
 const edits=[s=>s.setup=null,s=>s.users=[],s=>s.accounts=[],s=>s.users[0].name="Other",s=>s.accounts[0].passwordDigest="f".repeat(64),s=>s.extraAccount=true,
  s=>s.sessions[0].userId="historical",s=>s.sessions[0].id=null,s=>s.sessions[0].token="raw-token",s=>s.sessions=Array(6).fill(s.sessions[0]),s=>s.links=true,s=>s.badBaseline=true,s=>s.badHistory=true,s=>s.busy=true,s=>s.locked=false];
 for(const edit of edits){const f=database();edit(f.state);await assert.rejects(lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"}));assert.ok(!f.calls.some(c=>c.sql.startsWith("DELETE")));}
});
test("apply requires the identical dry-run state and rechecks under exclusive locks before exact deletes",async()=>{
 const f=database(),dry=await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"});
 await assert.rejects(lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"apply",approval:"0".repeat(64)}));assert.equal(f.state.users.length,1);
 const result=await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"apply",approval:dry.approval});assert.deepEqual(result.counts,[1,1,1,0]);
 assert.equal(f.state.users.length,0);assert.equal(f.state.accounts.length,0);assert.equal(f.state.sessions.length,0);
 const deletes=f.calls.filter(c=>c.sql.startsWith("DELETE"));assert.equal(deletes.length,3);assert.ok(deletes.every(c=>c.sql.includes(" WHERE ")&&!c.sql.includes(run)));
 assert.ok(f.calls.some(c=>c.sql.includes("IN EXCLUSIVE MODE")));assert.equal(f.calls.at(-1).sql,"COMMIT");
});
test("a session changed after inspection invalidates approval; partial write failure rolls back",async()=>{
 const f=database(),dry=await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"});f.state.sessions[0].id="another-session";
 await assert.rejects(lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"apply",approval:dry.approval}));assert.ok(!f.calls.some(c=>c.sql.startsWith("DELETE")));
 const g=database(),approved=await lostKeyRecoveryTransaction(g.db,g.state.m,g.state.setup,{mode:"inspect"}),query=g.db.query;
 g.db.query=async(sql,args)=>{if(sql.startsWith('DELETE FROM product."Account"'))throw new Error("Synthetic private failure");return query(sql,args);};
 await assert.rejects(lostKeyRecoveryTransaction(g.db,g.state.m,g.state.setup,{mode:"apply",approval:approved.approval}));assert.equal(g.state.sessions.length,1);assert.equal(g.state.users.length,1);assert.equal(g.calls.at(-1).sql,"ROLLBACK");
});
test("default CLI stays inert and prints only fixed diagnostics; source never accepts a substituted key or writes rate records in recovery",()=>{
 const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",new URL("./browser-fixture.mjs",import.meta.url).pathname],{encoding:"utf8",env:{PATH:process.env.PATH}});
 assert.equal(child.status,1);assert.equal(child.stdout,"");assert.match(child.stderr,/failure_stage=configuration/u);
 const source=readFileSync(new URL("./browser-fixture.mjs",import.meta.url),"utf8");assert.ok(source.includes('env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY||'));
 const recovery=source.slice(source.indexOf('export function lostKeyFixturePlan'),source.indexOf('if(process.argv[1]'));
 assert.doesNotMatch(recovery,/browserFixturePlan\(|randomUUID\(|config\.key|console\.(?:log|error)\([^;]*(?:\.url|password|token|\.message|\.stack)/u);
 assert.ok(recovery.includes('validateSetupReceipt(setup,m)'));assert.ok(recovery.includes('exclusiveJson(completed'));
});


test("missing or edited historical rate records cannot be dismissed as expired or unrelated",async()=>{
 for(const current of [[],["edited-historical-rate-record"]]) {
  const f=database();f.state.m.baseline.AuthRateBucket={count:1,digest:sha(JSON.stringify([{h:"original-historical-rate-record"}]))};f.state.setup=setupReceipt(f.state.m);f.state.bucketHashes=current;
  await assert.rejects(lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"}));assert.ok(!f.calls.some(c=>c.sql.startsWith("DELETE")));
 }
});
test("delete-count mismatch or changed post-delete baseline rolls the exceptional transaction back",async()=>{
 for(const failure of ["count","baseline"]) {
  const f=database(),dry=await lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"inspect"}),query=f.db.query;
  f.db.query=async(sql,args)=>{
   const result=await query(sql,args);
   if(sql.startsWith('DELETE FROM product."User"')){if(failure==="count")return {...result,rowCount:0};f.state.badBaseline=true;}
   return result;
  };
  await assert.rejects(lostKeyRecoveryTransaction(f.db,f.state.m,f.state.setup,{mode:"apply",approval:dry.approval}));
  assert.equal(f.state.users.length,1);assert.equal(f.state.accounts.length,1);assert.equal(f.state.sessions.length,1);assert.equal(f.calls.at(-1).sql,"ROLLBACK");
 }
});
