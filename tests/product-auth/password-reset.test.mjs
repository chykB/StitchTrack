// Actual installed Better Auth/Argon2id; injected database only. No PostgreSQL/SMTP/HIBP.
import test from "node:test";
import assert from "node:assert/strict";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {createPasswordResetService,RESET_STAGES}=await import("../../lib/product-auth/password-reset.server.ts");
const {createSecretTools}=await import("../../lib/product-auth/secrets.server.ts");
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {hashPassword,verifyPassword}=await import("../../lib/auth/password.server.ts");
const oldPassword=" Original synthetic password ",newPassword=" New synthetic e\u0301 password ",email="reset@example.invalid";
const verifierKeys={currentId:"v",keys:new Map([["v",Buffer.alloc(32,1)]])},outboxKeys={currentId:"o",keys:new Map([["o",Buffer.alloc(32,2)]])};
const base={authSecret:"offline-reset-auth-secret-at-least-32-characters",verifierKeys,outboxKeys,checkPassword:async()=>"not_found"};
const oldHash=await hashPassword(oldPassword);
const previous=process.env.NODE_ENV;process.env.NODE_ENV="test";test.after(()=>{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;});
export async function resetFixture(options={}){
 const f=fakeProduct({sessionAccess:true});let time=new Date();
 await f.client.user.create({data:{id:"reset-user",email,name:"Synthetic reset tailor",emailVerified:true,...options.user}});
 if(!options.passwordless)await f.client.account.create({data:{id:"reset-account",userId:"reset-user",accountId:"reset-user",providerId:"credential",password:oldHash}});
 const config={...base,clock:()=>new Date(time),...options.config};
 const service=createPasswordResetService(f.client,config),tools=createSecretTools(verifierKeys,outboxKeys);
 return {...f,service,config,advance:ms=>{time=new Date(+time+ms);},mail:()=>{const row=f.rows().emailOutbox.at(-1);return tools.open(row,row);},
  sessions:createSessionService(f.client,{mode:"test",authSecret:base.authSecret,sessionTokenKey:Buffer.alloc(32,3),expiresInSeconds:604800,renewal:"none"})};
}
const cookie=r=>new Headers({cookie:r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});
test("request/check/complete use real library; preserve password, revoke two signed sessions, require fresh login",async()=>{
 const f=await resetFixture();const a=await f.sessions.login({email,password:oldPassword}),b=await f.sessions.login({email,password:oldPassword});
 await f.service.request({email:" RESET@EXAMPLE.INVALID "});const mail=f.mail();
 assert.equal(f.rows().user.length,1);assert.equal(f.rows().account.length,1);assert.equal(f.rows().emailVerificationIssuance[0].purpose,"password-reset");
 assert.equal(await f.service.check(mail),true);assert.equal(f.rows().emailVerificationIssuance[0].consumedAt,null);assert.equal(f.rows().session.length,2);
 assert.equal(await f.service.complete({...mail,password:newPassword}),true);
 assert.equal(await verifyPassword({password:newPassword,hash:f.rows().account[0].password}),true);
 assert.equal(await verifyPassword({password:newPassword.trim(),hash:f.rows().account[0].password}),false);
 assert.equal(await verifyPassword({password:newPassword.normalize("NFC"),hash:f.rows().account[0].password}),false);
 assert.equal(f.rows().session.length,0);assert.equal((await f.sessions.lookup(cookie(a))).session,null);assert.equal((await f.sessions.lookup(cookie(b))).session,null);
 assert.ok(f.rows().emailVerificationIssuance[0].consumedAt);assert.equal(f.rows().emailOutbox[0].status,"cancelled");
 assert.equal(await f.service.complete({...mail,password:newPassword}),false);assert.equal(await f.service.check(mail),false);
 await assert.rejects(f.sessions.login({email,password:oldPassword}));await f.sessions.login({email,password:newPassword});assert.equal(f.rows().session.length,1);
});
test("unknown, passwordless, unverified, disabled and deletion-locked requests create no credential or mail",async()=>{
 for(const options of [{passwordless:true},{user:{emailVerified:false}},{user:{disabledAt:new Date()}},{user:{deletionRequestedAt:new Date()}}]){
  const f=await resetFixture(options),count=f.rows().account.length;
  assert.equal(await f.service.request({email}),undefined);assert.equal(await f.service.check({email,otp:"000000"}),false);
  assert.equal(await f.service.complete({email,otp:"000000",password:newPassword}),false);assert.equal(f.rows().account.length,count);assert.equal(f.rows().emailOutbox.length,0);
 }
 const f=await resetFixture();await f.service.request({email:"unknown@example.invalid"});assert.equal(f.rows().emailOutbox.length,0);
});
test("three wrong attempts commit across check and completion, cooldown and reissue invalidate old code",async()=>{
 const f=await resetFixture();await f.service.request({email});const mail=f.mail(),wrong={email,otp:mail.otp==="000000"?"000001":"000000"};
 assert.equal(await f.service.check(wrong),false);assert.equal(await f.service.complete({...wrong,password:newPassword}),false);assert.equal(await f.service.check(wrong),false);
 assert.equal(f.rows().emailVerificationIssuance[0].failedAttempts,3);assert.equal(await f.service.check(mail),false);
 await f.service.request({email});assert.equal(f.rows().emailOutbox.length,1);f.advance(60001);await f.service.request({email});
 assert.equal(f.rows().emailOutbox.length,2);assert.ok(f.rows().emailVerificationIssuance[0].supersededAt);assert.equal(await f.service.check(mail),false);
 f.advance(300001);assert.equal(await f.service.check(f.mail()),false);assert.equal(f.rows().account[0].password,oldHash);
});
test("required-write faults roll back credential, OTP consumption and all-session revocation together",async()=>{
 for(const stage of RESET_STAGES){
  const f=await resetFixture(),reached=[];
  if(["verification","issuance","outbox"].includes(stage)){
   const service=createPasswordResetService(f.client,{...f.config,testFault:stage,testObserver:s=>reached.push(s)});await assert.rejects(service.request({email}));assert.equal(f.rows().emailOutbox.length,0);assert.equal(f.rows().verification.length,0);
  }else{
   await f.service.request({email});const mail=f.mail();await f.sessions.login({email,password:oldPassword});
   const service=createPasswordResetService(f.client,{...f.config,testFault:stage,testObserver:s=>reached.push(s)});await assert.rejects(service.complete({...mail,password:newPassword}));
   assert.equal(f.rows().account[0].password,oldHash);assert.equal(f.rows().session.length,1);assert.equal(f.rows().emailVerificationIssuance[0].consumedAt,null);assert.equal(f.rows().verification.length,1);
  }
  assert.ok(reached.includes(stage),"Injection must reach the actual write stage");
 }
});
test("new password schema and fail-closed breach prerequisite precede credential writes",async()=>{
 const f=await resetFixture();await f.service.request({email});const mail=f.mail();
 for(const password of ["x".repeat(11)," ".repeat(12),"x".repeat(12)+"\n"]){await assert.rejects(f.service.complete({...mail,password}));}
 const unavailable=createPasswordResetService(f.client,{...f.config,checkPassword:async()=>"unavailable"});await assert.rejects(unavailable.complete({...mail,password:newPassword}));
 assert.equal(f.rows().account[0].password,oldHash);assert.equal(f.rows().emailVerificationIssuance[0].consumedAt,null);
});

test("no secret or provider error is logged, signup-purpose codes cannot reset and uncertain commit is never success",async t=>{
 const logs=[];for(const method of ["log","warn","error","info","debug"])t.mock.method(console,method,(...args)=>logs.push(args));
 const f=await resetFixture();await f.service.request({email});const mail=f.mail();
 f.rows().emailVerificationIssuance[0].purpose="email-verification";assert.equal(await f.service.check(mail),false);assert.equal(await f.service.complete({...mail,password:newPassword}),false);
 f.rows().emailVerificationIssuance[0].purpose="password-reset";
 const original=f.client.$transaction;f.client.$transaction=async callback=>{await original(callback);throw new Error("Synthetic lost commit acknowledgement");};
 await assert.rejects(f.service.complete({...mail,password:newPassword}),error=>error.code==="reset_unavailable"&&!error.cause);
 assert.deepEqual(logs,[]);assert.equal(f.rows().session.length,0); // No auto-login even if commit was actually successful.
});
