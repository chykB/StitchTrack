// Actual frontend client/controller and component markup; no browser or external services.
import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {readFileSync} from "node:fs";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {createSessionClient} from "../../lib/auth/session-client.ts";
import {createSessionController} from "../../lib/auth/session-controller.ts";
import {localFrontendAccountDeletionEnabled} from "../../lib/auth/local-session.ts";
import {accountDeletionPath} from "../../lib/auth/account-deletion-contract.ts";
const {default:AccountDeletionForm,submitAccountDeletion}=await import("../../app/(auth)/_components/AccountDeletionForm.tsx");
const {default:AuthForm}=await import("../../app/(auth)/_components/AuthForm.tsx");
const {default:Dashboard}=await import("../../app/dashboard/Dashboard.tsx");
const origin="http://127.0.0.1:3000",password=" Exact synthetic deletion phrase ",user={id:"synthetic",name:"Synthetic tailor",email:"synthetic@example.invalid"};
function fixture(){const calls=[];let deletion=()=>Response.json({requested:true}),currentUser=user;
 const client=createSessionClient({enabled:true,origin,currentOrigin:()=>origin,fetch:async(path,options)=>{calls.push({path,options});return path===accountDeletionPath?deletion():currentUser?Response.json({user:currentUser,expiresAt:new Date(Date.now()+604800000).toISOString()}):Response.json({error:"unauthenticated"},{status:401});}});
 return {calls,client,controller:createSessionController(client),reply:fn=>deletion=fn,sessionUser:value=>currentUser=value};
}
function event(secret=password){let prevented=false,focused=false;const field={value:secret,focus(){focused=true;}};return {field,value:{preventDefault(){prevented=true;},currentTarget:{elements:{namedItem:key=>key==="password"?field:null}}},prevented:()=>prevented,focused:()=>focused};}
test("deletion is same-origin, strict, cookie-based and clears presentation only after confirmed success",async()=>{
 const f=fixture();await f.controller.refresh();const e=event();assert.equal(await submitAccountDeletion(e.value,true,f.controller,()=>{}),true);assert.equal(e.field.value,"");assert.equal(e.prevented(),true);
 const call=f.calls.find(c=>c.path===accountDeletionPath);assert.deepEqual(JSON.parse(call.options.body),{password});assert.equal(call.options.credentials,"same-origin");assert.equal(call.options.redirect,"error");
 const state=f.controller.getSnapshot();assert.equal(state.session,null);assert.equal(state.status,"unauthenticated");assert.equal(state.deletionRequested,true);assert.equal(state.message,"Account deletion requested.");assert.equal(JSON.stringify(state).includes(password),false);
 assert.equal((await f.client.requestDeletion({password,userId:"other"})).kind,"invalid_input");
});
test("hydration, field focus and duplicate guards prevent unintended requests and clear attempted confirmation secrets",async()=>{
 const f=fixture();await f.controller.refresh();let e=event();assert.equal(await submitAccountDeletion(e.value,false,f.controller,()=>{}),false);assert.equal(e.prevented(),true);assert.equal(f.calls.length,1);
 e=event("");let error;assert.equal(await submitAccountDeletion(e.value,true,f.controller,m=>error=m),false);assert.equal(e.focused(),true);assert.match(error,/current password/);
 let finish;f.reply(()=>new Promise(resolve=>finish=resolve));e=event();const pending=submitAccountDeletion(e.value,true,f.controller,()=>{});assert.equal(f.controller.getSnapshot().pending,"delete-account");assert.equal(await submitAccountDeletion(event().value,true,f.controller,()=>{}),false);
 finish(Response.json({requested:true}));assert.equal(await pending,true);assert.equal(e.field.value,"");assert.equal(f.calls.filter(c=>c.path===accountDeletionPath).length,1);
});
test("bad credentials, rate limits, malformed success and network failure never claim deletion or erasure",async()=>{
 for(const [reply,expected]of [[()=>Response.json({error:"private status"},{status:401}),/could not be authorized/],[()=>Response.json({error:"rate_limited"},{status:429,headers:{"retry-after":"9"}}),/wait 9 seconds/],[()=>Response.json({requested:true,token:"forbidden"}),/could not be confirmed/],[()=>{throw new TypeError("synthetic network error");},/could not be confirmed/]]){
  const f=fixture();await f.controller.refresh();f.reply(reply);const e=event();assert.equal(await submitAccountDeletion(e.value,true,f.controller,()=>{}),false);assert.equal(e.field.value,"");assert.ok(f.controller.getSnapshot().session);assert.equal(f.controller.getSnapshot().status,"unknown");assert.notEqual(f.controller.getSnapshot().deletionRequested,true);assert.match(f.controller.getSnapshot().message,expected);assert.doesNotMatch(f.controller.getSnapshot().message,/private status|synthetic network error/);
 }
});
test("deletion controls are default-hidden and server opt-in refuses production, wrong host and development database",()=>{
 const env={NODE_ENV:"development",ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP:"true",ENABLE_PRODUCT_SESSION_HTTP:"true",ENABLE_LOCAL_AUTH_FRONTEND:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,PRODUCT_SINGLE_ORIGIN_RUN_ID:"c0d515aa-682d-4c74-a103-d0e913e73ca0",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true"};
 assert.equal(localFrontendAccountDeletionEnabled(env,"127.0.0.1:3000"),true);for(const patch of [{NODE_ENV:"production"},{ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP:"false"},{PRODUCT_DATABASE_MODE:"development"},{ENABLE_PRODUCT_SESSION_HTTP:"false"}])assert.equal(localFrontendAccountDeletionEnabled({...env,...patch},"127.0.0.1:3000"),false);
 assert.equal(localFrontendAccountDeletionEnabled(env,"evil.invalid"),false);
 const f=fixture(),markup=renderToStaticMarkup(createElement(AuthForm,{mode:"login",buttonLabel:"Log in",legend:"Login",unavailableMessage:"Unavailable",sessionController:f.controller}));assert.doesNotMatch(markup,/Request account deletion|Delete your StitchTrack account/);
});
// Component hooks double: execute actual JSX handlers/state, not a second UI implementation.
function renderComponent(Component,props){const slots=[];let index=0;const hooks={useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];},useEffect:()=>{index++;},useSyncExternalStore:(_subscribe,get)=>{index++;return get();}};
 return ()=>{const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,previous=internals.H;index=0;internals.H=hooks;try{return Component(props);}finally{internals.H=previous;}};}
function child(tree,predicate){if(!tree||typeof tree!=="object")return;if(predicate(tree))return tree;for(const value of [tree.props?.children].flat(Infinity)){const found=child(value,predicate);if(found)return found;}}
test("the real form explains immediate locking, preserves password accessibility and can cancel without requesting deletion",async()=>{
 const f=fixture();await f.controller.refresh();const render=renderComponent(AccountDeletionForm,{controller:f.controller});let tree=render();const button=child(tree,e=>e.type==="button");assert.equal(button.props.children,"Request account deletion");assert.equal(button.props.className,"secondaryButton");assert.equal(button.props.disabled,true);
 button.props.onClick();tree=render();const html=renderToStaticMarkup(tree);const text=html.replaceAll("&#x27;", "'");
 for(const copy of ["Delete your StitchTrack account?","Your account will be locked immediately, and you'll be signed out on every device. You won't be able to log in again.",
  "This request cannot be reversed in the current application.","When will my data be deleted?",
  "Your account becomes eligible for permanent deletion after 24 hours. Automatic deletion is not yet available, so we cannot confirm a completion date.","Confirm your password","Confirm account deletion"])assert.ok(text.includes(copy),copy);
 assert.match(html,/aria-labelledby="deletion-heading"/);assert.match(html,/aria-describedby="deletion-warning deletion-irreversible deletion-timing"/);
 assert.doesNotMatch(html,/48 hours|hourly|recover your account|restore your account/);assert.match(html,/type="password"/);assert.match(html,/autoComplete="current-password"/i);assert.match(html,/aria-label="Show password"/);assert.equal((html.match(/<form/g)||[]).length,1);
 const cancel=child(tree,e=>e.type==="button"&&e.props.children==="Cancel");assert.equal(cancel.props.className,"secondaryButton");assert.equal(cancel.props.type,"button");
 cancel.props.onClick();assert.ok(child(render(),e=>e.type==="button"&&e.props.children==="Request account deletion"));assert.equal(f.calls.filter(c=>c.path===accountDeletionPath).length,0);
});

const authMarkup=f=>renderToStaticMarkup(createElement(Dashboard,{initialSession:{user,expiresAt:Date.now()+604800000},origin,accountDeletionEnabled:true,passwordResetEnabled:false,
 controller:{...f.controller,getServerSnapshot:f.controller.getSnapshot}}));
test("confirmed response renders the exact completion wording in the existing live region without implying erasure",async()=>{
 const f=fixture();await f.controller.refresh();await submitAccountDeletion(event().value,true,f.controller,()=>{});
 const html=authMarkup(f);
 for(const copy of ["<h1>Account deletion requested</h1>","Your account has been locked, and your sessions have been ended. Your personal information has not yet been permanently deleted.",
  "Your deletion request is awaiting processing. A completion date is not yet confirmed."])assert.ok(html.includes(copy),copy);
 assert.equal((html.match(/role="status"/g)||[]).length,1);assert.match(html,/aria-live="polite" aria-atomic="true"/);
 assert.doesNotMatch(html,/Welcome,|Your account<\/h2>/);assert.doesNotMatch(html,/48 hours|hourly|>Cancel<|>Check session<|>Log out<|permanently erased/);
 f.sessionUser(null);await f.controller.refresh();assert.equal(f.controller.getSnapshot().deletionRequested,true);assert.match(authMarkup(f),/<h1>Account deletion requested<\/h1>/);
 f.sessionUser({...user,id:"other-user",name:"Other tailor"});await f.controller.refresh();assert.notEqual(f.controller.getSnapshot().deletionRequested,true);assert.doesNotMatch(authMarkup(f),/<h1>Account deletion requested<\/h1>/);
});
test("uncertain deletion never becomes confirmed merely because a session recheck refuses access",async()=>{
 const f=fixture();await f.controller.refresh();f.reply(()=>{throw new TypeError("private network failure");});
 assert.equal(await submitAccountDeletion(event().value,true,f.controller,()=>{}),false);
 let html=authMarkup(f);assert.match(html,/Deletion request could not be confirmed/);assert.match(html,/>Check session</);assert.doesNotMatch(html,/<h1>Account deletion requested<\/h1>|Your account has been locked/);
 f.sessionUser(null);await f.controller.refresh();assert.notEqual(f.controller.getSnapshot().deletionRequested,true);html=authMarkup(f);
 assert.doesNotMatch(html,/<h1>Account deletion requested<\/h1>|Your account has been locked/);assert.match(html,/You are not logged in/);
});
test("pending request cannot show confirmed copy; outlined controls reuse existing tokens, focus and disabled patterns",async()=>{
 const f=fixture();await f.controller.refresh();let finish;f.reply(()=>new Promise(resolve=>finish=resolve));
 const pending=submitAccountDeletion(event().value,true,f.controller,()=>{});assert.doesNotMatch(authMarkup(f),/<h1>Account deletion requested<\/h1>/);
 finish(Response.json({requested:true}));assert.equal(await pending,true);assert.match(authMarkup(f),/<h1>Account deletion requested<\/h1>/);
 const css=readFileSync(new URL("../../app/(auth)/auth.module.css",import.meta.url),"utf8");
 assert.match(css,/\.secondaryButton,\s*\.backToSignup\s*\{/);assert.match(css,/\.secondaryButton:focus-visible/);assert.match(css,/\.secondaryButton:disabled/);
 const secondary=css.split(".secondaryButton,")[1].split("}")[0];assert.match(secondary,/var\(--stitchtrack-color-outline\)/);assert.match(secondary,/var\(--stitchtrack-type-label-large-font-size\)/);
});
