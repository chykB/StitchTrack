import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import * as React from "react";
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


// Exercise the actual component with retained hook slots and offline fetches.
// No browser, PostgreSQL or email delivery is involved.
function resetRenderer(props){
 const slots=[],effects=[];let cursor=0;
 const state=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];};
 const hooks={useState:state,useRef:value=>state(()=>({current:value}))[0],useCallback:callback=>{cursor++;return callback;},useDebugValue(){},
  useSyncExternalStore:(_subscribe,get)=>{cursor++;return get();},useEffect:callback=>{cursor++;effects.push(callback);},
  useMemo:(factory,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:factory()};return slots[i].value;}};
 const draw=()=>{const internal=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,previous=internal.H;cursor=0;internal.H=hooks;try{return PasswordResetForm(props);}finally{internal.H=previous;}};
 draw();effects[0]();return draw;
}
function findResetNode(node,predicate){
 if(!node||typeof node!=="object")return;if(predicate(node))return node;
 for(const child of [node.props?.children].flat(Infinity)){const found=findResetNode(child,predicate);if(found)return found;}
}
test("Check code requires six ASCII digits, disables again on edits and blocks duplicate pending checks",async t=>{
 const location=Object.getOwnPropertyDescriptor(globalThis,"location");
 Object.defineProperty(globalThis,"location",{configurable:true,value:{origin}});
 t.after(()=>{if(location)Object.defineProperty(globalThis,"location",location);else delete globalThis.location;});
 let finish;const calls=[];
 t.mock.method(globalThis,"fetch",async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return new Promise(resolve=>{finish=resolve;});});
 const store=createAuthFlowStore("synthetic@example.invalid");store.getState().step("code");
 const draw=resetRenderer({store,origin}),button=()=>findResetNode(draw(),n=>n.type==="button"&&n.props.type==="submit");
 const input=()=>findResetNode(draw(),n=>n.props?.id==="reset-code");
 const enter=value=>{input().props.inputRef.current={value,focus(){}};input().props.onChange({currentTarget:{value}});};
 assert.equal(button().props.children,"Check code");assert.equal(button().props.disabled,true);
 for(const [value,disabled] of [["",true],["12345",true],["1234567",true],["123a56",true],["12 456",true],["\uff11\uff12\uff13\uff14\uff15\uff16",true],["004281",false],["",true],["004281",false],["123x56",true],["004281",false]]){
  enter(value);assert.equal(button().props.disabled,disabled,value);
 }
 assert.equal(calls.length,0);assert.equal(button().props.className,"submit");
 const event={preventDefault(){}},pending=draw().props.onSubmit(event);
 assert.equal(button().props.disabled,true);assert.equal(button().props.children,"Working...");assert.equal(calls.length,1);
 await draw().props.onSubmit(event);assert.equal(calls.length,1);
 assert.deepEqual(calls[0],["/api/product-auth/password-reset/check",{email:"synthetic@example.invalid",otp:"004281"}]);
 finish(Response.json({error:"invalid_code"},{status:400}));await pending;
 assert.equal(button().props.disabled,false);assert.match(renderToStaticMarkup(draw()),/code is invalid or expired/u);
 enter("");assert.equal(button().props.disabled,true);
 const css=readFileSync(new URL("../../app/(auth)/auth.module.css",import.meta.url),"utf8");assert.match(css,/\.submit:disabled/u);
});
test("returning from password entry to a fresh code field resets Check code to disabled",async t=>{
 const location=Object.getOwnPropertyDescriptor(globalThis,"location");Object.defineProperty(globalThis,"location",{configurable:true,value:{origin}});
 t.after(()=>{if(location)Object.defineProperty(globalThis,"location",location);else delete globalThis.location;});
 const calls=[];t.mock.method(globalThis,"fetch",async(path)=>{calls.push(path);return path.endsWith("check")?Response.json({valid:true}):Response.json({error:"invalid_code"},{status:400});});
 const store=createAuthFlowStore("synthetic@example.invalid");store.getState().step("code");
 const draw=resetRenderer({store,origin}),field=findResetNode(draw(),n=>n.props?.id==="reset-code");
 field.props.inputRef.current={value:"004281",focus(){}};field.props.onChange({currentTarget:{value:"004281"}});
 await draw().props.onSubmit({preventDefault(){}});assert.equal(store.getState().resetStep,"password");
 findResetNode(draw(),n=>n.props?.id==="reset-password").props.onChange({currentTarget:{value:" New synthetic password "}});
 await draw().props.onSubmit({preventDefault(){}});assert.equal(store.getState().resetStep,"code");
 assert.equal(findResetNode(draw(),n=>n.type==="button"&&n.props.type==="submit").props.disabled,true);
 assert.deepEqual(calls,["/api/product-auth/password-reset/check","/api/product-auth/password-reset/complete"]);
});


test("Send reset code follows shared email validation and stays disabled while the request is pending",async t=>{
 const location=Object.getOwnPropertyDescriptor(globalThis,"location");Object.defineProperty(globalThis,"location",{configurable:true,value:{origin}});
 t.after(()=>{if(location)Object.defineProperty(globalThis,"location",location);else delete globalThis.location;});
 let finish;const calls=[];
 t.mock.method(globalThis,"fetch",async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return new Promise(resolve=>{finish=resolve;});});
 const store=createAuthFlowStore(),draw=resetRenderer({store,origin});
 const button=()=>findResetNode(draw(),n=>n.type==="button"&&n.props.type==="submit");
 const enter=value=>findResetNode(draw(),n=>n.props?.id==="reset-email").props.onChange({currentTarget:{value}});
 assert.equal(button().props.children,"Send reset code");assert.equal(button().props.disabled,true);
 for(const [value,disabled] of [["",true],["   ",true],["not-an-email",true],["tailor@",true],["\uff54ailor@example.invalid",true],["tailor@example.invalid",false],["",true],["tailor@example.invalid",false],["invalid",true],[" Tailor@EXAMPLE.INVALID ",false]]){
  enter(value);assert.equal(button().props.disabled,disabled,value);
  assert.equal(store.getState().email,value,"Keep raw editable email in transient state");
 }
 assert.equal(calls.length,0);assert.equal(button().props.className,"submit");
 enter("");assert.match(renderToStaticMarkup(draw()),/<button[^>]*type="submit"[^>]*disabled=""/u);
 await draw().props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
 enter(" Tailor@EXAMPLE.INVALID ");const pending=draw().props.onSubmit({preventDefault(){}});
 assert.equal(button().props.disabled,true);assert.equal(button().props.children,"Working...");
 await draw().props.onSubmit({preventDefault(){}});assert.equal(calls.length,1);
 assert.deepEqual(calls[0],["/api/product-auth/password-reset/request",{email:"tailor@example.invalid"}]);
 finish(Response.json({accepted:true},{status:202}));await pending;
 assert.equal(store.getState().resetStep,"code");assert.equal(button().props.children,"Check code");assert.equal(button().props.disabled,true);
 assert.match(renderToStaticMarkup(draw()),/If this account is eligible, a code will be emailed/u);
});
