// File/authorization contracts only: NEVER invokes the HTTPS or PostgreSQL proof.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {transportPlan,authorizeTransport,curlConfig,parseCurl,scopedClient} from "./https-transport.integration.mjs";
const run="a12fc98d-905c-4f0b-a0f6-b9b721869d1d",key=Buffer.alloc(32,27);
const env={NODE_ENV:"development",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_HTTPS_TRANSPORT_CONFIRMED:"true",
  PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
  PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
test("transport plan pins approved local values, one fresh identity and five exact digest keys",()=>{
  const plan=transportPlan(run,key);assert.equal(plan.keys.length,5);assert.equal(new Set(plan.keys).size,5);
  assert.equal(plan.id,"ht-proof-"+run);assert.equal(plan.email,plan.id+"@example.invalid");
  assert.deepEqual(plan.policy.login.account,{capacity:3,refillIntervalMs:60000});assert.deepEqual(plan.policy.login.ip,{capacity:10,refillIntervalMs:15000});
  assert.deepEqual(plan.policy.session.ip,{capacity:60,refillIntervalMs:1000});assert.deepEqual(plan.policy.logout.ip,{capacity:30,refillIntervalMs:2000});
  for(const value of Object.values(plan.policy))assert.ok(value.version.startsWith("local-")&&value.version.length<=48);
  assert.ok(plan.keys.every(v=>/^rl:v1:[a-f0-9]{64}$/u.test(v)));assert.ok(!JSON.stringify(plan.keys).includes(plan.email));
  assert.ok(transportPlan(run,Buffer.alloc(32,28)).keys.every(v=>!plan.keys.includes(v)));assert.throws(()=>transportPlan("historical",key));
});
test("proof/cleanup authorization is exclusive and refuses wrong targets or normal Next activation",()=>{
  assert.equal(authorizeTransport(["--owner-transport"],env).action,"proof");
  for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_HTTPS_TRANSPORT_CONFIRMED:undefined},{PRODUCT_MIGRATION_CONFIRMED:undefined},
    {PRODUCT_TEST_DATABASE_URL:undefined},{ENABLE_PRODUCT_SESSION_HTTP:"true"},{PRODUCT_HTTPS_CLEANUP_CONFIRMED:"true"},{NODE_OPTIONS:"--inspect"},
    {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?","/stitchtrack_assessment?")}])assert.throws(()=>authorizeTransport(["--owner-transport"],{...env,...patch}));
  const cleanup={...env,NODE_ENV:"test",PRODUCT_HTTPS_TRANSPORT_CONFIRMED:undefined,PRODUCT_HTTPS_CLEANUP_CONFIRMED:"true"};assert.equal(authorizeTransport(["--owner-cleanup",run],cleanup).action,"cleanup");
  assert.throws(()=>authorizeTransport(["--owner-cleanup","prefix"],cleanup));assert.throws(()=>authorizeTransport([],env));
  const child=spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",new URL("./https-transport.integration.mjs",import.meta.url).pathname],{encoding:"utf8",env:{PATH:process.env.PATH}});
  assert.equal(child.status,1);assert.equal(child.stdout,"");assert.match(child.stderr,/STOP: HTTPS transport/u);
});
test("curl stdin configuration keeps credentials/cookies out of argv and response parsing preserves Set-Cookie",()=>{
  const config=curlConfig("login",{email:"synthetic@example.invalid",password:' Synthetic " value '},"synthetic-cookie");
  assert.ok(config.includes('url = "https://127.0.0.1:3443/'));assert.ok(config.includes('Origin: https://127.0.0.1:3443'));assert.ok(config.includes('data = '));
  assert.throws(()=>curlConfig("registration",{}));assert.throws(()=>curlConfig("session",undefined,"bad\r\nheader"));
  const result=parseCurl('HTTP/1.1 200 OK\r\nSet-Cookie: first=synthetic; Secure\r\nSet-Cookie: second=synthetic; Secure\r\n\r\n{"user":{"id":"synthetic"}}');
  assert.equal(result.status,200);assert.equal(result.headers.getSetCookie().length,2);assert.equal(result.body.user.id,"synthetic");assert.throws(()=>parseCurl("not an HTTP response"));
});
test("source contracts preserve TLS validation, historical scope, real fail-closed SQL and separate recoverable cleanup",()=>{
  const source=readFileSync(new URL("./https-transport.integration.mjs",import.meta.url),"utf8");
  for(const text of ['"--cacert"','"--noproxy","*"','c.stdin.end(configuration)','x.checkIP("127.0.0.1")','realpathSync(file)!==file','saveManifest(run,key)',
    '"BEGIN READ ONLY"','PRODUCT_MIGRATIONS[r.migration_name]','baseline.User.length,10','WHERE t."keyDigest"<>ALL','mode.readOnlyRate=true',
    'SET TRANSACTION READ ONLY','server?.close()','client?.$disconnect()','control.end()','pg_try_advisory_xact_lock','plan.keys','"cleanup-complete.json"'])assert.ok(source.includes(text),text);
  assert.doesNotMatch(source,/--insecure|rejectUnauthorized\s*:\s*false|\.env\.local|migrate|TRUNCATE\s+(?:TABLE|product\.)|DROP TABLE|approve.*TermsVersion/u);
  assert.ok(source.indexOf('saveManifest(run,key)')<source.indexOf('await control.connect()'));
  assert.ok(source.includes('if(!plan.keys.includes(values[0]))'));assert.ok(source.includes('tx.user.create'));assert.ok(!source.includes('user.upsert'));
  assert.ok(source.includes('data:{id:plan.id,email:plan.email,name:plan.name,emailVerified:true'));
  // No raw response, password, cookie, URL or key logging. Dynamic logs contain
  // only the run UUID or cleanup counts, never native exception values.
  const args=[...source.matchAll(/console\.(?:log|error)\((.*?)\);/gu)].map(m=>m[1]);
  assert.ok(args.length>8);for(const a of args)assert.ok(!/password|cookie\b|\.url|key\b|\.body|\.headers|console\.error\(e/u.test(a.replace(/"[^"\n]*"/gu,'""')));
});

test("fixture fence forwards real installed Better Auth login/lookup/logout on a database double",async()=>{
  await import("../../scripts/register-server-only.mjs");
  const {fakeProduct}=await import("./fake-product.mjs"),{hashPassword}=await import("../../lib/auth/password.server.ts"),{createSessionService}=await import("../../lib/product-auth/session.server.ts");
  const f=fakeProduct({sessionAccess:true}),plan=transportPlan(run,key),mode={readOnlyRate:false,alive:()=>true},digests=new Set(),password=" Exact synthetic transport password ";
  await f.client.user.create({data:{id:plan.id,email:plan.email,name:plan.name,emailVerified:true}});
  await f.client.account.create({data:{id:plan.credentialId,userId:plan.id,accountId:plan.id,providerId:"credential",password:await hashPassword(password)}});
  const client=scopedClient(f.client,plan,mode,digests),service=createSessionService(client,{mode:"test",authSecret:"offline-transport-cookie-secret-not-for-deployment",sessionTokenKey:Buffer.alloc(32,7),origin:"https://127.0.0.1:3443",expiresInSeconds:604800,renewal:"none"});
  const logged=await service.login({email:plan.email,password}),headers=new Headers({cookie:logged.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ")});
  assert.equal(digests.size,1);assert.equal((await service.lookup(headers)).session.user.id,plan.id);await service.logout(headers);assert.equal((await service.lookup(headers)).session,null);
  await assert.rejects(client.$queryRaw`SELECT id FROM "product"."User" WHERE id=${"historical"}`);
  await assert.rejects(client.session.create({data:{userId:"historical",token:"raw"}}));
  mode.alive=()=>false;await assert.rejects(client.session.count({where:{userId:plan.id}}));
});
