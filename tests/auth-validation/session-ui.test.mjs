// Server markup and action contracts, not a mounted browser or screen reader.
import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {AuthScreen} from "./rendering.mjs";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
const {default:AuthForm,AuthSessionControls,refreshLoginSession,submitAuthForm}=await import("../../app/(auth)/_components/AuthForm.tsx");
const {createSessionController}=await import("../../lib/auth/session-controller.ts");
const {createSessionClient}=await import("../../lib/auth/session-client.ts");
const user={id:"synthetic",name:"<Synthetic tailor>",email:"synthetic@example.invalid"};
const session={user,expiresAt:Date.now()+60000};
const snapshot={status:"authenticated",pending:null,session,message:"You are logged in.",retryUntil:null};
function event(email=" Synthetic@EXAMPLE.INVALID ",password=" Exact synthetic password ") {
  let prevented=false,focused;const fields={email:{value:email,focus(){focused="email";}},password:{value:password,focus(){focused="password";}}};
  return {value:{preventDefault(){prevented=true;},currentTarget:{elements:{namedItem:key=>fields[key]}}},prevented:()=>prevented,focused:()=>focused};
}
test("existing login markup stays default-disabled, labelled and limited to its original polite region",()=>{
  const html=renderToStaticMarkup(createElement(AuthForm,{mode:"login",buttonLabel:"Log in",legend:"Login details",hideLegend:true,unavailableMessage:"Login is not available yet."}));
  assert.match(html,/<fieldset[^>]*disabled/u);assert.match(html,/for="login-email"/u);assert.match(html,/for="login-password"/u);assert.match(html,/aria-label="Show password"/u);
  assert.equal((html.match(/role="status"/gu)||[]).length,1);assert.match(html,/aria-live="polite" aria-atomic="true"/u);assert.doesNotMatch(html,/Login session|Log out|Check session/u);
});
test("login offers only a session recheck for uncertainty, never an intermediate account menu",()=>{
 const markup=value=>renderToStaticMarkup(createElement(AuthSessionControls,{snapshot:value,onRefresh(){}}));
 assert.equal(markup(snapshot),"");assert.equal(markup({...snapshot,status:"unauthenticated",session:null}),"");
 const uncertain=markup({...snapshot,status:"unknown"});assert.match(uncertain,/>Check session</u);assert.doesNotMatch(uncertain,/Go to dashboard|Log out|Logged in as|Administration/u);
 assert.match(markup({...snapshot,status:"unknown",pending:"session"}),/<button[^>]*disabled/u);
});
test("shared submit path preserves error focus, hydration guard and exact credentials, including duplicate prevention",async()=>{
  let calls=0,resolve;const client={enabled:true,login:input=>{calls++;assert.equal(input.password," Exact synthetic password ");return new Promise(r=>{resolve=r;});},session:async()=>({ok:true,data:session}),logout:async()=>({ok:true,data:{loggedOut:true}})};
  const controller=createSessionController(client),events=[];
  let e=event();assert.equal(await submitAuthForm(e.value,false,"login",false,v=>events.push(v),controller),false);assert.equal(e.prevented(),true);assert.equal(calls,0);
  e=event("invalid");assert.equal(await submitAuthForm(e.value,true,"login",false,v=>events.push(v),controller),false);assert.equal(e.focused(),"email");assert.equal(calls,0);
  e=event();const pending=submitAuthForm(e.value,true,"login",false,v=>events.push(v),controller);assert.equal(calls,1);
  const duplicate=event();assert.equal(await submitAuthForm(duplicate.value,true,"login",false,v=>events.push(v),controller),false);assert.equal(duplicate.prevented(),true);assert.equal(calls,1);
  resolve({ok:true,data:{user}});assert.equal(await pending,true);
});
test("disabled integration preserves truthful local-unavailable validation behavior without a fetch",async()=>{
  const controller=createSessionController(createSessionClient({fetch:async()=>assert.fail("No request permitted")})),e=event(),events=[];
  assert.equal(await submitAuthForm(e.value,true,"login",false,v=>events.push(v),controller),false);assert.equal(e.prevented(),true);assert.equal(events[0].type,"submit");assert.equal(events[0].values.password," Exact synthetic password ");
});

test("post-login navigation waits for the existing authoritative lookup and occurs once without another session request",async()=>{
 let logins=0,lookups=0,resolveLookup,entered;
 const lookupStarted=new Promise(resolve=>{entered=resolve;});
 const controller=createSessionController({enabled:true,
  login:async()=>{logins++;return {ok:true,data:{user}};},
  session:()=>{lookups++;entered();return new Promise(resolve=>{resolveLookup=resolve;});},
  logout:async()=>({ok:true,data:{loggedOut:true}})});
 const destinations=[],navigate=path=>destinations.push(path);
 const pending=submitAuthForm(event().value,true,"login",false,()=>{},controller,undefined,navigate);
 await lookupStarted;assert.deepEqual(destinations,[]);assert.equal(controller.getSnapshot().pending,"login");
 assert.equal(await submitAuthForm(event().value,true,"login",false,()=>{},controller,undefined,navigate),false);
 resolveLookup({ok:true,data:session});assert.equal(await pending,true);
 assert.deepEqual(destinations,["/dashboard"]);assert.equal(logins,1);assert.equal(lookups,1);
 // Opening account controls or submitting an already-authenticated form must not loop.
 assert.equal(await submitAuthForm(event().value,true,"login",false,()=>{},controller,undefined,navigate),false);
 assert.deepEqual(destinations,["/dashboard"]);assert.equal(lookups,1);
});
test("failed, unconfirmed, expired and mismatched-identity logins never navigate",async()=>{
 for(const kind of ["credentials","network","rate","lookup-failure","revoked","expired","other-user"]){
  const controller=createSessionController({enabled:true,
   login:async()=>{if(kind==="network")throw new Error("synthetic network failure");return kind==="credentials"?{ok:false,kind:"invalid_credentials"}:kind==="rate"?{ok:false,kind:"rate_limited",retryAfterSeconds:1}:{ok:true,data:{user}};},
   session:async()=>kind==="lookup-failure"?{ok:false,kind:"unavailable"}:{ok:true,data:kind==="revoked"?null:{...session,...(kind==="expired"?{expiresAt:Date.now()-1}:{}),...(kind==="other-user"?{user:{...user,id:"other"}}:{})}},
   logout:async()=>({ok:true,data:{loggedOut:true}})});
  const destinations=[];assert.equal(await submitAuthForm(event().value,true,"login",false,()=>{},controller,undefined,path=>destinations.push(path)),false,kind);assert.deepEqual(destinations,[],kind);
 }
});


test("opening Login with an active session navigates after exactly one authoritative refresh",async()=>{
 let reads=0,logins=0;const destinations=[];
 const controller=createSessionController({enabled:true,session:async()=>{reads++;return {ok:true,data:session};},login:async()=>{logins++;return {ok:true,data:{user}};},logout:async()=>({ok:true,data:{loggedOut:true}})});
 assert.equal(await refreshLoginSession(controller,path=>destinations.push(path)),true);assert.deepEqual(destinations,["/dashboard"]);assert.equal(reads,1);assert.equal(logins,0);
 const current={...controller,getServerSnapshot:controller.getSnapshot};
 const html=renderToStaticMarkup(createElement(AuthScreen,{mode:"login",sessionController:current}));assert.match(html,/<h1[^>]*>Opening your dashboard<\/h1>/u);
 assert.doesNotMatch(html,/>Your account<|Go to dashboard|Logged in as|Log out|Account settings|Forgot your password/u);
});
test("expired, revoked, unavailable and disabled lookups never redirect or fabricate login",async()=>{
 for(const kind of ["expired","revoked","failure","disabled"]){
  const destinations=[],controller=createSessionController({enabled:kind!=="disabled",session:async()=>kind==="failure"?{ok:false,kind:"network"}:{ok:true,data:kind==="revoked"?null:{...session,expiresAt:kind==="expired"?Date.now()-1:session.expiresAt}},login:async()=>assert.fail(),logout:async()=>assert.fail()});
  await refreshLoginSession(controller,path=>destinations.push(path));assert.deepEqual(destinations,[],kind);
 }
 const source=(await import('node:fs')).readFileSync(new URL('../../app/(auth)/auth/AuthScreen.tsx',import.meta.url),'utf8');
 assert.match(source,/onLoginConfirmed=\{mode==="login"\?navigateAfterLogin:undefined\}/u);assert.match(source,/mode==="reset"&&passwordResetOrigin/u);assert.match(source,/signup.phase!=="signup"/u);
});
