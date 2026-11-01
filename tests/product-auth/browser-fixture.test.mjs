// Offline contracts and state-validation tests only. No fixture script execution with authorization.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {authorizeBrowserFixture,browserFixturePlan,validateManifest,validateFixtureRows,removeFixtureRows,fixtureSnapshot,sameBaseline,BROWSER_FIXTURE_TABLES,BROWSER_FIXTURE_FORMAT,setupReceipt,validateSetupReceipt,fixtureCleanupState,fixtureFailureMessage} from "./browser-fixture.mjs";
import {authorizeLocalGateway} from "../../scripts/local-auth-gateway.mjs";
import {Socket} from "node:net";
import "../../scripts/register-server-only.mjs";
const {createAuthRateLimiter,rateTransportFromSocket}=await import("../../lib/product-auth/rate-limit.server.ts");
import {TAILOR_SESSION_LIFETIME_SECONDS} from "../../lib/product-auth/session-policy.ts";
const run="c12fc98d-905c-4f0b-a0f6-b9b721869d1d",key=Buffer.alloc(32,28),plan=browserFixturePlan(run,key);
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_BROWSER_SETUP_CONFIRMED:"true",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_LOCAL_RATE_IDENTIFIER_KEY:key.toString("base64"),PRODUCT_BROWSER_FIXTURE_PASSWORD:" Exact synthetic offline password "};
const cleanupEnv={...env,PRODUCT_BROWSER_SETUP_CONFIRMED:undefined,PRODUCT_BROWSER_CLEANUP_CONFIRMED:"true",PRODUCT_BROWSER_GATEWAY_STOPPED:"true",PRODUCT_BROWSER_CLIENT_CLOSED:"true"};
const createdAt="2026-10-31T10:00:00.000Z",passwordDigest="a".repeat(64),m={createdAt,passwordDigest};
const rows=()=>[
 [{id:plan.id,name:plan.name,emailCanonical:plan.email,emailVerified:true,disabledAt:null,deletionRequestedAt:null,image:null,createdAt,updatedAt:createdAt}],
 [{id:plan.credentialId,userId:plan.id,accountId:plan.id,providerId:"credential",passwordDigest,createdAt,updatedAt:createdAt,accessToken:null,refreshToken:null,idToken:null,accessTokenExpiresAt:null,refreshTokenExpiresAt:null,scope:null}],
 [{userId:plan.id,token:"hmac-sha256:v1:"+"b".repeat(64),createdAt,expiresAt:new Date(Date.parse(createdAt)+604800000).toISOString()}],
 Object.entries(plan.buckets).map(([keyDigest,policy])=>({keyDigest,...policy}))
];
test("setup and cleanup require separate explicit authorization and exact isolated targets",()=>{
 assert.equal(authorizeBrowserFixture(["--owner-setup"],env).action,"setup");assert.equal(authorizeBrowserFixture(["--owner-cleanup",run],cleanupEnv).action,"cleanup");
 for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_MIGRATION_CONFIRMED:undefined},{PRODUCT_BROWSER_SETUP_CONFIRMED:undefined},
  {PRODUCT_BROWSER_CLEANUP_CONFIRMED:"true"},{ENABLE_PRODUCT_SESSION_HTTP:"true"},{PRODUCT_EMAIL_WORKER_ENABLED:"true"},{NODE_OPTIONS:"--inspect"},{PRODUCT_BROWSER_FIXTURE_PASSWORD:undefined},
  {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?","/stitchtrack_assessment?")},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("test_migrator:","dev_migrator:")}])assert.throws(()=>authorizeBrowserFixture(["--owner-setup"],{...env,...patch}));
 for(const patch of [{PRODUCT_BROWSER_GATEWAY_STOPPED:undefined},{PRODUCT_BROWSER_CLIENT_CLOSED:undefined},{PRODUCT_BROWSER_SETUP_CONFIRMED:"true"}])assert.throws(()=>authorizeBrowserFixture(["--owner-cleanup",run],{...cleanupEnv,...patch}));
 assert.throws(()=>authorizeBrowserFixture(["--owner-cleanup","prefix"],cleanupEnv));assert.throws(()=>authorizeBrowserFixture([],env));
});
test("fresh UUID plan uses one synthetic verified identity and exact gateway policies/keys; no 600-second policy",()=>{
 assert.match(plan.email,/@example\.invalid$/u);assert.notEqual(plan.unknown,plan.email);assert.equal(plan.keys.length,5);assert.equal(TAILOR_SESSION_LIFETIME_SECONDS,604800);
 const gateway=authorizeLocalGateway(["--owner-start-single-origin"],{...env,NODE_ENV:"development",PRODUCT_SINGLE_ORIGIN_RUN_ID:run,
  ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_SINGLE_ORIGIN_CONFIRMED:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",
  PRODUCT_SESSION_HTTP_ORIGIN:"https://127.0.0.1:3443",PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://127.0.0.1:3000",
  PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-gateway-signing-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,29).toString("base64"),PRODUCT_HTTPS_CERT_FILE:"/private/not-read.crt",PRODUCT_HTTPS_KEY_FILE:"/private/not-read.key"});
 assert.deepEqual(plan.policy,gateway.policy);assert.deepEqual(Object.keys(plan.buckets).sort(),plan.keys);
 assert.ok(browserFixturePlan(run,Buffer.alloc(32,27)).keys.every(k=>!plan.keys.includes(k)));assert.throws(()=>browserFixturePlan("reuse-prefix",key));
});
test("cleanup accepts only the exact fixture relationships, unchanged credential and bounded seven-day digest sessions",()=>{
 assert.doesNotThrow(()=>validateFixtureRows(plan,m,...rows()));assert.throws(()=>validateFixtureRows(plan,m,[],[],[],[]));
 for(const [group,field,value] of [[0,"id","historical"],[0,"emailCanonical",plan.unknown],[0,"emailVerified",false],[0,"disabledAt",createdAt],
  [0,"updatedAt","2026-11-01T10:00:00.000Z"],[1,"userId","historical"],[1,"id","other"],[1,"accountId","other"],[1,"providerId","oauth"],[1,"passwordDigest","c".repeat(64)],[1,"accessToken","unexpected"],
  [2,"token","raw-token"],[2,"userId","historical"],[2,"expiresAt","2026-11-08T10:00:00.000Z"],[3,"keyDigest","unknown"],[3,"capacity",999]]) {
   const r=rows();r[group][0][field]=value;assert.throws(()=>validateFixtureRows(plan,m,...r));
 }
 for(const mutate of [r=>r[0].push({...r[0][0]}),r=>r[1].push({...r[1][0]}),r=>r[2]=Array(6).fill(r[2][0]),r=>r[0]=[]]){const r=rows();mutate(r);assert.throws(()=>validateFixtureRows(plan,m,...r));}
});
test("stable manifest format binds run/key/baseline, supports source edits and rejects unknown contracts",()=>{
 const baseline=Object.fromEntries(BROWSER_FIXTURE_TABLES.map(t=>[t,{count:t==="User"?10:0,digest:"d".repeat(64)}]));
 const digest=v=>createHash("sha256").update(v).digest("hex");
 const manifest={format:BROWSER_FIXTURE_FORMAT,run,createdAt,passwordDigest,rateKeyDigest:digest(key),baseline};
 assert.equal(validateManifest(manifest,run,key),manifest);
 for(const patch of [{run:"other"},{format:1},{format:999},{source:"e".repeat(64)},{rateKeyDigest:"f".repeat(64)},{password:"not-allowed"},{baseline:{...baseline,User:{count:11,digest:"d".repeat(64)}}}])assert.throws(()=>validateManifest({...manifest,...patch},run,key));
 assert.throws(()=>validateManifest(manifest,run,Buffer.alloc(32,8)));
 const receipt=setupReceipt(manifest);assert.equal(validateSetupReceipt(receipt,manifest),receipt);
 // A nonsemantic source edit cannot affect this record: it hashes the persisted manifest only.
 assert.equal(receipt.manifestDigest,digest(JSON.stringify(manifest)));
 for(const patch of [{run:"other"},{format:1},{manifestDigest:"e".repeat(64)},{extra:true}])assert.throws(()=>validateSetupReceipt({...receipt,...patch},manifest));
 assert.throws(()=>validateSetupReceipt(null,manifest));
});
test("cleanup distinguishes acknowledged setup, recovered committed pair, absent preparation and inconsistent state",()=>{
 const receipt={format:BROWSER_FIXTURE_FORMAT,run,manifestDigest:"d".repeat(64)};
 assert.equal(fixtureCleanupState(receipt,rows()),"confirmed-setup");
 assert.equal(fixtureCleanupState(null,rows()),"recovered-persisted-setup");
 assert.equal(fixtureCleanupState(null,[[],[],[],[]]),"setup-unconfirmed-absent");
 assert.throws(()=>fixtureCleanupState(receipt,[[],[],[],[]]));
 assert.throws(()=>fixtureCleanupState(null,[[],[],[],rows()[3]]));
 for(const r of [[rows()[0],[],[],[]],[[],rows()[1],[],[]],[[],[],rows()[2],[]]])assert.throws(()=>fixtureCleanupState(null,r));
});
test("existing gateway limiter generates exactly the cleanup keys with canonical equivalents",async()=>{
 const captured=[],client={$queryRaw:async(parts,...args)=>{
  if(parts.join("").includes("current_database()"))return [{database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",namespace:"product",safe:true}];
  captured.push({key:args[0],capacity:args[1],refillIntervalMs:args[2]});return [{allowed:true,retryAfterSeconds:1}];
 }};
 const limiter=createAuthRateLimiter(client,{mode:"test",identifierKey:key,policies:{login:plan.policy.login},ipOnlyPolicies:{session:plan.policy.session,logout:plan.policy.logout}});
 const socket=new Socket();Object.defineProperty(socket,"remoteAddress",{value:"127.0.0.1"});
 try {
  const transport=rateTransportFromSocket(socket);
  for(const op of ["login","session","logout"])assert.equal((await limiter.consumeIp(op,transport)).allowed,true);
  for(const email of [plan.email,plan.unknown," "+plan.email.toUpperCase()+" "])assert.equal((await limiter.consumeAccount("login",transport,email)).allowed,true);
  assert.deepEqual([...new Set(captured.map(r=>r.key))].sort(),plan.keys);
  for(const row of captured)assert.deepEqual({capacity:row.capacity,refillIntervalMs:row.refillIntervalMs},plan.buckets[row.key]);
 }finally{socket.destroy();}
});
test("historical transport-plan import and invocation have no connection, listener or filesystem-write side effects",()=>{
 const probe=`import fs from "node:fs";import net from "node:net";import https from "node:https";import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";
 const denied=()=>{throw new Error("Import side effect forbidden");};
 for(const k of ["writeFileSync","mkdirSync","unlinkSync","appendFileSync"])fs[k]=denied;
 net.Socket.prototype.connect=denied;https.createServer=denied;cp.spawn=denied;globalThis.fetch=denied;syncBuiltinESMExports();
 const {transportPlan}=await import("./tests/product-auth/https-transport.integration.mjs");
 transportPlan("${run}",Buffer.alloc(32,28));console.log("import_and_plan_inert");`;
 const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--input-type=module","-e",probe],{encoding:"utf8",env:{PATH:process.env.PATH}});
 assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),"import_and_plan_inert");assert.equal(child.stderr,"");
});
test("baseline snapshots exclude only exact fixture rows, cover all nine tables and contain fingerprints only",async()=>{
 const calls=[],db={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{h:"a".repeat(64)}]};}};
 const snapshot=await fixtureSnapshot(db,plan);assert.equal(calls.length,9);assert.deepEqual(Object.keys(snapshot),BROWSER_FIXTURE_TABLES);
 assert.equal(calls.find(c=>c.sql.includes('product."Account"')).args[0],plan.credentialId);
 assert.equal(calls.find(c=>c.sql.includes('product."Session"')).args[0],plan.id);
 assert.deepEqual(calls.find(c=>c.sql.includes('product."AuthRateBucket"')).args,[plan.keys]);
 assert.ok(calls.filter(c=>!c.sql.includes(' WHERE ')).length===5);assert.ok(!JSON.stringify(snapshot).includes(plan.email));
});
test("any changed, added or missing historical row fingerprint refuses cleanup",()=>{
 const baseline=Object.fromEntries(BROWSER_FIXTURE_TABLES.map(t=>[t,{count:t==="User"?10:0,digest:"a".repeat(64)}]));
 assert.doesNotThrow(()=>sameBaseline(structuredClone(baseline),baseline));
 for(const table of BROWSER_FIXTURE_TABLES) {
  const changed=structuredClone(baseline);changed[table].digest="b".repeat(64);assert.throws(()=>sameBaseline(changed,baseline));
  changed[table]={count:baseline[table].count+1,digest:baseline[table].digest};assert.throws(()=>sameBaseline(changed,baseline));
  delete changed[table];assert.throws(()=>sameBaseline(changed,baseline));
 }
});
test("cleanup mutations are parameterized exact-key deletions with strict affected-row checks",async()=>{
 const calls=[],counts=[1,1,1,5];let index=0;
 assert.deepEqual(await removeFixtureRows({query:async(sql,args)=>{calls.push({sql,args});return {rowCount:counts[index++]};}},plan,counts),counts);
 assert.equal(calls.length,4);assert.ok(calls.every(c=>c.sql.includes(" WHERE ")&&!c.sql.includes(plan.id)));
 assert.deepEqual(calls[1].args,[plan.credentialId,plan.id,"credential"]);assert.deepEqual(calls[3].args,[plan.keys]);
 await assert.rejects(removeFixtureRows({query:async()=>({rowCount:99})},plan,counts));
});
test("inert default CLI and source preserve durable-before-write manifest, locked cleanup, rollback and sanitized output",()=>{
 const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",new URL("./browser-fixture.mjs",import.meta.url).pathname],{encoding:"utf8",env:{PATH:process.env.PATH}});
 assert.equal(child.status,1);assert.equal(child.stdout,"");assert.match(child.stderr,/STOP: browser fixture operation unconfirmed \(failure_stage=configuration\)/u);
 const source=readFileSync(new URL("./browser-fixture.mjs",import.meta.url),"utf8");
 for(const text of ['randomUUID()','hashPassword(parsed.password)','saveManifest(m);','prisma.$transaction','await identity(reader,config.runtime)','pg_try_advisory_lock','IN EXCLUSIVE MODE','sameBaseline(await fixtureSnapshot(db,plan),m.baseline)','await db.query("ROLLBACK")','prisma?.$disconnect()','db.end()','"wx",0o600','fsyncSync'])assert.ok(source.includes(text),text);
 assert.ok(source.indexOf('saveManifest(m);')<source.indexOf('await tx.user.create'));
 assert.ok(source.includes('setup-complete.json'),"Setup completion receipt required");
 assert.ok(source.indexOf('},'+ '{isolationLevel:')<source.indexOf('exclusiveJson(join(directory(run),"setup-complete.json")'));
 assert.ok(source.includes('process.exitCode=2'));
 assert.ok(source.includes('if(state==="setup-unconfirmed-absent")'));
 assert.doesNotMatch(source,/const source=|m\.source|readFileSync\(new URL\(import\.meta\.url\)\)/u);
 assert.equal((source.match(/SELECT pg_try_advisory_lock/g)||[]).length,1);
 assert.equal((source.match(/SELECT pg_try_advisory_xact_lock/g)||[]).length,1);
 assert.ok(source.indexOf('sameBaseline(await fixtureSnapshot(db,plan),m.baseline)')<source.indexOf('const counts=await removeFixtureRows'));
 assert.doesNotMatch(source,/\.env\.local|console\.(?:log|error)\([^;]*(?:password|config\.key|target\.url)|TRUNCATE\s+(?:TABLE|product)|DELETE FROM .*LIKE |session\.create|termsAcceptance\.create/u);
});

test("failure diagnostics expose fixed stage labels only, never exceptions or supplied details",()=>{
 for(const stage of ["configuration","database_connection","role_verification","migration_history","permissions","quiescence","baseline","fixture_creation","fixture_commit","setup_receipt","connection_cleanup"]) {
  assert.match(fixtureFailureMessage(stage),new RegExp("failure_stage="+stage+"\\)"));
 }
 const privateDetail="synthetic-private-password-and-postgresql-url";
 for(const value of [privateDetail,new Error(privateDetail),{toString(){throw new Error(privateDetail);}},null,undefined]) {
  assert.match(fixtureFailureMessage(value),/failure_stage=unknown/u);assert.ok(!fixtureFailureMessage(value).includes(privateDetail));
 }
});
test("setup marks sensitive operations before awaiting them and retains original failure through shutdown",()=>{
 const source=readFileSync(new URL("./browser-fixture.mjs",import.meta.url),"utf8");
 const setupSource=source.slice(source.indexOf("async function setup("),source.indexOf("export function setupReceipt("));
 for(const [stage,operation] of [["database_connection","await db.connect()"],["role_verification","await identity(db,config.migrator)"],
  ["migration_history","await history(db)"],["permissions","await permissions(db,config.runtime.user)"],["quiescence","await quiescent(db)"],
  ["baseline","const baseline=await fixtureSnapshot(db,plan)"],["manifest_write","saveManifest(m)"],["fixture_creation","await prisma.$transaction"],["setup_receipt","exclusiveJson(join(directory(run),\"setup-complete.json\")"]]) {
  const mark=setupSource.indexOf('setStage("'+stage+'")'),call=setupSource.indexOf(operation);
  assert.ok(mark>=0&&call>mark,stage);
 }
 assert.ok(source.includes('if(!failed)setStage("connection_cleanup")'));
 assert.ok(source.includes('console.error(fixtureFailureMessage(stage))'));
 assert.doesNotMatch(source,/console\.error\([^;]*(?:\.message|\.cause|\.stack)/u);
});
