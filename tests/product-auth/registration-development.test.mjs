// Offline only: actual route handlers/Better Auth/Argon2id with DB, socket and breach-check doubles.
import test from "node:test";
import assert from "node:assert/strict";
import {TLSSocket} from "node:tls";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {createRegistrationClient} from "../../lib/auth/registration-client.ts";
import {createRegistrationController} from "../../lib/auth/registration-controller.ts";
import {registrationPaths} from "../../lib/auth/registration-contract.ts";
const {createDevelopmentRegistrationDispatcher}=await import("../../lib/product-auth/registration-development.server.ts");
const {verifyPassword}=await import("../../lib/auth/password.server.ts");
const {createSecretTools}=await import("../../lib/product-auth/secrets.server.ts");
const {createRegistrationService}=await import("../../lib/product-auth/registration.server.ts");
const {sessionConnectionFromSocket}=await import("../../lib/product-auth/session-http.server.ts");
const {DEVELOPMENT_VERIFICATION_TEMPLATE}=await import("../../lib/product-auth/development-policy.ts");
const key=Buffer.alloc(32,7),verifierKeys={currentId:"v",keys:new Map([["v",Buffer.alloc(32,1)]])},outboxKeys={currentId:"m",keys:new Map([["m",Buffer.alloc(32,2)]])};
const origin="https://127.0.0.1:3443",input={name:"Synthetic tailor",email:" Synthetic@EXAMPLE.INVALID ",password:" Exact synthetic password "};
const policies=Object.fromEntries(["signup","verify-email","resend-verification"].map(op=>[op,{version:"local-dev-"+op,account:{capacity:10,refillIntervalMs:60000},ip:{capacity:20,refillIntervalMs:1000}}]));
const env={NODE_ENV:"development",ENABLE_PRODUCT_REGISTRATION_HTTP:"true",PRODUCT_DEVELOPMENT_CONSENT_DEFERRED:"true",PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED:"true",PRODUCT_REGISTRATION_RATE_POLICIES:JSON.stringify(policies),
 PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_SESSION_HTTP_ORIGIN:origin,PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-development-signing-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,8).toString("base64"),
 PRODUCT_EMAIL_VERIFIER_KEY_ID:"v",PRODUCT_EMAIL_VERIFIER_KEY:Buffer.alloc(32,1).toString("base64"),PRODUCT_EMAIL_OUTBOX_KEY_ID:"m",PRODUCT_EMAIL_OUTBOX_KEY:Buffer.alloc(32,2).toString("base64")};
async function withDev(fn){const old=process.env.NODE_ENV,flag=process.env.ENABLE_PRODUCT_REGISTRATION_HTTP;process.env.NODE_ENV="development";process.env.ENABLE_PRODUCT_REGISTRATION_HTTP="true";
 try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;if(flag===undefined)delete process.env.ENABLE_PRODUCT_REGISTRATION_HTTP;else process.env.ENABLE_PRODUCT_REGISTRATION_HTTP=flag;}}
const request=(operation,data,headers={})=>new Request(origin+registrationPaths[operation],{method:"POST",headers:{host:"127.0.0.1:3443",origin,"content-type":"application/json",...headers},body:JSON.stringify(data)});
function transport(){const socket=new TLSSocket();Object.defineProperty(socket,"remoteAddress",{value:"127.0.0.1"});socket.getProtocol=()=>"TLSv1.3";socket.getPeerFinished=()=>Buffer.alloc(12,1);return {socket,connection:sessionConnectionFromSocket(socket)};}
function database(){const f=fakeProduct({sessionAccess:true}),raw=f.client.$queryRaw;let failure=false;const budgets=[];
 f.client.$queryRaw=async(parts,...values)=>{if(parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')){budgets.push(values[0]);if(failure)throw new Error("private store failure");return [{allowed:true,retryAfterSeconds:1}];}return raw(parts,...values);};
 return {...f,budgets,fail:()=>{failure=true;}};
}
test("dispatcher refuses fabricated metadata rather than trusting headers",async()=>withDev(async()=>{
 const f=database(),dispatch=createDevelopmentRegistrationDispatcher(f.client,env,key,{checkPassword:async()=>"not_found"});
 await assert.rejects(dispatch(request("signup",input),"signup",{secure:true,peerAddress:"127.0.0.1"}));assert.equal(f.rows().user.length,0);
}));
test("development dispatcher requires explicit consent/targets/policies/keys and fails before IO on bad config",async()=>withDev(async()=>{
 const f=database();
 for(const patch of [{PRODUCT_DEVELOPMENT_CONSENT_DEFERRED:undefined},{PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED:undefined},{PRODUCT_REGISTRATION_RATE_POLICIES:"{}"},{PRODUCT_DATABASE_MODE:"development"},
  {PRODUCT_EMAIL_OUTBOX_KEY:env.PRODUCT_EMAIL_VERIFIER_KEY},{PRODUCT_EMAIL_OUTBOX_KEY:env.PRODUCT_SESSION_TOKEN_KEY},{PRODUCT_SESSION_HTTP_ORIGIN:"https://outside.invalid"}])assert.throws(()=>createDevelopmentRegistrationDispatcher(f.client,{...env,...patch},key));
 assert.equal(f.rows().user.length,0);
}));
test("mounted handler flow creates real unverified identity/outbox without any Terms rows, then verifies without a session",async()=>withDev(async()=>{
 const f=database(),t=transport(),dispatch=createDevelopmentRegistrationDispatcher(f.client,env,key,{checkPassword:async()=>"not_found"});
 try {
  const c=createRegistrationClient({configuration:{origin,developmentConsentDeferred:true},currentOrigin:()=>origin,fetch:async(path,options)=>{
   const op=Object.keys(registrationPaths).find(op=>registrationPaths[op]===path);return dispatch(request(op,JSON.parse(options.body)),op,t.connection);
  }}),controller=createRegistrationController(c);
  assert.equal(await controller.signup(input),true);assert.equal(f.rows().user.length,1);assert.equal(f.rows().user[0].emailVerified,false);
  assert.equal(await verifyPassword({password:input.password,hash:f.rows().account[0].password}),true);
  assert.equal(await verifyPassword({password:input.password.trim(),hash:f.rows().account[0].password}),false);
  assert.equal(f.rows().termsVersion.length,0);assert.equal(f.rows().termsAcceptance.length,0);assert.equal(f.rows().session.length,0);
  const job=f.rows().emailOutbox[0];assert.equal(job.templateVersion,DEVELOPMENT_VERIFICATION_TEMPLATE);
  const mail=createSecretTools(verifierKeys,outboxKeys).open(job,job);
  assert.equal(await controller.verify(mail.otp),true);assert.equal(f.rows().user[0].emailVerified,true);assert.equal(f.rows().session.length,0);assert.ok(f.budgets.length>=4);
  assert.equal((await dispatch(request("verify",{email:mail.email,otp:mail.otp}),"verify",t.connection)).status,400);
 }finally{t.socket.destroy();}
}));
test("deferred flow still rejects forged Origin, fictitious consent, breached password and unavailable shared counters",async()=>withDev(async()=>{
 const f=database(),t=transport();let breached=false;
 const dispatch=createDevelopmentRegistrationDispatcher(f.client,env,key,{checkPassword:async()=>breached?"breached":"not_found"});
 try {
  assert.equal((await dispatch(request("signup",input,{origin:"https://outside.invalid"}),"signup",t.connection)).status,403);
  assert.equal((await dispatch(request("signup",{...input,termsAccepted:true,termsVersionId:"invented"}),"signup",t.connection)).status,422);
  breached=true;assert.equal((await dispatch(request("signup",input),"signup",t.connection)).status,503);breached=false;
  f.fail();assert.equal((await dispatch(request("signup",input),"signup",t.connection)).status,503);assert.equal(f.rows().user.length,0);
 }finally{t.socket.destroy();}
}));
test("development consent exception cannot be constructed in production or leak into the ordinary Terms-required service",async()=>{
 const f=fakeProduct(),config={mode:"test",allowSyntheticTerms:false,authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,verifierKeys,outboxKeys,checkPassword:async()=>"not_found",deferConsentInDevelopment:true};
 const old=process.env.NODE_ENV;process.env.NODE_ENV="production";try{assert.throws(()=>createRegistrationService(f.client,config));}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
 await withDev(async()=>{const ordinary=createRegistrationService(f.client,{...config,deferConsentInDevelopment:false,requiredTermsVersionId:"required"});await assert.rejects(ordinary.register(input));assert.equal(f.rows().user.length,0);});
});


test("deferred registration rolls back every actual write stage without creating fictitious acceptance",async()=>withDev(async()=>{
 for(const testFault of ["user","account","verification","issuance","outbox"]) {
  const f=fakeProduct(),service=createRegistrationService(f.client,{mode:"test",allowSyntheticTerms:false,deferConsentInDevelopment:true,
   authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,verifierKeys,outboxKeys,checkPassword:async()=>"not_found",testFault});
  await assert.rejects(service.beginSignup(input));assert.ok(Object.values(f.rows()).every(rows=>rows.length===0));
 }
}));

test("development diagnostics use only fixed stages and safe connection categories, never exception/configuration values",async()=>{
 const {reportRegistrationFailure}=await import("../../lib/product-auth/secrets.server.ts"),lines=[],old=console.error,previous=process.env.NODE_ENV;
 const secret="synthetic-password-and-OTP-do-not-print",sensitive={code:"ECONNREFUSED",message:secret,connectionString:secret,token:secret};
 console.error=(...args)=>lines.push(args);
 try{
  process.env.NODE_ENV="development";
  reportRegistrationFailure("rate_limit_ip",sensitive);
  reportRegistrationFailure("registration_execution",new Error(secret));
  reportRegistrationFailure(secret,sensitive);
  assert.deepEqual(lines,[["[StitchTrack registration] failure_stage=rate_limit_ip category=database_connection"],["[StitchTrack registration] failure_stage=registration_execution"]]);
  const {ProductConfigurationError}=await import("../../prisma/product/targets.ts");
  reportRegistrationFailure("database_target_configuration",new ProductConfigurationError("database_url_missing"));
  assert.deepEqual(lines[2],["[StitchTrack registration] failure_stage=database_target_configuration reason=database_url_missing"]);
  const changed=new ProductConfigurationError();changed.reason=secret;reportRegistrationFailure("database_target_configuration",changed);
  assert.deepEqual(lines[3],["[StitchTrack registration] failure_stage=database_target_configuration"]);
  for(const mode of ["production","test"]){process.env.NODE_ENV=mode;reportRegistrationFailure("registration_execution",sensitive);}
  assert.equal(lines.length,4);assert.ok(!JSON.stringify(lines).includes(secret));
 }finally{console.error=old;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
