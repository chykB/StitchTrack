// Offline preparation checks only. The real PostgreSQL harness is NOT executed.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {authorizeWorkerPostgres} from "./worker-postgres.integration.mjs";
const env={NODE_ENV:"test",PRODUCT_WORKER_PG_TEST_CONFIRMED:"true",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
test("owner harness authorization is exact, test-only, disabled by default and rejects worker activation",()=>{
 for(const phase of ["--before-grant","--after-grant"])assert.equal(authorizeWorkerPostgres(["--owner-test",phase],env).database,"stitchtrack_product_test");
 for(const invalid of [{},{...env,NODE_ENV:"development"},{...env,NODE_ENV:"production"},{...env,PRODUCT_DATABASE_MODE:"development"},
  {...env,PRODUCT_WORKER_PG_TEST_CONFIRMED:"false"},{...env,PRODUCT_EMAIL_WORKER_ENABLED:"true"},{...env,PGOPTIONS:"override"},
  {...env,PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("_app:","_migrator:")},
  {...env,PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?","/stitchtrack_assessment?")}])assert.throws(()=>authorizeWorkerPostgres(["--owner-test","--before-grant"],invalid));
 for(const args of [[],["--owner-test"],["--owner-test","--reset"],["--owner-test","--after-grant","--force"]])assert.throws(()=>authorizeWorkerPostgres(args,env));
});
test("prepared real harness uses rollback-only probes and narrowly scopes its own session termination",()=>{
 const code=readFileSync(new URL("./worker-postgres.integration.mjs",import.meta.url),"utf8");
 assert.match(code,/OUTBOX_RESERVE_SQL/u);assert.match(code,/OUTBOX_APPROVED_TERMS_SQL/u);
 assert.match(code,/inRollback\(a.client/u);assert.match(code,/inRollback\(b.client/u);
 assert.match(code,/client.query\("ROLLBACK"\)/u);assert.doesNotMatch(code,/query\([`"]COMMIT|CREATE TABLE|DROP TABLE|migrate reset|db push/u);
 for(const guard of ['pid=$1 AND pid<>pg_backend_pid()', 'datname=current_database() AND usename=current_user', 'application_name=$2', "backend_type='client backend'"])assert.ok(code.includes(guard));
 assert.match(code,/55P03/u);assert.match(code,/42501/u);
 assert.doesNotMatch(code,/import\([^\n]*(?:smtp.server|nodemailer)|createOutboxWorker\(|\.runOnce\(|import[^\n]*dotenv|readFile[^\n]*env/u);
 assert.ok(code.includes('console.log("LIMIT: no committed winner/loser CAS test or eligible dispatch was performed")'));
});
