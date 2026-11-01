// Real installed auth/crypto with database and socket/HTTP doubles. No PostgreSQL, SMTP or external requests.
import test from "node:test";
import assert from "node:assert/strict";
import {TLSSocket} from "node:tls";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {createRegistrationClient} from "../../lib/auth/registration-client.ts";
import {createRegistrationController} from "../../lib/auth/registration-controller.ts";
import {registrationPaths} from "../../lib/auth/registration-contract.ts";
const {createRegistrationService}=await import("../../lib/product-auth/registration.server.ts");
const {createSecretTools}=await import("../../lib/product-auth/secrets.server.ts");
const {sessionConnectionFromSocket}=await import("../../lib/product-auth/session-http.server.ts");
const {registrationHttpRequest}=await import("../../lib/product-auth/registration-http.server.ts");
const {verifyPassword}=await import("../../lib/auth/password.server.ts");
const origin="https://synthetic.example.invalid",terms={id:"synthetic-terms",version:"test-only",path:"/terms"};
const input={name:"Ọlá",email:" Synthetic@EXAMPLE.INVALID ",password:" Exact e\u0301 synthetic password ",termsVersionId:terms.id,termsAccepted:true};
async function setup() {
 const f=fakeProduct();let time=new Date();const calls=[];
 const verifierKeys={currentId:"test-verifier",keys:new Map([["test-verifier",Buffer.alloc(32,4)]])},outboxKeys={currentId:"test-outbox",keys:new Map([["test-outbox",Buffer.alloc(32,5)]])};
 await f.client.termsVersion.create({data:{id:terms.id,version:"synthetic-only",contentDigest:"test-only",immutableDocumentRef:"test-only",isTestFixture:true,approvedAt:null,effectiveAt:null}});
 const service=createRegistrationService(f.client,{mode:"test",allowSyntheticTerms:true,requiredTermsVersionId:terms.id,authSecret:"offline-synthetic-only-signing-secret",verifierKeys,outboxKeys,
  clock:()=>new Date(time),checkPassword:async()=>{assert.equal(f.inTransaction(),false);return "not_found";}});
 const socket=new TLSSocket();Object.defineProperty(socket,"remoteAddress",{value:"127.0.0.1"});socket.getProtocol=()=>"TLSv1.3";socket.getPeerFinished=()=>Buffer.alloc(12,1);
 const connection=sessionConnectionFromSocket(socket);
 const dependencies={origin,terms,connection:()=>connection,service,limits:{storage:"shared",consumeIp:async op=>{calls.push("ip:"+op);return {allowed:true,retryAfterSeconds:1};},consumeAccount:async(op,email)=>{calls.push("account:"+op+":"+email);return {allowed:true,retryAfterSeconds:1};}}};
 const request=(op,body,headers={})=>new Request(origin+registrationPaths[op],{method:"POST",headers:{host:new URL(origin).host,origin,"content-type":"application/json",...headers},body:JSON.stringify(body)});
 const call=(op,body,headers,dep=dependencies)=>registrationHttpRequest(request(op,body,headers),op,dep);
 const mail=()=>{const job=f.rows().emailOutbox.at(-1);return createSecretTools(verifierKeys,outboxKeys).open(job,job);};
 return {...f,service,dependencies,calls,call,request,mail,close:()=>socket.destroy(),advance:ms=>{time=new Date(time.getTime()+ms);}};
}
test("product boundary is default-inert and refuses forged metadata/CSRF before business logic",async()=>{
 const f=await setup();try {
  assert.equal((await registrationHttpRequest(f.request("signup",input),"signup")).status,404);
  for(const headers of [{origin:"https://outside.invalid"},{"x-forwarded-for":"127.0.0.1"},{"x-real-ip":"127.0.0.1"},{"sec-fetch-site":"cross-site"}])assert.equal((await f.call("signup",input,headers)).status,403);
  const bad={...f.dependencies,connection:()=>({...f.dependencies.connection()})};assert.equal((await f.call("signup",input,{},bad)).status,503);
  assert.equal(f.rows().user.length,0);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test("boundary validates all schemas and both shared budgets before calling registration",async()=>{
 const f=await setup();try{
  for(const patch of [{name:" \u2003"},{password:"short"},{termsAccepted:false},{termsVersionId:"other"},{extra:"private"}])assert.equal((await f.call("signup",{...input,...patch})).status,422);
  assert.equal(f.rows().user.length,0);
  f.dependencies.limits.consumeIp=async()=>({allowed:false,retryAfterSeconds:9});let r=await f.call("signup",input);assert.equal(r.status,429);assert.equal(r.headers.get("retry-after"),"9");
  f.dependencies.limits.consumeIp=async()=>{throw new Error("private storage error");};assert.equal((await f.call("signup",input)).status,503);
  f.dependencies.limits.consumeIp=async()=>({allowed:true,retryAfterSeconds:1});f.dependencies.limits.consumeAccount=async()=>({allowed:false,retryAfterSeconds:12});r=await f.call("signup",input);assert.equal(r.status,429);
  assert.equal(f.rows().user.length,0);
 }finally{f.close();}
});
test("browser signup and duplicate signup have identical neutral responses without replacing credentials or creating sessions",async()=>{
 const f=await setup();try {
  const first=await f.call("signup",input),hash=f.rows().account[0].password,duplicate=await f.call("signup",{...input,password:" Different synthetic password "});
  assert.equal(first.status,202);assert.equal(duplicate.status,202);assert.deepEqual(await first.json(),await duplicate.json());
  assert.equal(f.rows().user.length,1);assert.equal(f.rows().account.length,1);assert.equal(f.rows().account[0].password,hash);assert.equal(f.rows().emailOutbox.length,1);assert.equal(f.rows().session.length,0);
  assert.equal(await verifyPassword({password:input.password,hash}),true);assert.equal(await verifyPassword({password:input.password.trim(),hash}),false);
 }finally{f.close();}
});
test("client/controller reaches real registration and current OTP service through the boundary, without a session",async()=>{
 const f=await setup();try {
  const client=createRegistrationClient({configuration:{origin,terms},currentOrigin:()=>origin,fetch:async(path,options)=>{
   assert.equal(options.credentials,"same-origin");const op=Object.keys(registrationPaths).find(k=>registrationPaths[k]===path);return f.call(op,JSON.parse(options.body));
  }}),controller=createRegistrationController(client);
  assert.equal(await controller.signup(input),true);assert.equal(controller.getSnapshot().phase,"verification");assert.equal(f.rows().user[0].emailVerified,false);
  assert.equal(await controller.verify(f.mail().otp),true);assert.equal(controller.getSnapshot().phase,"verified");assert.equal(f.rows().user[0].emailVerified,true);assert.equal(f.rows().session.length,0);
  assert.equal((await f.call("verify",{email:input.email,otp:f.mail().otp})).status,400);
 }finally{f.close();}
});
test("latest-issuance verification preserves leading zeros, expiry, three attempts and resend cooldown",async()=>{
 const f=await setup();try {
  await f.call("signup",input);const initial=f.mail(),wrong=initial.otp==="000000"?"000001":"000000";
  for(let i=1;i<=3;i++){assert.equal((await f.call("verify",{email:input.email,otp:wrong})).status,400);assert.equal(f.rows().emailVerificationIssuance[0].failedAttempts,i);}
  assert.equal((await f.call("verify",initial)).status,400);
  assert.equal((await f.call("resend",{email:input.email})).status,202);assert.equal(f.rows().emailOutbox.length,1);
  f.advance(60000);assert.equal((await f.call("resend",{email:input.email})).status,202);assert.equal(f.rows().emailOutbox.length,2);
  const newer=f.mail(),wrongNew=newer.otp==="000000"?"111111":"000000";assert.equal((await f.call("verify",{...newer,otp:wrongNew})).status,400);f.advance(300001);assert.equal((await f.call("verify",newer)).status,400);assert.equal(f.rows().session.length,0);
 }finally{f.close();}
});
test("unknown and existing resend requests remain neutral; provider/DB errors are sanitized",async()=>{
 const f=await setup();try{
  await f.call("signup",input);const a=await f.call("resend",{email:input.email}),b=await f.call("resend",{email:"unknown@example.invalid"});assert.equal(a.status,b.status);assert.deepEqual(await a.json(),await b.json());
  f.dependencies.service={...f.service,beginSignup:async()=>{throw new Error("private password/provider failure");}};
  const r=await f.call("signup",input);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"registration_unavailable"});assert.equal(r.headers.has("set-cookie"),false);
 }finally{f.close();}
});

test("ordinary storage failure remains unavailable for an existing email; no duplicate reconciliation retry",async()=>{
 const f=await setup();try {
  await f.call("signup",input);const original=f.client.$transaction;let calls=0;
  f.client.$transaction=async(...args)=>{calls++;if(calls===1)throw new Error("private storage failure");return original(...args);};
  const response=await f.call("signup",input);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"registration_unavailable"});assert.equal(calls,1);
  assert.equal(f.rows().user.length,1);assert.equal(f.rows().account.length,1);assert.equal(f.rows().session.length,0);
 }finally{f.close();}
});
