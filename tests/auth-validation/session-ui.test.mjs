// Server markup and action contracts, not a mounted browser or screen reader.
import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
const {default:AuthForm,AuthSessionControls,submitAuthForm}=await import("../../app/(auth)/_components/AuthForm.tsx");
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
test("session controls distinguish authenticated and uncertain states and never invent a dashboard",()=>{
  const markup=value=>renderToStaticMarkup(createElement(AuthSessionControls,{snapshot:value,onRefresh(){},onLogout(){}}));
  const authenticated=markup(snapshot);assert.match(authenticated,/Logged in as &lt;Synthetic tailor&gt;/u);assert.match(authenticated,/>Log out</u);assert.doesNotMatch(authenticated,/Check session|href=|businessId/u);
  const uncertain=markup({...snapshot,status:"unknown"});assert.match(uncertain,/Previously logged in as/u);assert.match(uncertain,/>Check session</u);
  const busy=markup({...snapshot,pending:"logout"});assert.match(busy,/<button[^>]*disabled/u);assert.match(busy,/Logging out/u);
  const prehydration=renderToStaticMarkup(createElement(AuthSessionControls,{snapshot,ready:false,onRefresh(){},onLogout(){}}));assert.match(prehydration,/<button[^>]*disabled/u);
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

test("Administration is beside account controls only for confirmed, current eligible sessions",()=>{
 const markup=value=>renderToStaticMarkup(createElement(AuthSessionControls,{snapshot:value,onRefresh(){},onLogout(){}}));
 const admin={...snapshot,session:{...session,administration:true}};
 assert.match(markup(admin),/<a[^>]*href="\/admin"[^>]*>Administration<\/a>/);
 for(const value of [snapshot,{...admin,status:"unknown"},{...admin,pending:"session"},{...admin,pending:"logout"},{...admin,session:{...session,administration:false}},{...admin,status:"unauthenticated",session:null}])assert.doesNotMatch(markup(value),/>Administration</);
 const unready=renderToStaticMarkup(createElement(AuthSessionControls,{snapshot:admin,ready:false,onRefresh(){},onLogout(){}}));assert.doesNotMatch(unready,/>Administration</);
});
