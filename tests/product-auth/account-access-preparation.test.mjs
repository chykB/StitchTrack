// Offline authorization/source contracts only: never runs the PostgreSQL proof.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {accountProofFixtures,authorizeAccountProof,assertAccountProofMutation,closeAccountProofClients,ACCOUNT_PROOF_LABELS} from "./account-access.integration.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const runId="491953db-dd72-419b-a0ef-103facd8f41d"; // Nonsecret shape fixture; no database use.
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_ACCOUNT_ACCESS_PROOF_CONFIRMED:"true",
  PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
  PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};

test("proof import/default CLI is inert; exact owner confirmation and both isolated targets required",()=>{
  const approved=authorizeAccountProof(["--owner-integration"],env);assert.equal(approved.runtime.user,"stitchtrack_product_test_app");assert.equal(approved.migrator.user,"stitchtrack_product_test_migrator");
  for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_ACCOUNT_ACCESS_PROOF_CONFIRMED:undefined},{PRODUCT_MIGRATION_CONFIRMED:undefined},
    {PRODUCT_TEST_DATABASE_URL:undefined},{PRODUCT_TEST_MIGRATION_DATABASE_URL:undefined},{DEBUG:"*"},{NODE_OPTIONS:"--inspect"},{PGOPTIONS:"override"},
    {ENABLE_PRODUCT_SESSION_HTTP:"true"},{PRODUCT_EMAIL_WORKER_ENABLED:"true"},
    {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?","/stitchtrack_assessment?")},
    {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL}])assert.throws(()=>authorizeAccountProof(["--owner-integration"],{...env,...patch}));
  for(const args of [[],["--owner-integration",runId],["--owner-cleanup",runId]])assert.throws(()=>authorizeAccountProof(args,env));
  const result=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",new URL("./account-access.integration.mjs",import.meta.url).pathname],{encoding:"utf8",env:{PATH:process.env.PATH,NODE_ENV:"test"}});
  assert.equal(result.status,1);assert.equal(result.stdout,"");assert.match(result.stderr,/STOP: account proof unconfirmed/u);assert.doesNotMatch(result.stderr,/synthetic-only|postgresql:|run_id=/u);
});
test("eight exact UUID-scoped fixture pairs have valid bounded synthetic emails, and cannot target historical IDs",()=>{
  const f=accountProofFixtures(runId);assert.deepEqual(Object.keys(f),ACCOUNT_PROOF_LABELS);assert.equal(new Set(Object.values(f).map(x=>x.id)).size,8);
  for(const v of Object.values(f)){assert.ok(v.id.startsWith("al-proof-"+runId+"-"));assert.equal(v.email,v.id+"@example.invalid");assert.ok(v.email.split("@")[0].length<=64);assert.equal(v.credentialId,"credential-"+v.id);}
  const other=accountProofFixtures("591953db-dd72-419b-a0ef-103facd8f41d");assert.ok(Object.values(other).every(v=>!Object.values(f).some(old=>old.id===v.id)));
  for(const id of ["../escape","",runId.toUpperCase()])assert.throws(()=>accountProofFixtures(id));
});
test("mutation guard allows only scoped digest-only Session insert and exact-user revocation",()=>{
  const f=accountProofFixtures(runId).rollback,token="hmac-sha256:v1:"+"a".repeat(64);
  assertAccountProofMutation("session","create",{data:{userId:f.id,token}},f);
  assertAccountProofMutation("session","deleteMany",{where:{userId:f.id}},f);
  for(const [model,method,args] of [["session","create",{data:{userId:"historical",token}}],["session","create",{data:{userId:f.id,token:"raw-bearer"}}],
    ["session","deleteMany",{where:{}}],["session","deleteMany",{where:{userId:f.id,other:true}}],["user","update",{where:{id:f.id}}],["account","deleteMany",{where:{userId:f.id}}]])assert.throws(()=>assertAccountProofMutation(model,method,args,f));
});
test("all constructed Prisma clients close even when one shutdown rejects; native errors do not escape",async()=>{
  const called=[];await assert.rejects(closeAccountProofClients([{$disconnect(){called.push(1);throw new Error("private-detail");}},{$disconnect:async()=>{called.push(2);}}]),e=>e.message==="Account proof client shutdown unconfirmed.");assert.deepEqual(called,[1,2]);
});
test("real proof forwards transactions, observes actual blockers and injects real SQL/precommit failures",()=>{
  const source=read("./account-access.integration.mjs");
  for(const value of ["new PrismaClient","max:1","pg_blocking_pids","afterLock","real.$transaction","await callback(wrap(tx,true,context))","SELECT 1 / 0",
    "pg_terminate_backend(pid,1000)","backend_start::text=$3","application_name=$2","candidate=!!value.headers?.getSetCookie().length","Promise.allSettled(jobs)","Promise.allSettled(lockJobs)",
    "expected: false","sha256(convert_to(to_jsonb(t)::text","baseline.User.length,10","closeAccountProofClients(clients)","globalThis.fetch=fetcher"])assert.ok(source.includes(value),value);
  assert.doesNotMatch(source,/writeFile|mkdir|createWriteStream|manifest\.json|\.env\.local|smtp/u);
  const messages=[...source.matchAll(/console\.(?:log|error)\((.*?)\);/gu)].map(m=>m[1]);
  assert.ok(messages.length>5);for(const arg of messages)assert.match(arg,/^"[^"\n]*"(?: \+ runId)?$/u);
  assert.ok(source.indexOf("pg_try_advisory_lock")<source.indexOf('console.log("Synthetic account proof run_id='));
});
test("read-only migrator preflight and rollback-independent cleanup pin exact migration checksums",()=>{
  const source=read("./account-access.integration.mjs"),sql=read("../../prisma/product/setup/account-access-test-cleanup.sql");
  assert.match(source,/BEGIN READ ONLY/u);assert.match(source,/history.length !== 3/u);assert.match(source,/schema|nspname='product'/u);
  for(const [name,checksum] of Object.entries(PRODUCT_MIGRATIONS))if(["20261029_product_auth_initial","20261030_auth_rate_bucket","20261030_user_access_locks"].includes(name))assert.ok(sql.includes(checksum)); // Preserve the original three-migration historical cleanup, not the new reset proof.
  for(const label of ACCOUNT_PROOF_LABELS)assert.ok(sql.includes("'"+label+"'"));
  for(const text of ["current_database()<>'stitchtrack_product_test'","current_user<>'stitchtrack_product_test_migrator'","pg_try_advisory_xact_lock","pg_stat_activity","cleanup_confirmed","found NOT IN (0,8)","<>10+found","TermsAcceptance","EmailVerificationIssuance","User\" WHERE id=ANY(ids)"])assert.ok(sql.includes(text),text);
  const deletes=[...sql.matchAll(/^  DELETE FROM ([^;]+);/gmu)].map(m=>m[1]);assert.equal(deletes.length,3);assert.ok(deletes.every(s=>s.includes("=ANY(ids)")));
  assert.doesNotMatch(sql,/\bLIKE\b|TRUNCATE|DROP|GRANT|stitchtrack_product_dev/u);
  assert.ok(source.includes('LOCK_NAME = "stitchtrack/account-access-proof"'));assert.ok(sql.includes("hashtextextended('stitchtrack/account-access-proof',0)"));
});
