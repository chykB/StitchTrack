// Offline preparation checks, not PostgreSQL evidence or an execution of capture.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {authorizeCapture,inspectSubject,assertCaptureEvidenceAbsent,CAPTURE_EVIDENCE_FILES} from "../../task-04-server-security/experiments/verification-evidence/capture.mjs";
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_OTP_EVIDENCE_CONFIRMED:"true",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
test("OTP capture is inert on import, requires exact CLI and rejects unsafe/worker targets",()=>{
 assert.equal(authorizeCapture(["--owner-capture"],env).database,"stitchtrack_product_test");
 for(const edit of [{NODE_ENV:"production"},{NODE_ENV:"development"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_OTP_EVIDENCE_CONFIRMED:"false"},
 {PRODUCT_EMAIL_WORKER_ENABLED:"true"},{PGOPTIONS:"override"},{PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("_test?","_dev?")},
 {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("_app:","_migrator:")}])assert.throws(()=>authorizeCapture(["--owner-capture"],{...env,...edit}));
 for(const args of [[],["--owner-capture","--reset"]])assert.throws(()=>authorizeCapture(args,env));
});
test("database snapshot explicitly selects only safe evidence columns",async()=>{
 const rows={emailVerificationIssuance:{id:"issue",userId:"user",verificationId:"challenge",createdAt:new Date(),expiresAt:new Date(),failedAttempts:0,consumedAt:null,supersededAt:null,emailCanonical:"private@example.invalid",verifier:"DO-NOT-PRINT"},
 user:{id:"user",emailVerified:false,email:"private@example.invalid"},verification:{id:"challenge",createdAt:new Date(),expiresAt:new Date(),identifier:"private@example.invalid",value:"DO-NOT-PRINT"},
 emailOutbox:{id:"job",issuanceId:"issue",status:"pending",attemptCount:0,sentAt:null,payloadCiphertext:"DO-NOT-PRINT"}};
 const client={session:{count:async()=>0}};
 for(const [model,row] of Object.entries(rows))client[model]={findUnique:async({select})=>Object.fromEntries(Object.keys(select).map(key=>[key,row[key]]))};
 const snapshot=await inspectSubject(client,{issuanceId:"issue"}),serialized=JSON.stringify(snapshot);
 assert.equal(snapshot.verification.id,"challenge");assert.equal(snapshot.sessions,0);
 assert.doesNotMatch(serialized,/DO-NOT-PRINT|private@example|verifier|payloadCiphertext|password/u);
});
test("prepared capture reuses the real service, real clock and retained fixtures without a worker or reset",()=>{
 const source=readFileSync(new URL("../../task-04-server-security/experiments/verification-evidence/capture.mjs",import.meta.url),"utf8");
 assert.match(source,/createRegistrationService\(client/u);assert.match(source,/await service.register/u);assert.match(source,/service.verify/u);
 assert.match(source,/while\(Date.now\(\)<=initial.issuance.expiresAt/u);assert.doesNotMatch(source,/clock:\s*\(|testFault:|migrate|\.deleteMany\(|\.delete\(|smtp.server|createOutboxWorker/u);
 assert.match(source,/isTestFixture:true,approvedAt:null,effectiveAt:null/u);assert.match(source,/select:\{context:true\}/u);
 assert.match(source,/assert.deepEqual\(after,consumed\)/u);assert.match(source,/assert.equal\(state.issuance.failedAttempts,attempt\)/u);
});

test("capture refuses every official and historical evidence filename before connecting",()=>{
 const expected=["19-verification-row.png","20-verification-expired.png","21-verification-wrong-code.png","22-verification-code-reused.png",
  "20-expired-verification.png","21-incorrect-verification-code.png","22-reused-verification-code.png"];
 assert.deepEqual([...CAPTURE_EVIDENCE_FILES],expected);
 assert.doesNotThrow(()=>assertCaptureEvidenceAbsent(()=>false));
 for(const name of expected)assert.throws(()=>assertCaptureEvidenceAbsent(path=>path==="task-04-server-security/evidence/"+name),/Preserve existing evidence/u);
 const source=readFileSync(new URL("../../task-04-server-security/experiments/verification-evidence/capture.mjs",import.meta.url),"utf8");
 assert.ok(source.indexOf("assertCaptureEvidenceAbsent(existsSync)")<source.indexOf("new PrismaClient("),"Evidence protection must precede client construction");
});
