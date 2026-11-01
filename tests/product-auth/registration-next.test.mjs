// Offline: real Node stream/TLS types and installed auth/crypto, injected DB/HIBP.
// No listener, database, SMTP or external request is made.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {TLSSocket} from "node:tls";
import {IncomingMessage} from "node:http";
import {Writable} from "node:stream";
import {existsSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {createRegistrationClient} from "../../lib/auth/registration-client.ts";
import {createRegistrationController} from "../../lib/auth/registration-controller.ts";
const {createNextRegistrationHandler}=await import("../../lib/product-auth/registration-next.server.ts");
const {createDevelopmentRegistrationDispatcher}=await import("../../lib/product-auth/registration-development.server.ts");
const {createSecretTools}=await import("../../lib/product-auth/secrets.server.ts");
const {registrationPaths}=await import("../../lib/auth/registration-contract.ts");
const key=Buffer.alloc(32,7),verifier=Buffer.alloc(32,1),outbox=Buffer.alloc(32,2),origin="https://127.0.0.1:3443";
const env={NODE_ENV:"development",ENABLE_PRODUCT_REGISTRATION_HTTP:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_DEVELOPMENT_CONSENT_DEFERRED:"true",
 PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-node-api-auth-signing-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,8).toString("base64"),
 PRODUCT_EMAIL_VERIFIER_KEY_ID:"v",PRODUCT_EMAIL_VERIFIER_KEY:verifier.toString("base64"),PRODUCT_EMAIL_OUTBOX_KEY_ID:"m",PRODUCT_EMAIL_OUTBOX_KEY:outbox.toString("base64"),
 PRODUCT_REGISTRATION_RATE_POLICIES:JSON.stringify(Object.fromEntries(["signup","verify-email","resend-verification"].map(op=>[op,{version:"local-node-"+op,account:{capacity:3,refillIntervalMs:60000},ip:{capacity:10,refillIntervalMs:15000}}])))};
const input={name:"?l? Synthetic",email:" Synthetic@EXAMPLE.INVALID ",password:" Exact synthetic password "};
async function development(fn) {
 const old=process.env.NODE_ENV;process.env.NODE_ENV="development";
 try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
}
function message(operation,{requestOrigin=origin,tls=requestOrigin.startsWith("https:"),complete=true,local="127.0.0.1",peer="127.0.0.1",port=Number(new URL(requestOrigin).port),method="POST",path=registrationPaths[operation],headers={},rawHeaders,body=JSON.stringify(input),aborted=false}={}) {
 const socket=tls?new TLSSocket():new Socket();
 for(const [name,value] of Object.entries({localAddress:local,remoteAddress:peer,localPort:port}))Object.defineProperty(socket,name,{value});
 if(tls){socket.getProtocol=()=>complete?"TLSv1.3":null;socket.getPeerFinished=()=>complete?Buffer.alloc(12,1):undefined;}
 const req=new IncomingMessage(socket);req.method=method;req.url=path;req.aborted=aborted;
 req.rawHeaders=rawHeaders??Object.entries({host:new URL(requestOrigin).host,origin:requestOrigin,"content-type":"application/json",...headers}).flat();
 // Model Next's mutated headers. They must never be used for peer/Origin/Host.
 req.headers={host:"forged.invalid",origin:"https://forged.invalid","x-forwarded-for":"203.0.113.9","x-forwarded-proto":"http"};
 req.push(body);req.push(null);
 const chunks=[],wire=new Map(),res=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done();}});
 res.setHeader=(k,v)=>wire.set(k.toLowerCase(),v);res.headers=wire;res.text=()=>Buffer.concat(chunks).toString();res.on("error",()=>{});
 return {req,res,close(){req.destroy();socket.destroy();}};
}
function fixture(overrides={}) {
 const f=fakeProduct({sessionAccess:true}),raw=f.client.$queryRaw;let factories=0,budget="allow";const keys=[];
 f.client.$queryRaw=async(parts,...values)=>{
  if(parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')){
   keys.push(values[0]);if(budget==="failure")throw new Error("private SQL diagnostic");return [{allowed:budget!=="deny",retryAfterSeconds:9}];
  }return raw(parts,...values);
 };
 const settings={...env,...overrides};
 const runtime=async()=>{factories++;return createDevelopmentRegistrationDispatcher(f.client,settings,key,{checkPassword:async()=>"not_found"});};
 const call=async(operation,options={})=>{
  const m=message(operation,{requestOrigin:settings.PRODUCT_SESSION_HTTP_ORIGIN,...options});
  try{await createNextRegistrationHandler(operation,{environment:()=>settings,runtime})(m.req,m.res);return m.res;}finally{m.close();}
 };
 return {...f,call,keys,factories:()=>factories,setBudget:value=>{budget=value;}};
}
test("all three actual Node API wrappers disable parsing and replace the conflicting App Router files",async()=>{
 for(const [file,operation] of [["signup","signup"],["verify-email","verify"],["resend-verification","resend"]]){
  const route=await import("../../pages/api/product-auth/"+file+".ts");assert.deepEqual(route.config,{api:{bodyParser:false}});
  assert.equal(existsSync(new URL("../../app/api/product-auth/"+file+"/route.ts",import.meta.url)),false);
  // Disabled actual wrapper cannot initialize a database runtime, even with an arbitrary request.
  const m=message(operation);const previous=process.env.NODE_ENV;process.env.NODE_ENV="production";
  try{await route.default(m.req,m.res);assert.equal(m.res.statusCode,404);assert.equal(m.res.headers.get("cache-control"),"no-store");}
  finally{m.close();if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
 }
});
test("default-off, production and missing local confirmation fail before constructing a runtime",async()=>development(async()=>{
 for(const [patch,status] of [[{ENABLE_PRODUCT_REGISTRATION_HTTP:undefined},404],[{NODE_ENV:"production"},404],[{PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined},503],[{PRODUCT_SESSION_HTTP_ORIGIN:"https://outside.invalid"},503]]) {
  const f=fixture(patch),r=await f.call("signup");assert.equal(r.statusCode,status);assert.equal(f.factories(),0);assert.equal(f.keys.length,0);
 }
}));
test("only completed direct TLS on the configured IPv4 loopback interface and port is accepted",async()=>development(async()=>{
 const f=fixture();
 for(const options of [{tls:false},{complete:false},{local:"0.0.0.0"},{local:"::1"},{peer:"203.0.113.9"},{peer:"127.0.0.2"},{port:3000},{aborted:true}])assert.ok((await f.call("signup",options)).statusCode>=400);
 assert.equal(f.factories(),0);assert.equal(f.keys.length,0);
}));
test("wire forwarding assertions, duplicate headers and ambiguous framing are rejected independently of Next headers",async()=>development(async()=>{
 const f=fixture();
 for(const key of ["forwarded","x-real-ip","x-forwarded-for","x-forwarded-proto","x-forwarded-host"])assert.equal((await f.call("signup",{headers:{[key]:"127.0.0.1"}})).statusCode,403);
 for(const rawHeaders of [["Host","127.0.0.1:3443","host","127.0.0.1:3443"],["Host","127.0.0.1:3443","Origin",origin,"origin",origin],["Host","127.0.0.1:3443","invalid header","x"]])assert.equal((await f.call("signup",{rawHeaders})).statusCode,400);
 for(const headers of [{"content-length":"2","transfer-encoding":"chunked"},{"content-length":"+2"},{"transfer-encoding":"gzip"},{upgrade:"websocket"},{expect:"100-continue"},{trailer:"x-test"}])assert.equal((await f.call("signup",{headers})).statusCode,400);
 assert.equal(f.factories(),0);
}));
test("exact routes, POST and wire Origin are mandatory, with no CORS or identity-header fallback",async()=>development(async()=>{
 const f=fixture();
 assert.equal((await f.call("signup",{headers:{host:"outside.invalid"}})).statusCode,404);
 assert.equal((await f.call("signup",{headers:{origin:"https://outside.invalid"}})).statusCode,403);
 assert.equal((await f.call("signup",{path:registrationPaths.signup+"/"})).statusCode,404);
 const wrong=await f.call("signup",{method:"OPTIONS"});assert.equal(wrong.statusCode,405);assert.equal(wrong.headers.get("allow"),"POST");assert.equal(wrong.headers.has("access-control-allow-origin"),false);
 assert.equal(f.factories(),0);
}));
test("bounded parsing rejects declared/streamed oversize, malformed JSON, encoding and query input",async()=>development(async()=>{
 const f=fixture();
 for(const [options,status] of [[{headers:{"content-length":"16385"}},413],[{body:"x".repeat(16385)},413],[{body:"{"},400],[{headers:{"content-type":"text/plain"}},415],[{headers:{"content-encoding":"gzip"}},415],[{path:registrationPaths.signup+"?unexpected=1"},400]])assert.equal((await f.call("signup",options)).statusCode,status);
 assert.equal(f.rows().user.length,0);
}));
test("real service flow through Node streams ignores Next header mutations and verifies without consent rows or sessions",async()=>development(async()=>{
 const f=fixture(),created=await f.call("signup");assert.equal(created.statusCode,202);assert.deepEqual(JSON.parse(created.text()),{accepted:true});assert.equal(created.headers.has("set-cookie"),false);
 const job=f.rows().emailOutbox[0],tools=createSecretTools({currentId:"v",keys:new Map([["v",verifier]])},{currentId:"m",keys:new Map([["m",outbox]])});
 const payload=tools.open(job,job);assert.equal((await f.call("resend",{body:JSON.stringify({email:payload.email})})).statusCode,202);assert.equal(f.rows().emailVerificationIssuance.length,1);
 const verified=await f.call("verify",{body:JSON.stringify(payload)});assert.equal(verified.statusCode,200);assert.deepEqual(JSON.parse(verified.text()),{verified:true});assert.equal(verified.headers.has("set-cookie"),false);
 assert.equal(f.rows().user[0].emailVerified,true);assert.equal(f.rows().termsVersion.length,0);assert.equal(f.rows().termsAcceptance.length,0);assert.equal(f.rows().session.length,0);
 assert.equal((await f.call("verify",{body:JSON.stringify(payload)})).statusCode,400);
 assert.ok(f.keys.every(k=>/^rl:v1:[a-f0-9]{64}$/u.test(k)));
 assert.ok(!created.text().includes(input.password));
}));
test("rate denial and storage failure remain fail-closed with safe responses and no registration",async()=>development(async()=>{
 const f=fixture();f.setBudget("deny");const limited=await f.call("signup");assert.equal(limited.statusCode,429);assert.equal(limited.headers.get("retry-after"),"9");
 f.setBudget("failure");const failed=await f.call("signup");assert.equal(failed.statusCode,503);assert.deepEqual(JSON.parse(failed.text()),{error:"registration_unavailable"});assert.equal(f.rows().user.length,0);assert.equal(failed.headers.has("set-cookie"),false);
}));

const httpSettings={PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:3000",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined};
test("explicit loopback HTTP signup, OTP rejection, resend cooldown and verification reuse the real service without sessions",async()=>development(async()=>{
 const f=fixture(httpSettings),a=await f.call("signup");assert.equal(a.statusCode,202);assert.equal(a.headers.has("set-cookie"),false);
 const job=f.rows().emailOutbox[0],mail=createSecretTools({currentId:"v",keys:new Map([["v",verifier]])},{currentId:"m",keys:new Map([["m",outbox]])}).open(job,job);
 const wrong=mail.otp==="000000"?"000001":"000000";
 assert.equal((await f.call("verify",{body:JSON.stringify({email:mail.email,otp:wrong})})).statusCode,400);
 assert.equal(f.rows().emailVerificationIssuance[0].failedAttempts,1);
 const count=f.rows().emailOutbox.length;
 assert.equal((await f.call("resend",{body:JSON.stringify({email:mail.email})})).statusCode,202);assert.equal(f.rows().emailOutbox.length,count);
 const verified=await f.call("verify",{body:JSON.stringify({email:mail.email,otp:mail.otp})});assert.equal(verified.statusCode,200);
 assert.equal(f.rows().user[0].emailVerified,true);assert.equal(f.rows().session.length,0);assert.equal(f.rows().termsAcceptance.length,0);
 assert.equal((await f.call("verify",{body:JSON.stringify({email:mail.email,otp:mail.otp})})).statusCode,400);assert.ok(f.keys.length>0);
}));
test("HTTP opt-in cannot enable production, a public bind/peer, forged forwarding, mismatched Host/Origin or ambiguous wire headers",async()=>development(async()=>{
 for(const patch of [{PRODUCT_LOCAL_HTTP_CONFIRMED:undefined},{NODE_ENV:"production"},{PRODUCT_SESSION_HTTP_ORIGIN:"http://192.0.2.1:3000"}]){
  const f=fixture({...httpSettings,...patch});assert.ok((await f.call("signup")).statusCode>=400);assert.equal(f.factories(),0);
 }
 const f=fixture(httpSettings);
 for(const options of [{local:"192.0.2.1"},{peer:"192.0.2.2"},{port:3001},{tls:true},{aborted:true},
  {headers:{host:"localhost:3000"}},{headers:{origin:"http://outside.invalid"}},{headers:{"x-forwarded-for":"127.0.0.1"}},
  {rawHeaders:["Host","127.0.0.1:3000","host","127.0.0.1:3000"]}])assert.ok((await f.call("signup",options)).statusCode>=400);
 assert.equal(f.factories(),0);
 const old=process.env.NODE_ENV;process.env.NODE_ENV="production";try{assert.equal((await f.call("signup")).statusCode,404);}finally{process.env.NODE_ENV=old;}
}));
test("HTTP development keeps body bounds, real shared-counter denials and storage failure closed",async()=>development(async()=>{
 const f=fixture(httpSettings);
 assert.equal((await f.call("signup",{body:"x".repeat(16385)})).statusCode,413);
 f.setBudget("deny");const denied=await f.call("signup");assert.equal(denied.statusCode,429);assert.equal(denied.headers.get("retry-after"),"9");
 f.setBudget("failure");assert.equal((await f.call("signup")).statusCode,503);assert.equal(f.rows().user.length,0);
}));

test("frontend signup reaches the mounted HTTP handler and real registration/OTP service; duplicate and failure responses stay honest",async()=>development(async()=>{
 const f=fixture(httpSettings),calls=[],local=httpSettings.PRODUCT_SESSION_HTTP_ORIGIN;
 const frontend=()=>createRegistrationController(createRegistrationClient({configuration:{origin:local,developmentConsentDeferred:true},currentOrigin:()=>local,
  fetch:async(path,options)=>{
   assert.equal(options.method,"POST");assert.equal(options.credentials,"same-origin");
   const operation=Object.keys(registrationPaths).find(op=>registrationPaths[op]===path);assert.ok(operation);calls.push(path);
   const result=await f.call(operation,{body:options.body});assert.equal(result.headers.has("set-cookie"),false);
   return new Response(result.text(),{status:result.statusCode,headers:new Headers(result.headers)});
  }}));
 const first=frontend();
 for(const bad of [{...input,name:" "},{...input,email:"invalid"},{...input,password:"\u{1f600}".repeat(11)}]){
  assert.equal(await first.signup(bad),false);assert.match(first.getSnapshot().message,/Check the information/u);
 }
 assert.equal(calls.length,0);assert.equal(f.rows().user.length,0);
 const valid={...input,password:" "+"\u{1f600}".repeat(10)+" "}; // Exactly 12 Unicode code points, preserving spaces.
 assert.equal(await first.signup(valid),true);assert.equal(first.getSnapshot().phase,"verification");assert.equal(calls[0],registrationPaths.signup);
 assert.equal(f.rows().user.length,1);assert.equal(f.rows().user[0].emailVerified,false);assert.equal(f.rows().session.length,0);
 assert.match(f.rows().account[0].password,/^\$argon2id\$/u);
 const originalHash=f.rows().account[0].password,duplicate=frontend();
 assert.equal(await duplicate.signup(valid),true);assert.equal(duplicate.getSnapshot().message,first.getSnapshot().message);
 assert.equal(f.rows().user.length,1);assert.equal(f.rows().account[0].password,originalHash);assert.equal(f.rows().emailOutbox.length,1);
 const job=f.rows().emailOutbox[0],payload=createSecretTools({currentId:"v",keys:new Map([["v",verifier]])},{currentId:"m",keys:new Map([["m",outbox]])}).open(job,job);
 assert.match(payload.otp,/^[0-9]{6}$/u);assert.equal(await first.verify(payload.otp),true);assert.equal(first.getSnapshot().phase,"verified");
 assert.match(first.getSnapshot().message,/Log in to continue/u);assert.equal(f.rows().user[0].emailVerified,true);assert.equal(f.rows().session.length,0);
 f.setBudget("failure");const unavailable=frontend();assert.equal(await unavailable.signup({...valid,email:"another@example.invalid"}),false);
 assert.match(unavailable.getSnapshot().message,/Signup could not be confirmed/u);assert.doesNotMatch(unavailable.getSnapshot().message,/Account creation is not available yet|private/u);
 assert.equal(unavailable.getSnapshot().phase,"signup");assert.equal(f.rows().user.length,1);
}));

test("the runtime configuration probe is rejected for cross-site metadata before any database or external call",async()=>development(async()=>{
 const f=fixture(httpSettings);
 f.client.$queryRaw=async()=>assert.fail("Probe must not query or spend counters");
 f.client.$transaction=async()=>assert.fail("Probe must not start registration");
 const result=await f.call("signup",{headers:{"sec-fetch-site":"cross-site"},body:"{}"});
 assert.equal(result.statusCode,403);assert.deepEqual(JSON.parse(result.text()),{error:"origin_not_allowed"});assert.equal(f.factories(),1);
 assert.equal(f.keys.length,0);assert.equal(f.rows().user.length,0);assert.equal(result.headers.has("set-cookie"),false);
}));

test("Next refuses a pre-UTC hot-reload cache instead of reusing or disconnecting its in-flight pool",async()=>development(async()=>{
 const previous=globalThis.__stitchtrackRegistration;
 const settings={...env,...httpSettings,PRODUCT_LOCAL_RATE_IDENTIFIER_KEY:key.toString("base64")};
 let touched=false;
 globalThis.__stitchtrackRegistration={url:new URL(settings.PRODUCT_TEST_DATABASE_URL).href,client:new Proxy({}, {get(){touched=true;throw new Error("Old pool must not be used or closed");}})};
 const m=message("signup",{requestOrigin:settings.PRODUCT_SESSION_HTTP_ORIGIN,headers:{"sec-fetch-site":"cross-site"},body:"{}"});
 try{
  await createNextRegistrationHandler("signup",{environment:()=>settings})(m.req,m.res);
  assert.equal(m.res.statusCode,503);assert.deepEqual(JSON.parse(m.res.text()),{error:"registration_unavailable"});assert.equal(touched,false);
 }finally{m.close();if(previous===undefined)delete globalThis.__stitchtrackRegistration;else globalThis.__stitchtrackRegistration=previous;}
}));
