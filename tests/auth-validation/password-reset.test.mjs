import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {createAuthFlowStore} from "../../lib/auth/auth-flow-store.ts";
import {createPasswordResetClient} from "../../lib/auth/password-reset-client.ts";
const {submitAuthForm}=await import("../../app/(auth)/_components/AuthForm.tsx");
const {default:PasswordResetForm}=await import("../../app/(auth)/_components/PasswordResetForm.tsx");
import {createSessionClient} from "../../lib/auth/session-client.ts";
import {createSessionController} from "../../lib/auth/session-controller.ts";
const origin="http://127.0.0.1:3000";
test("failed login email reaches reset request state, is editable and is never put in URL/storage",async()=>{
 const store=createAuthFlowStore(),email=" Failed@EXAMPLE.INVALID ";
 const controller=createSessionController(createSessionClient({enabled:true,fetch:async()=>Response.json({error:"invalid_credentials"},{status:401})}));
 const fields={email:{value:email},password:{value:"wrong"}};const event={preventDefault(){},currentTarget:{elements:{namedItem:key=>fields[key]}}};
 assert.equal(await submitAuthForm(event,true,"login",false,()=>{},controller,store.getState().rememberEmail),false);
 assert.equal(store.getState().email,email);
 const html=renderToStaticMarkup(createElement(PasswordResetForm,{store:createAuthFlowStore(store.getState().email),origin}));assert.ok(html.includes('value="'+email+'"'));assert.match(html,/Email address/);assert.match(html,/role="status"/);assert.match(html,/<fieldset[^>]*disabled/);
 store.getState().rememberEmail(" Edited@EXAMPLE.INVALID ");assert.equal(store.getState().email," Edited@EXAMPLE.INVALID ");
 const screen=readFileSync(new URL("../../app/(auth)/auth/AuthScreen.tsx",import.meta.url),"utf8");assert.match(screen,/href="\/auth\?reset"/);assert.doesNotMatch(screen,/reset.*email=/);
});
test("real Zustand state carries editable email through all three requests, stores no password/code and clears on completion",async()=>{
 const store=createAuthFlowStore("first@example.invalid"),calls=[];store.getState().rememberEmail(" Edited@EXAMPLE.INVALID ");
 const client=createPasswordResetClient(origin,async(path,options)=>{assert.equal(options.credentials,"same-origin");calls.push([path,JSON.parse(options.body)]);
  return Response.json(path.endsWith("request")?{accepted:true}:path.endsWith("check")?{valid:true}:{reset:true},{status:path.endsWith("request")?202:200});},()=>origin);
 assert.deepEqual(await client.send("request",{email:store.getState().email}),{ok:true});store.getState().step("code");
 assert.deepEqual(await client.send("check",{email:store.getState().email,otp:"004281"}),{ok:true});store.getState().step("password");
 const password=" Exact synthetic password ";assert.deepEqual(await client.send("complete",{email:store.getState().email,otp:"004281",password}),{ok:true});
 assert.equal(new Set(calls.map(c=>c[1].email)).size,1);assert.equal(calls[2][1].password,password);assert.equal(calls[2][1].otp,"004281");
 assert.deepEqual(Object.keys(store.getState()).sort(),["clear","email","rememberEmail","resetStep","step"]);store.getState().clear();assert.equal(store.getState().email,"");assert.equal(store.getState().resetStep,"request");
 const separate=createAuthFlowStore();assert.equal(separate.getState().email,"");
});
test("invalid code, rate limits, network errors and token-bearing fake successes never become reset success",async()=>{
 for(const [status,body,kind]of [[422,{error:"password_rejected"},"password_rejected"],[400,{error:"invalid_code"},"invalid_code"],[429,{error:"rate_limited"},"rate_limited"],[503,{error:"private"},"unavailable"],[200,{reset:true,token:"must-not-use"},"unavailable"]]){
  const client=createPasswordResetClient(origin,async()=>Response.json(body,{status,headers:{"retry-after":"12"}}),()=>origin);const result=await client.send("complete",{email:"a@example.invalid",otp:"000001",password:" New synthetic password "});assert.equal(result.ok,false);assert.equal(result.kind,kind);if(status===429)assert.equal(result.retryAfter,12);
 }
 const client=createPasswordResetClient(origin,async()=>{throw new Error("private");},()=>origin);assert.equal((await client.send("request",{email:"a@example.invalid"})).kind,"unavailable");
 const disabled=createPasswordResetClient(undefined,async()=>assert.fail("No request"));assert.equal((await disabled.send("request",{})).kind,"disabled");
 for(const file of ["auth-flow-store.ts","password-reset-client.ts"]){const source=readFileSync(new URL("../../lib/auth/"+file,import.meta.url),"utf8");assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|console\./);}
});
