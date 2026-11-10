// Real client/controller and React form with HTTP/hook doubles, no live backend.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {businessPath} from "../../lib/business-contract.ts";
import {createBusinessClient,createBusinessController} from "../../lib/business-client.ts";
const {default:BusinessSetup}=await import("../../app/dashboard/BusinessSetup.tsx");
const origin="http://127.0.0.1:3000",profile={id:"offline-business",name:"Lagos Studio",timeZone:"Africa/Lagos"};
function fixture(fetch){const requests=[];let expired=0;const client=createBusinessClient(origin,{currentOrigin:()=>origin,fetch:async(path,init)=>{requests.push({path,...init});return fetch(path,init);}});const controller=createBusinessController(client,()=>expired++);return {client,controller,requests,expired:()=>expired};}
const render=(f,view="home")=>renderToStaticMarkup(React.createElement(BusinessSetup,{origin,view,sessionController:{refresh:async()=>{}},controller:f.controller}));
function hooks(Component,props,effects){const slots=[];let index=0;const useState=initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],v=>{slots[i]=typeof v==="function"?v(slots[i]):v;}];};
 const dispatcher={useState,useRef:v=>useState(()=>({current:v}))[0],useEffect:(callback,deps)=>{index++;effects?.push({callback,deps});},useMemo:f=>{index++;return f();},useSyncExternalStore:(_s,get)=>{index++;return get();}};
 return()=>{const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,prior=internals.H;index=0;internals.H=dispatcher;try{return Component(props);}finally{internals.H=prior;}};}
function find(node,predicate){if(!node||typeof node!=="object")return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}}
test("initial setup waits for an authorized read; null opens the accessible name-only form",async()=>{
 const f=fixture(async()=>Response.json({business:null}));assert.match(render(f),/Loading your business information/);assert.doesNotMatch(render(f),/<form|Create business/);
 await f.controller.load();const html=render(f);assert.match(html,/Set up your business/);assert.match(html,/label for="business-name"/);assert.match(html,/autoComplete="organization"|autoComplete|auto[Cc]omplete="organization"/);assert.match(html,/>Create business</);assert.doesNotMatch(html,/maxLength|maxlength|ownerId|businessId|role="owner"/);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].path,businessPath);assert.equal(f.requests[0].method,"GET");assert.equal(f.requests[0].credentials,"same-origin");assert.equal(f.requests[0].redirect,"error");assert.equal(f.requests[0].cache,"no-store");
});
test("actual form handlers validate, submit only operation/name and display server-confirmed business details",async()=>{
 let business=null;const f=fixture(async(_p,init)=>{if(init.method==="POST"){const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),["name","operation"]);business={...profile,name:body.name};}return Response.json({business});});
 await f.controller.load();const draw=hooks(BusinessSetup,{origin,sessionController:{refresh:async()=>{}},controller:f.controller});let tree=draw();
 find(tree,n=>n.type==="input").props.onChange({currentTarget:{value:" A "}});await f.controller.save();assert.match(render(f),/aria-invalid="true"/);assert.equal(f.requests.length,1);
 tree=draw();find(tree,n=>n.type==="input").props.onChange({currentTarget:{value:"  Lagos Studio  "}});let prevented=false;find(draw(),n=>n.type==="form").props.onSubmit({preventDefault(){prevented=true;}});
 await new Promise(resolve=>setTimeout(resolve,0));assert.ok(prevented);assert.deepEqual(JSON.parse(f.requests[1].body),{operation:"create",name:"Lagos Studio"});assert.match(render(f),/Lagos Studio/);assert.doesNotMatch(render(f),/Edit business name|Business details saved|Timezone|Africa\/Lagos/);assert.doesNotMatch(render(f),/Create business/);
});
test("profile editing and cancel stay transient; Unicode policy is shared and duplicate submissions are blocked",async()=>{
 let release,business=profile;const f=fixture(async(_p,init)=>{if(init.method==="POST"){await new Promise(r=>release=r);business={...profile,name:JSON.parse(init.body).name};}return Response.json({business});});await f.controller.load();f.controller.edit();f.controller.setName("Cancelled name");f.controller.cancel();assert.equal(f.controller.getSnapshot().draft,profile.name);
 f.controller.edit();f.controller.setName(String.fromCodePoint(0x1f9f5).repeat(120));const pending=f.controller.save();assert.equal(await f.controller.save(),false);assert.equal(f.requests.filter(r=>r.method==="POST").length,1);assert.match(render(f,"settings"),/Saving.../);assert.match(render(f,"settings"),/disabled=""/);release();assert.equal(await pending,true);assert.equal(JSON.parse(f.requests[1].body).operation,"rename");
});
test("lost response after a possible commit uses GET reconciliation, never repeats POST or fabricates success",async()=>{
 let business=null;const f=fixture(async(_p,init)=>{if(init.method==="POST"){business=profile;throw Error("private network diagnostic");}return Response.json({business});});await f.controller.load();f.controller.setName(profile.name);assert.equal(await f.controller.save(),false);
 assert.deepEqual(f.requests.map(r=>r.method),["GET","POST","GET"]);assert.equal(f.controller.getSnapshot().uncertain,false);assert.match(render(f,"settings"),/saved business details have been confirmed/);assert.equal(f.controller.getSnapshot().business.name,profile.name);assert.doesNotMatch(render(f),/private network|Business details saved/);
});
test("unconfirmed save with no observed business stays uncertain and blocks mutation until explicit review",async()=>{
 const f=fixture(async(_p,init)=>{if(init.method==="POST")throw Error("private diagnostic");return Response.json({business:null});});await f.controller.load();f.controller.setName("Studio");await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(await f.controller.save(),false);
 const html=render(f);assert.match(html,/does not confirm that the earlier save failed/);assert.match(html,/Check saved business/);assert.doesNotMatch(html,/<form|Business details saved|Create business/);assert.equal(f.requests.filter(r=>r.method==="POST").length,1);
 f.controller.useSaved();assert.match(render(f),/Create business/);assert.equal(f.controller.getSnapshot().draft,"Studio");assert.equal(f.requests.filter(r=>r.method==="POST").length,1);
});
test("not-yet-migrated/unavailable storage never becomes empty onboarding, and expired sessions clear business data",async()=>{
 const unavailable=fixture(async()=>Response.json({error:"private missing table diagnostic"},{status:503}));await unavailable.controller.load();assert.match(render(unavailable),/Business setup is temporarily unavailable/);assert.doesNotMatch(render(unavailable),/<form|Create business|private missing table/);
 let expired=false;const f=fixture(async()=>expired?Response.json({error:"unauthenticated"},{status:401}):Response.json({business:profile}));await f.controller.load();expired=true;await f.controller.load();assert.equal(f.expired(),1);assert.equal(f.controller.getSnapshot().business,null);assert.doesNotMatch(render(f),/Lagos Studio|Edit business name/);
});
test("rate limits and validation errors stay safe; malformed success reconciles rather than authenticating or saving optimistically",async()=>{
 for(const status of [422,429]){const f=fixture(async(_p,i)=>i.method==="POST"?Response.json({error:"private detail"},{status,headers:{"retry-after":"5"}}):Response.json({business:null}));await f.controller.load();f.controller.setName("Studio");await f.controller.save();assert.equal(f.controller.getSnapshot().business,null);assert.equal(f.requests.length,2);assert.doesNotMatch(render(f),/private detail|Business details saved/);if(status===429)assert.match(render(f),/Wait 5 seconds/);}
 const f=fixture(async(_p,i)=>Response.json(i.method==="POST"?{business:{...profile,ownerId:"forged"}}:{business:null}));await f.controller.load();f.controller.setName(profile.name);await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.deepEqual(f.requests.map(r=>r.method),["GET","POST","GET"]);
});
test("client refuses a different origin before fetching and escapes names from authorized replies",async()=>{
 let requests=0;const client=createBusinessClient(origin,{currentOrigin:()=>"https://outside.invalid",fetch:async()=>{requests++;throw Error();}});assert.equal((await client.read()).ok,false);assert.equal(requests,0);
 const f=fixture(async()=>Response.json({business:{...profile,name:"Studio <script>"}}));await f.controller.load();const html=render(f);assert.match(html,/Studio &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

test("a setup conflict loads the existing profile and requires review before an explicit rename",async()=>{
 let current=null;const f=fixture(async(_p,i)=>{if(i.method==="POST"){current=profile;return Response.json({error:"business_conflict"},{status:409});}return Response.json({business:current});});
 await f.controller.load();f.controller.setName("Different Studio");await f.controller.save();assert.match(render(f),/Business details changed/);assert.match(render(f),/Currently saved/);assert.equal(f.controller.getSnapshot().business.name,profile.name);assert.equal(f.requests.filter(r=>r.method==="POST").length,1);
 f.controller.useSaved();assert.match(render(f,"settings"),/Save business name/);assert.doesNotMatch(render(f),/>Create business</);assert.equal(f.controller.getSnapshot().draft,profile.name);
});

test("Home keeps the saved name prominent and hides editing, timezone and success while Settings reuses editing",async()=>{
 const f=fixture(async()=>Response.json({business:profile}));await f.controller.load();
 let html=render(f);assert.match(html,/<h3 class="businessName">Lagos Studio<\/h3>/);assert.doesNotMatch(html,/Timezone|Africa\/Lagos|Edit business name|Business details saved/);
 html=render(f,"settings");assert.match(html,/Edit business name/);assert.doesNotMatch(html,/Timezone|Africa\/Lagos/);
 f.controller.edit();f.controller.setName("Unsaved draft");assert.doesNotMatch(render(f),/<form|Unsaved draft/);assert.match(render(f),/Lagos Studio/);assert.match(render(f,"settings"),/value="Unsaved draft"/);
});
test("Settings with no business points to Home without duplicating the initial creation form",async()=>{
 const f=fixture(async()=>Response.json({business:null}));await f.controller.load();assert.match(render(f,"settings"),/Use Home to set up your business/);assert.doesNotMatch(render(f,"settings"),/<form|Create business/);assert.match(render(f),/>Create business</);
});
test("editing success clears after five seconds while the saved name and timezone value remain unchanged",async t=>{
 let business=profile;const f=fixture(async(_p,i)=>{if(i.method==="POST")business={...profile,name:JSON.parse(i.body).name};return Response.json({business});});
 await f.controller.load();f.controller.edit();f.controller.setName("Updated Studio");await f.controller.save();assert.match(render(f,"settings"),/Business details saved/);assert.doesNotMatch(render(f),/Business details saved/);
 const effects=[];hooks(BusinessSetup,{origin,view:"settings",sessionController:{refresh:async()=>{}},controller:f.controller},effects)();
 const feedback=effects.find(e=>e.deps?.includes("Business details saved."));assert.ok(feedback);
 t.mock.timers.enable({apis:["setTimeout"]});const cleanup=feedback.callback();t.mock.timers.tick(4999);assert.match(render(f,"settings"),/Business details saved/);t.mock.timers.tick(1);
 assert.doesNotMatch(render(f,"settings"),/Business details saved/);assert.match(render(f,"settings"),/Updated Studio/);assert.equal(f.controller.getSnapshot().business.timeZone,"Africa/Lagos");cleanup();
});
test("feedback dismissal never clears rate-limit errors or uncertain-save warnings",async()=>{
 for(const code of [429,503]){const f=fixture(async(_p,i)=>i.method==="POST"?Response.json({error:"safe failure"},{status:code}):Response.json({business:null}));await f.controller.load();f.controller.setName("Studio");await f.controller.save();
  const message=f.controller.getSnapshot().message;assert.ok(message);f.controller.dismissSuccess();assert.equal(f.controller.getSnapshot().message,message);
 }
});
test("switching a ready business panel between Home and Settings does not issue another load",async()=>{
 const f=fixture(async()=>Response.json({business:profile}));await f.controller.load();
 for(const view of ["home","settings","home"]){const effects=[];hooks(BusinessSetup,{origin,view,sessionController:{refresh:async()=>{}},controller:f.controller},effects)();effects[0].callback();}
 assert.equal(f.requests.length,1);
});
