// Offline only. Never starts a listener, connects to PostgreSQL or reads private files.
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {authorizeLocalGateway,serveLocalGateway,readLocalCertificate} from "../../scripts/local-auth-gateway.mjs";
const env={NODE_ENV:"development",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",ENABLE_PRODUCT_SESSION_HTTP:"true",
 PRODUCT_SINGLE_ORIGIN_CONFIRMED:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",
 PRODUCT_SESSION_HTTP_ORIGIN:"https://127.0.0.1:3443",PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://127.0.0.1:3000",
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"b12fc98d-905c-4f0b-a0f6-b9b721869d1d",PRODUCT_LOCAL_RATE_IDENTIFIER_KEY:Buffer.alloc(32,22).toString("base64"),
 PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-synthetic-gateway-signing-secret",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_HTTPS_CERT_FILE:"/private/synthetic-not-read.crt",PRODUCT_HTTPS_KEY_FILE:"/private/synthetic-not-read.key"};
const args=["--owner-start-single-origin"];
test("launcher authorization pins test target, canonical origins, independent keys and explicit selected policies",()=>{
 const c=authorizeLocalGateway(args,env);assert.equal(c.target.database,"stitchtrack_product_test");assert.equal(c.target.user,"stitchtrack_product_test_app");
 assert.deepEqual(c.policy.login.account,{capacity:3,refillIntervalMs:60000});assert.deepEqual(c.policy.login.ip,{capacity:10,refillIntervalMs:15000});
 assert.deepEqual(c.policy.session.ip,{capacity:60,refillIntervalMs:1000});assert.deepEqual(c.policy.logout.ip,{capacity:30,refillIntervalMs:2000});
 assert.ok(Object.values(c.policy).every(p=>p.version.startsWith("local-")&&p.version.length<=48));
 for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_DATABASE_CONFIRMED:undefined},{PRODUCT_SINGLE_ORIGIN_CONFIRMED:undefined},
  {PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined},{PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:undefined},{ENABLE_PRODUCT_SESSION_HTTP:undefined},
  {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("stitchtrack_product_test?","stitchtrack_assessment?")},
  {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("test_app:","test_migrator:")},
  {PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://localhost:3000"},{PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://127.0.0.1:3443"},
  {PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://127.0.0.1:3000/path"},{PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:3443"},
  {PRODUCT_LOCAL_RATE_IDENTIFIER_KEY:env.PRODUCT_SESSION_TOKEN_KEY},{PRODUCT_SINGLE_ORIGIN_RUN_ID:"historical"},
  {PRODUCT_EMAIL_WORKER_ENABLED:"true"},{ENABLE_LOCAL_AUTH_FRONTEND:"true"},{NODE_OPTIONS:"--inspect"},{PRODUCT_HTTPS_KEY_FILE:"relative.key"}])assert.throws(()=>authorizeLocalGateway(args,{...env,...patch}));
 assert.throws(()=>authorizeLocalGateway([],env));assert.throws(()=>authorizeLocalGateway([...args,"extra"],env));
});
test("unconfigured CLI refuses before imports, certificate reads, connections or listening",()=>{
 const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",new URL("../../scripts/local-auth-gateway.mjs",import.meta.url).pathname],{encoding:"utf8",env:{PATH:process.env.PATH}});
 assert.equal(child.status,1);assert.equal(child.stdout,"");assert.match(child.stderr,/Local gateway stopped/u);
 assert.throws(()=>readLocalCertificate({PRODUCT_HTTPS_CERT_FILE:"relative",PRODUCT_HTTPS_KEY_FILE:"relative"}));
 const source=readFileSync(new URL("../../scripts/local-auth-gateway.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/dotenv|\.env\.local|migrate deploy|\$connect\(|user\.create|session\.create|rejectUnauthorized/u);
 assert.ok(source.includes('assertProductMigrationFiles()'));assert.ok(source.includes('x.checkIP("127.0.0.1")'));
});
test("normal shutdown closes listener before Prisma and only logs a fixed ready signal",async()=>{
 const calls=[],stop=new AbortController();
 await serveLocalGateway({listen:async()=>calls.push("listen"),close:async()=>calls.push("close")},{$disconnect:async()=>calls.push("disconnect")},stop.signal,()=>{calls.push("ready");stop.abort();});
 assert.deepEqual(calls,["listen","ready","close","disconnect"]);
});
test("listen/close failures and cancellation always release Prisma without retry",async()=>{
 for(const failure of ["listen","close"]) {
  const calls=[],stop=new AbortController();
  await assert.rejects(serveLocalGateway({listen:async()=>{calls.push("listen");if(failure==="listen")throw new Error("synthetic");},close:async()=>{calls.push("close");if(failure==="close")throw new Error("synthetic");}},
   {$disconnect:async()=>calls.push("disconnect")},stop.signal,()=>stop.abort()));
  assert.deepEqual(calls,["listen","close","disconnect"]);
 }
 const stop=new AbortController(),calls=[];stop.abort();
 await serveLocalGateway({listen:async()=>calls.push("listen"),close:async()=>calls.push("close")},{$disconnect:async()=>calls.push("disconnect")},stop.signal);
 assert.deepEqual(calls,["close","disconnect"]);
});
