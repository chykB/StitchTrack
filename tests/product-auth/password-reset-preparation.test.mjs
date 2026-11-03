import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {authorizePasswordResetProof} from "./password-reset.integration.mjs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
test("fourth migration is test-only, preserves applied SQL, separates open purposes and pins narrow grants",()=>{
 const sql=read("prisma/product/migrations/20261102_password_reset/migration.sql"),hash=createHash("sha256").update(sql).digest("hex");assert.equal(hash,PRODUCT_MIGRATIONS["20261102_password_reset"]);
 assert.match(sql,/current_database\(\)<>'stitchtrack_product_test'/);assert.doesNotMatch(sql,/stitchtrack_product_dev|UPDATE.*Account|DELETE FROM|CREATE SCHEMA/);
 assert.match(sql,/DEFAULT 'email-verification'/);assert.match(sql,/\("userId","purpose"\)/);assert.match(sql,/password-reset/);
 const grants=read("prisma/product/setup/password-reset-test-permissions.sql");assert.deepEqual(grants.match(/^GRANT.*$/gm),['GRANT UPDATE ("password","updatedAt") ON product."Account" TO stitchtrack_product_test_app;']);
 // This is the historical fourth-migration grant, not authorization for later migrations.
 for(const [name,digest] of Object.entries(PRODUCT_MIGRATIONS))if(name<="20261102_password_reset")assert.ok(grants.includes(digest));
 assert.ok(read("prisma/product/prisma.config.ts").includes('PRODUCT_PASSWORD_RESET_MIGRATION_CONFIRMED!=="true"'));
});
test("integration harness is inert on import, needs exact test-only authorization and never sends SMTP",()=>{
 const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_PASSWORD_RESET_PROOF_CONFIRMED:"true",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
 for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_PASSWORD_RESET_PROOF_CONFIRMED:undefined},{PRODUCT_EMAIL_WORKER_ENABLED:"true"},{ENABLE_PRODUCT_PASSWORD_RESET_HTTP:"true"}])assert.throws(()=>authorizePasswordResetProof(["--owner-integration"],{...env,...patch}));
 assert.throws(()=>authorizePasswordResetProof(["--owner-integration","--reset"],env));assert.equal(authorizePasswordResetProof(["--owner-integration"],env).runtime.mode,"test");
 const harness=read("tests/product-auth/password-reset.integration.mjs");assert.match(harness,/pg_try_advisory_lock\(1398031176,1\)/);assert.match(harness,/wait_event_type='Lock'/);assert.match(harness,/Promise\.all\(\[reset\(a\)/);assert.doesNotMatch(harness,/smtp\.server|sendMail|mailer\./);
 const cleanup=read("prisma/product/setup/password-reset-test-cleanup.sql");assert.doesNotMatch(cleanup,/TRUNCATE|DROP |stitchtrack_product_dev/);assert.match(cleanup,/Exact complete synthetic fixture/);assert.match(cleanup,/"id"=ANY\(ids\)/);assert.ok(cleanup.includes("forget-password-otp-"));
});
