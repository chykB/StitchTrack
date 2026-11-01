// Offline origin/config/fetch doubles. No browser, network, listener or database.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LOCAL_SESSION_ORIGIN,localFrontendSessionOrigin,localFrontendRegistrationConfiguration,createLocalSessionClient} from "../../lib/auth/local-session.ts";
const env={NODE_ENV:"production",ENABLE_LOCAL_AUTH_FRONTEND:"true",PRODUCT_SINGLE_ORIGIN_CONFIRMED:"true",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:LOCAL_SESSION_ORIGIN};
const user={id:"local-synthetic",name:"Synthetic tailor",email:"synthetic@example.invalid"};
test("normal production-built Next can opt into local UI only, with all flags and exact TLS Host",()=>{
 assert.equal(localFrontendSessionOrigin(env,"127.0.0.1:3443"),LOCAL_SESSION_ORIGIN);
 assert.equal(localFrontendSessionOrigin({},"127.0.0.1:3443"),undefined);
 for(const patch of [{ENABLE_LOCAL_AUTH_FRONTEND:undefined},{PRODUCT_SINGLE_ORIGIN_CONFIRMED:undefined},{PRODUCT_DATABASE_MODE:"development"},
  {PRODUCT_DATABASE_CONFIRMED:undefined},{ENABLE_PRODUCT_SESSION_HTTP:"true"},{PRODUCT_SESSION_HTTP_ORIGIN:"https://outside.invalid"}])assert.equal(localFrontendSessionOrigin({...env,...patch},"127.0.0.1:3443"),undefined);
 for(const host of [null,"127.0.0.1:3000","localhost:3443","outside.invalid"])assert.equal(localFrontendSessionOrigin(env,host),undefined);
});
test("local composition rejects HTTP, absent location and other origins before any request",async()=>{
 let calls=0;
 for(const current of [undefined,"http://127.0.0.1:3443","http://127.0.0.1:3000","https://outside.invalid"]) {
  const client=createLocalSessionClient(LOCAL_SESSION_ORIGIN,{currentOrigin:()=>current,fetch:async()=>{calls++;throw new Error();}});
  for(const result of [await client.login({email:user.email,password:"x"}),await client.session(),await client.logout()])assert.deepEqual(result,{ok:false,kind:"disabled"});
 }
 assert.equal(calls,0);assert.equal(createLocalSessionClient(undefined).enabled,false);assert.equal(createLocalSessionClient("https://outside.invalid").enabled,false);
});
test("enabled local UI keeps relative same-origin requests and exact passwords through login, lookup and logout",async()=>{
 const calls=[],password=" Exact synthetic e\u0301 password ";
 const client=createLocalSessionClient(LOCAL_SESSION_ORIGIN,{currentOrigin:()=>LOCAL_SESSION_ORIGIN,fetch:async(path,options)=>{
  calls.push({path,options});return Response.json(path.endsWith("/session")?{user,expiresAt:new Date(Date.now()+60000).toISOString()}:path.endsWith("/logout")?{loggedOut:true}:{user});
 }});
 assert.equal((await client.login({email:" Synthetic@EXAMPLE.INVALID ",password})).ok,true);assert.equal((await client.session()).data.user.id,user.id);assert.equal((await client.logout()).ok,true);
 assert.deepEqual(calls.map(x=>x.path),["/api/internal/tailor-session/login","/api/internal/tailor-session/session","/api/internal/tailor-session/logout"]);
 assert.equal(JSON.parse(calls[0].options.body).password,password);assert.equal(JSON.parse(calls[0].options.body).email,user.email);
 assert.ok(calls.every(x=>x.options.credentials==="same-origin"));
});
test("server page passes only the nonsecret local origin to existing login composition; Signup/Reset stay unavailable",()=>{
 const source=file=>readFileSync(new URL("../../"+file,import.meta.url),"utf8");
 assert.ok(source("app/(auth)/auth/page.tsx").includes('mode === "login" ? localFrontendSessionOrigin'));
 assert.ok(source("app/(auth)/auth/AuthScreen.tsx").includes('localSessionOrigin={mode === "login" ? localSessionOrigin : undefined}'));
 assert.ok(source("app/(auth)/_components/AuthForm.tsx").includes('createLocalSessionClient(mode === "login" ? localSessionOrigin : undefined)'));
 for(const op of ["login","session","logout"])assert.ok(source("pages/api/internal/tailor-session/"+op+".ts").includes("createNextSessionHandler"));
});


test("registration presentation opt-in requires all explicit local flags and exact Host",()=>{
 const flags={...env,ENABLE_PRODUCT_REGISTRATION_HTTP:"true",PRODUCT_DEVELOPMENT_CONSENT_DEFERRED:"true",PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED:"true"};
 assert.deepEqual(localFrontendRegistrationConfiguration(flags,"127.0.0.1:3443"),{origin:LOCAL_SESSION_ORIGIN,developmentConsentDeferred:true});
 for(const name of ["ENABLE_PRODUCT_REGISTRATION_HTTP","PRODUCT_DEVELOPMENT_CONSENT_DEFERRED","PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED"])assert.equal(localFrontendRegistrationConfiguration({...flags,[name]:undefined},"127.0.0.1:3443"),undefined);
 assert.equal(localFrontendRegistrationConfiguration(flags,"127.0.0.1:3000"),undefined);
 assert.equal(localFrontendRegistrationConfiguration({},"127.0.0.1:3443"),undefined);
});


test("direct Next local UI accepts only confirmed development session transport and a valid run namespace",()=>{
 const flags={...env,NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SINGLE_ORIGIN_RUN_ID:"b12fc98d-905c-4f0b-a0f6-b9b721869d1d"};
 assert.equal(localFrontendSessionOrigin(flags,"127.0.0.1:3443"),LOCAL_SESSION_ORIGIN);
 for(const patch of [{NODE_ENV:"production"},{PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined},{PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:undefined},{PRODUCT_SINGLE_ORIGIN_RUN_ID:undefined},{PRODUCT_SINGLE_ORIGIN_RUN_ID:"not-a-run"}])assert.equal(localFrontendSessionOrigin({...flags,...patch},"127.0.0.1:3443"),undefined);
});

test("HTTP frontend activation requires explicit development opt-in, exact Host and existing shared-rate configuration",async()=>{
 const flags={...env,NODE_ENV:"development",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:"http://localhost:3000",ENABLE_PRODUCT_SESSION_HTTP:"true",
  PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SINGLE_ORIGIN_RUN_ID:"b12fc98d-905c-4f0b-a0f6-b9b721869d1d",PRODUCT_SINGLE_ORIGIN_CONFIRMED:undefined,
  ENABLE_PRODUCT_REGISTRATION_HTTP:"true",PRODUCT_DEVELOPMENT_CONSENT_DEFERRED:"true",PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED:"true"};
 assert.equal(localFrontendSessionOrigin(flags,"localhost:3000"),flags.PRODUCT_SESSION_HTTP_ORIGIN);
 assert.deepEqual(localFrontendRegistrationConfiguration(flags,"localhost:3000"),{origin:flags.PRODUCT_SESSION_HTTP_ORIGIN,developmentConsentDeferred:true});
 for(const patch of [{NODE_ENV:"production"},{PRODUCT_LOCAL_HTTP_CONFIRMED:undefined},{PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:undefined},{PRODUCT_SINGLE_ORIGIN_RUN_ID:undefined}])
  assert.equal(localFrontendSessionOrigin({...flags,...patch},"localhost:3000"),undefined);
 assert.equal(localFrontendSessionOrigin(flags,"127.0.0.1:3000"),undefined);
 let calls=0;const client=createLocalSessionClient(flags.PRODUCT_SESSION_HTTP_ORIGIN,{currentOrigin:()=>flags.PRODUCT_SESSION_HTTP_ORIGIN,fetch:async()=>{calls++;return Response.json({user});}});
 assert.equal((await client.login({email:user.email,password:" Exact password "})).ok,true);assert.equal(calls,1);
});
