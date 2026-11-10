// Offline: real frontend adapter/controller/components, synthetic HTTP and hook doubles only.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {createClientRecordClient,createClientRecordsController} from "../../lib/client-record-client.ts";
import {clientRecordPath} from "../../lib/client-record-contract.ts";
const {default:Clients}=await import("../../app/dashboard/Clients.tsx");
const origin="http://127.0.0.1:3000",id="00000000-0000-4000-8000-000000000001",id2="00000000-0000-4000-8000-000000000002";
const row=(patch={})=>({id,fullName:"Synthetic client",phone:null,email:null,createdAt:"2026-11-07T12:00:00.000Z",updatedAt:"2026-11-07T12:00:00.000Z",...patch});
const json=(data,status=200,headers={})=>Response.json(data,{status,headers});
const realFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No live HTTP allowed");test.after(()=>{globalThis.fetch=realFetch;});
function fixture(reply,options={}){
 const requests=[];let expired=0,generated=0;
 const client=createClientRecordClient(origin,{currentOrigin:()=>origin,fetch:async(path,init)=>{const body=JSON.parse(init.body);requests.push({path,...init,body});return reply(body,init);}});
 const controller=createClientRecordsController(client,()=>expired++,{newId:()=>{generated++;return id;},...options});
 return {client,controller,requests,expired:()=>expired,generated:()=>generated};
}
const render=(f,disabled=false)=>renderToStaticMarkup(React.createElement(Clients,{controller:f.controller,disabled}));
function hooks(Component,props,effects=[]){
 const slots=[];let index=0;const state=initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],v=>{slots[i]=v;}];};
 const dispatcher={useState:state,useRef:v=>state(()=>({current:v}))[0],useEffect:(callback,deps)=>{index++;effects.push({callback,deps});},useSyncExternalStore:(_s,get)=>{index++;return get();}};
 return()=>{const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,prior=internals.H;index=0;internals.H=dispatcher;try{return Component(props);}finally{internals.H=prior;}};
}
function find(node,predicate){if(!node||typeof node!=="object")return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}}
const submit=tree=>find(tree,n=>n.type==="button"&&n.props.type==="submit");
async function add(f,name="Synthetic client"){await f.controller.load();f.controller.beginAdd();f.controller.setField("fullName",name);}
test("first load and empty state use the existing authenticated endpoint without Business IDs",async()=>{
 const f=fixture(async()=>json({clients:[],nextCursor:null}));assert.match(render(f),/Loading clients/);
 await f.controller.load();assert.match(render(f),/No clients yet/);assert.match(render(f),/A name is all you need/);
 assert.equal(f.requests.length,1);const r=f.requests[0];assert.equal(r.path,clientRecordPath);assert.deepEqual(r.body,{operation:"list",limit:25});
 assert.equal(r.method,"POST");assert.equal(r.credentials,"same-origin");assert.equal(r.redirect,"error");assert.equal(r.cache,"no-store");assert.equal(r.headers["content-type"],"application/json");
});
test("cursor pagination is explicit, bounded and displays optional contacts without fetching all pages",async()=>{
 const first=row(),second=row({id:id2,fullName:"Second client",phone:"1234567",email:"second@example.invalid"}),cursor={createdAt:first.createdAt,id:first.id};
 const f=fixture(async b=>json(b.cursor?{clients:[second],nextCursor:null}:{clients:[first],nextCursor:cursor}));
 await f.controller.load();assert.equal(f.requests.length,1);let html=render(f);assert.match(html,/Load more clients/);assert.match(html,/No phone number/);assert.match(html,/No email address/);
 await f.controller.loadMore();assert.deepEqual(f.requests[1].body,{operation:"list",limit:25,cursor});html=render(f);assert.match(html,/Second client/);assert.match(html,/second@example.invalid/);assert.doesNotMatch(html,/Load more clients/);
 assert.equal(await f.controller.loadMore(),false);assert.equal(f.requests.length,2);
});
test("actual add form stays disabled for missing/invalid fields and supports name-only creation",async()=>{
 let saved=null;const f=fixture(async b=>b.operation==="create"?(saved=row({fullName:b.fullName}),json({client:saved})):json({clients:saved?[saved]:[],nextCursor:null}));
 await f.controller.load();f.controller.beginAdd();const draw=hooks(Clients,{controller:f.controller});assert.equal(submit(draw()).props.disabled,true);
 const field=(name,value)=>find(draw(),n=>n.type==="input"&&n.props.name===name).props.onChange({currentTarget:{value}});
 field("fullName"," ");assert.equal(submit(draw()).props.disabled,true);field("fullName","  Amina  ");assert.equal(submit(draw()).props.disabled,false);
 field("phone","123");assert.equal(submit(draw()).props.disabled,true);assert.match(render(f),/Use 7-15 digits/);field("phone","");field("email","invalid");assert.equal(submit(draw()).props.disabled,true);field("email","");
 let prevented=false;find(draw(),n=>n.type==="form").props.onSubmit({preventDefault(){prevented=true;}});await new Promise(r=>setTimeout(r,0));assert.ok(prevented);
 assert.deepEqual(f.requests.find(r=>r.body.operation==="create").body,{operation:"create",id,fullName:"Amina",phone:null,email:null});
 assert.equal(f.generated(),1);assert.match(render(f),/Client details saved/);assert.match(render(f),/Amina/);assert.match(render(f),/Not provided/);assert.deepEqual(f.requests.map(r=>r.body.operation),["list","create","list"]);
});
test("shared Unicode, phone and normalized email rules drive client validation and storage",async()=>{
 const f=fixture(async()=>json({clients:[],nextCursor:null}));await add(f,"\ud83e\uddf5".repeat(120));assert.equal(f.controller.canSave(),true);
 f.controller.setField("fullName","\ud83e\uddf5".repeat(121));assert.equal(f.controller.canSave(),false);f.controller.setField("fullName","Amina");
 f.controller.setField("phone"," +234 (803) 123-4567 ");f.controller.setField("email"," AMINA@EXAMPLE.INVALID ");assert.equal(f.controller.canSave(),true);
 // Return a strict response without any request-only properties.
 const normalized=fixture(async b=>b.operation==="create"?json({client:row({fullName:b.fullName,phone:b.phone,email:b.email})}):json({clients:[],nextCursor:null}));
 await add(normalized,"Amina");normalized.controller.setField("phone"," +234 (803) 123-4567 ");normalized.controller.setField("email"," AMINA@EXAMPLE.INVALID ");await normalized.controller.save();
 const b=normalized.requests.find(r=>r.body.operation==="create").body;assert.equal(b.phone,"+234 (803) 123-4567");assert.equal(b.email,"amina@example.invalid");
});
test("details use get; editing unchanged data disables Save, and optional contacts can be cleared",async()=>{
 let saved=row({phone:"1234567",email:"amina@example.invalid"});const f=fixture(async b=>{
  if(b.operation==="list")return json({clients:[saved],nextCursor:null});if(b.operation==="update")saved={...saved,...b,operation:undefined};
  if(b.operation==="update")delete saved.operation;return json({client:saved});
 });await f.controller.load();await f.controller.select(id);assert.equal(f.requests[1].body.operation,"get");assert.match(render(f),/amina@example.invalid/);
 f.controller.edit();const draw=hooks(Clients,{controller:f.controller});assert.equal(submit(draw()).props.disabled,true);
 f.controller.setField("fullName"," Changed name ");f.controller.setField("phone","");f.controller.setField("email","");assert.equal(submit(draw()).props.disabled,false);
 await f.controller.save();assert.deepEqual(f.requests.at(-1).body,{operation:"update",id,fullName:"Changed name",phone:null,email:null});
 assert.equal(f.controller.getSnapshot().selected.id,id);assert.equal(f.controller.getSnapshot().selected.createdAt,saved.createdAt);assert.equal(f.controller.getSnapshot().rows[0].phone,null);assert.match(render(f),/Client details saved/);
 f.controller.edit();f.controller.setField("phone","1234567");f.controller.cancel();assert.equal(f.controller.getSnapshot().selected.phone,null);
});
test("pending create disables submission and fields, preventing duplicate requests",async()=>{
 let release;const f=fixture(async b=>b.operation==="create"?new Promise(r=>{release=()=>r(json({client:row()}));}):json({clients:[],nextCursor:null}));await add(f);
 const pending=f.controller.save();assert.equal(f.controller.canSave(),false);assert.equal(await f.controller.save(),false);const html=render(f);assert.match(html,/Saving/);assert.match(html,/disabled=""/);
 f.controller.setField("fullName","Ignored");assert.equal(f.controller.getSnapshot().draft.fullName,"Synthetic client");release();await pending;assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);
});
test("lost create response preserves UUID and payload; get reconciliation confirms a committed save without another create",async()=>{
 let saved=null;const f=fixture(async b=>{if(b.operation==="create"){saved=row({fullName:b.fullName});throw Error("PRIVATE NETWORK ERROR");}return b.operation==="get"?json({client:saved}):json({clients:saved?[saved]:[],nextCursor:null});});
 await add(f);await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.controller.getSnapshot().createId,id);assert.match(render(f),/could not be confirmed/);assert.match(render(f),/Check saved client/);assert.doesNotMatch(render(f),/Client details saved|PRIVATE NETWORK/);
 f.controller.cancel();f.controller.beginAdd();f.controller.setField("fullName","Do not change");assert.equal(f.generated(),1);assert.equal(f.controller.getSnapshot().draft.fullName,"Synthetic client");
 await f.controller.checkSaved();assert.equal(f.controller.getSnapshot().uncertain,false);assert.match(render(f),/have been confirmed/);assert.deepEqual(f.requests.map(r=>r.body.operation),["list","create","get","list"]);
});
test("a missing record after uncertainty allows only an explicit retry with the original UUID and identical payload",async()=>{
 let attempts=0;const f=fixture(async b=>b.operation==="create"?++attempts===1?json({error:"private"},503):json({client:row()}):b.operation==="get"?json({error:"client_not_found"},404):json({clients:[],nextCursor:null}));
 await add(f);await f.controller.save();await f.controller.checkSaved();assert.equal(f.controller.getSnapshot().uncertain,true);assert.match(render(f),/does not confirm that the earlier save failed/);assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);
 await f.controller.retry();const writes=f.requests.filter(r=>r.body.operation==="create");assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);assert.equal(f.generated(),1);assert.equal(f.controller.getSnapshot().uncertain,false);
});
test("load failures retain existing rows and expose a retry instead of a fabricated empty state",async()=>{
 let fail=false;const f=fixture(async()=>fail?json({error:"PRIVATE SQL"},503):json({clients:[row()],nextCursor:null}));await f.controller.load();fail=true;await f.controller.load();assert.match(render(f),/Retry loading clients/);assert.match(render(f),/Synthetic client/);assert.doesNotMatch(render(f),/No clients yet|PRIVATE SQL/);fail=false;await f.controller.load();assert.equal(f.controller.getSnapshot().status,"ready");
});
test("401 clears Client data and requests authoritative session refresh; missing business is distinct",async()=>{
 let status=200;const f=fixture(async()=>status===200?json({clients:[row()],nextCursor:null}):json({error:"private"},status));await f.controller.load();status=401;await f.controller.load();assert.equal(f.expired(),1);assert.deepEqual(f.controller.getSnapshot().rows,[]);assert.doesNotMatch(render(f),/Synthetic client/);assert.match(render(f),/Sign in again/);
 const missing=fixture(async()=>json({error:"business_required"},409));await missing.controller.load();assert.match(render(missing),/Set up your business on Home/);assert.doesNotMatch(render(missing),/Add client|No clients yet/);
});
test("validation and rate limits preserve input; Retry-After disables actions until its deadline",async()=>{
 let now=1000,status=422;const f=fixture(async b=>b.operation==="create"?json({error:"PRIVATE"},status,{"retry-after":"5"}):json({clients:[],nextCursor:null}),{now:()=>now});await add(f);
 await f.controller.save();assert.match(render(f),/Check the client details/);assert.equal(f.controller.getSnapshot().draft.fullName,"Synthetic client");assert.equal(f.controller.getSnapshot().uncertain,false);
 status=429;await f.controller.save();assert.equal(f.controller.canSave(),false);assert.match(render(f),/Wait 5 seconds/);now=5999;f.controller.resume();assert.equal(f.controller.canSave(),false);now=6000;f.controller.resume();assert.equal(f.controller.canSave(),true);assert.doesNotMatch(render(f),/PRIVATE/);
});
test("malformed or wrong-ID success never becomes a confirmed save and does not trigger automatic mutation retries",async()=>{
 for(const response of [{client:{...row(),businessId:"forged"}},{client:row({id:id2})}]){
  const f=fixture(async b=>b.operation==="create"?json(response):json({clients:[],nextCursor:null}));await add(f);await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.requests.length,2);assert.doesNotMatch(render(f),/Client details saved/);
 }
});
test("different-origin requests never fetch, and displayed client data is escaped",async()=>{
 const api=createClientRecordClient(origin,{currentOrigin:()=>"https://other.invalid",fetch:async()=>assert.fail("Wrong origin must not fetch")});assert.equal((await api.list()).ok,false);
 const f=fixture(async()=>json({clients:[row({fullName:"<script>client</script>"})],nextCursor:null}));await f.controller.load();assert.match(render(f),/&lt;script&gt;/);assert.doesNotMatch(render(f),/<script>/);
});
test("form labels, optional fields, pending detail state and parent disabled state remain accessible",async()=>{
 let release;const f=fixture(async b=>b.operation==="get"?new Promise(r=>{release=()=>r(json({client:row()}));}):json({clients:[row()],nextCursor:null}));await f.controller.load();
 const pending=f.controller.select(id);assert.match(render(f),/Loading client details/);assert.match(render(f),/aria-busy="true"/);release();await pending;
 f.controller.edit();f.controller.setField("fullName","Edited");const tree=hooks(Clients,{controller:f.controller,disabled:true})();assert.equal(submit(tree).props.disabled,true);
 const html=render(f);for(const field of ["fullName","phone","email"])assert.match(html,new RegExp('for="client-'+field+'"'));
 assert.match(html,/Phone number \(optional\)/);assert.match(html,/Email address \(optional\)/);
});

test("create conflict preserves the intended UUID and requires reconciliation instead of overwriting or starting over",async()=>{
 const f=fixture(async b=>b.operation==="create"?json({error:"client_conflict"},409):json({clients:[],nextCursor:null}));await add(f);await f.controller.save();
 assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.controller.getSnapshot().createId,id);assert.match(render(f),/conflicts with saved client details/);
 f.controller.beginAdd();assert.equal(f.generated(),1);assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);
});
test("uncertain edits reconcile saved details without replacing them optimistically",async()=>{
 let saved=row({phone:"1234567"});const f=fixture(async b=>{
  if(b.operation==="list")return json({clients:[saved],nextCursor:null});
  if(b.operation==="update")throw Error("private lost response");return json({client:saved});
 });await f.controller.load();await f.controller.select(id);f.controller.edit();f.controller.setField("phone","");await f.controller.save();
 assert.equal(f.controller.getSnapshot().selected.phone,"1234567");assert.equal(f.controller.getSnapshot().uncertain,true);await f.controller.checkSaved();
 assert.equal(f.controller.getSnapshot().uncertain,false);assert.equal(f.controller.getSnapshot().draft.phone,"1234567");assert.match(render(f),/Current saved details/);assert.equal(f.requests.filter(r=>r.body.operation==="update").length,1);
});
test("pending and uncertain writes install a navigation warning while drafts stay in transient memory",async()=>{
 const f=fixture(async b=>b.operation==="create"?json({error:"unavailable"},503):json({clients:[],nextCursor:null}));await add(f);await f.controller.save();
 const effects=[];hooks(Clients,{controller:f.controller},effects)();const warning=effects.find(effect=>effect.deps?.[0]===true);assert.ok(warning);
 const original=globalThis.window;let listener,removed=false;
 globalThis.window={addEventListener:(event,fn)=>{assert.equal(event,"beforeunload");listener=fn;},removeEventListener:(event,fn)=>{assert.equal(event,"beforeunload");assert.equal(fn,listener);removed=true;}};
 try{const cleanup=warning.callback();let prevented=false;const event={preventDefault(){prevented=true;},returnValue:undefined};listener(event);assert.ok(prevented);assert.equal(event.returnValue,"");cleanup();assert.ok(removed);}
 finally{if(original===undefined)delete globalThis.window;else globalThis.window=original;}
 assert.equal(f.controller.getSnapshot().createId,id);
});
