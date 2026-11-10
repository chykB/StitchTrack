// Offline: real frontend adapter/controller/markup; synthetic HTTP and hook doubles only.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import "./rendering.mjs";
import {createMeasurementClient,createMeasurementsController,createMeasurementIntent} from "../../lib/measurement-client.ts";
import {measurementPath} from "../../lib/measurement-contract.ts";
import {createClientRecordClient,createClientRecordsController} from "../../lib/client-record-client.ts";
const {default:Measurements}=await import("../../app/dashboard/Measurements.tsx");
const {default:Clients}=await import("../../app/dashboard/Clients.tsx");
const origin="http://127.0.0.1:3000",clientId="11111111-1111-4111-8111-111111111111",otherClient="22222222-2222-4222-8222-222222222222";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const version=(patch={})=>({id:id(1),clientId,versionNumber:1,unit:"cm",recordedAt:"2026-11-08T12:00:00.000Z",entries:[{name:"Waist (Round)",value:"40.25"}],...patch});
const json=(body,status=200,headers={})=>Response.json(body,{status,headers});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No live HTTP permitted");test.after(()=>{globalThis.fetch=originalFetch;});
function fixture(reply,options={}){
 const requests=[],storage=new Map();let generated=0,expired=0;
 const browser={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const intent=options.intent??createMeasurementIntent("verified-owner",clientId,()=>browser);
 const api=createMeasurementClient(origin,{currentOrigin:()=>origin,fetch:async(path,init)=>{const body=JSON.parse(init.body);requests.push({path,...init,body});return reply(body,init);}});
 const controller=createMeasurementsController(api,clientId,()=>expired++,{newId:()=>id(++generated+1),intent,...options});
 return {api,controller,requests,storage,intent,expired:()=>expired,generated:()=>generated};
}
const render=(f,disabled=false)=>renderToStaticMarkup(React.createElement(Measurements,{clientId,controller:f.controller,disabled}));
function hooks(Component,props,effects=[]){
 const slots=[];let index=0;
 const state=initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],v=>{slots[i]=typeof v==="function"?v(slots[i]):v;}];};
 const dispatcher={useState:state,useMemo:fn=>{index++;return fn();},useRef:v=>state(()=>({current:v}))[0],useEffect:(callback,deps)=>{index++;effects.push({callback,deps});},useSyncExternalStore:(_s,get)=>{index++;return get();}};
 return()=>{const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,prior=internals.H;index=0;internals.H=dispatcher;try{return Component(props);}finally{internals.H=prior;}};
}
function find(node,predicate){if(!node||typeof node!=="object")return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}}
const button=(tree,label)=>find(tree,n=>n.type==="button"&&n.props.children===label);
const submit=tree=>find(tree,n=>n.type==="button"&&n.props.type==="submit");
async function draft(f,name="Waist (Round)",value="40.25"){
 await f.controller.load();f.controller.begin();const key=f.controller.getSnapshot().draft.entries[0].key;f.controller.setField(key,"name",name);f.controller.setField(key,"value",value);return key;
}
test("empty history loads only the selected Client through the existing authenticated API",async()=>{
 const f=fixture(async()=>json({versions:[],nextCursor:null}));assert.match(render(f),/Loading measurement history/);await f.controller.load();
 assert.match(render(f),/No measurement versions yet/);assert.match(render(f),/Add measurements/);assert.equal(f.requests.length,1);
 const r=f.requests[0];assert.equal(r.path,measurementPath);assert.deepEqual(r.body,{operation:"list",clientId,limit:25});assert.equal(r.credentials,"same-origin");assert.equal(r.cache,"no-store");assert.equal(r.redirect,"error");
 assert.equal(f.generated(),0);assert.equal(f.storage.size,0);
});
test("unit selection and stable add/remove rows use actual form handlers with 1-50 entries",async()=>{
 const f=fixture(async()=>json({versions:[],nextCursor:null}));await f.controller.load();f.controller.begin();const draw=hooks(Measurements,{clientId,controller:f.controller});
 assert.equal(submit(draw()).props.disabled,true);assert.equal(button(draw(),"Remove").props.disabled,true);
 find(draw(),n=>n.type==="select").props.onChange({currentTarget:{value:"in"}});assert.equal(f.controller.getSnapshot().draft.unit,"in");
 const first=f.controller.getSnapshot().draft.entries[0].key;button(draw(),"Add measurement").props.onClick();assert.equal(f.controller.getSnapshot().draft.entries.length,2);
 const remove=find(draw(),n=>n.type==="button"&&n.props["aria-label"]==="Remove measurement 2");remove.props.onClick();assert.deepEqual(f.controller.getSnapshot().draft.entries.map(e=>e.key),[first]);
 for(let i=1;i<50;i++)f.controller.addRow();assert.equal(button(draw(),"Add measurement").props.disabled,true);f.controller.addRow();assert.equal(f.controller.getSnapshot().draft.entries.length,50);
});
test("shared flexible-label and exact string rules drive disabled Save and inline validation",async()=>{
 const f=fixture(async()=>json({versions:[],nextCursor:null})),key=await draft(f);const draw=hooks(Measurements,{clientId,controller:f.controller});
 for(const name of ["A","Waist (Round)","Agbada Width","\u{1f9f5}".repeat(60)]){f.controller.setField(key,"name",name);assert.equal(f.controller.canSave(),true);}
 for(const name of [" ","\u0085","A\u0000B","\u{1f9f5}".repeat(61)]){f.controller.setField(key,"name",name);assert.equal(submit(draw()).props.disabled,true);assert.match(render(f),/aria-invalid="true"/);}
 f.controller.setField(key,"name","Sleeve Length");
 for(const value of ["0.01","1","40.25","1000.00"]){f.controller.setField(key,"value",value);assert.equal(f.controller.canSave(),true);}
 for(const value of ["","0","-1","1000.01","1.001","1.000","1e2","1,2"]){f.controller.setField(key,"value",value);assert.equal(submit(draw()).props.disabled,true);assert.match(render(f),/aria-invalid="true"/);}
 const html=render(f);assert.match(html,/inputMode="decimal"|inputmode="decimal"/);assert.doesNotMatch(html,/type="number"/);
 const css=readFileSync(new URL("../../app/dashboard/dashboard.module.css",import.meta.url),"utf8");assert.match(css,/measurementRow[^}]*min-inline-size: 0/u);assert.match(css,/measurements select:focus-visible/u);
});
test("save uses one UUID, decimal strings, complete entries and the server-assigned immutable version",async()=>{
 let saved;const f=fixture(async b=>b.operation==="create"?(saved=version({id:b.id,unit:b.unit,entries:b.entries,versionNumber:4}),json({version:saved})):json({versions:[],nextCursor:null}));
 const key=await draft(f," Agbada Width ","1000.00");const draw=hooks(Measurements,{clientId,controller:f.controller});let prevented=false;
 find(draw(),n=>n.type==="form").props.onSubmit({preventDefault(){prevented=true;}});await new Promise(r=>setImmediate(r));assert.equal(prevented,true);
 const write=f.requests.find(r=>r.body.operation==="create");assert.deepEqual(write.body,{operation:"create",id:id(2),clientId,unit:"cm",entries:[{name:"Agbada Width",value:"1000"}]});
 assert.equal(f.generated(),1);assert.equal(f.storage.size,0);assert.match(render(f),/Measurement version 4 saved/);assert.match(render(f),/Version 4/);assert.match(render(f),/1000 cm/);
 assert.equal(f.controller.getSnapshot().selected.id,saved.id);assert.equal(f.controller.getSnapshot().rows[0].id,saved.id);assert.equal(f.controller.getSnapshot().draft.entries[0].key,key);
});
test("pending submission freezes fields and prevents repeated clicks from creating another request",async()=>{
 let release;const f=fixture(async b=>b.operation==="create"?new Promise(r=>{release=()=>r(json({version:version({id:b.id,entries:b.entries})}));}):json({versions:[],nextCursor:null}));
 const key=await draft(f),pending=f.controller.save();assert.equal(await f.controller.save(),false);assert.equal(f.controller.canSave(),false);assert.match(render(f),/Saving\.\.\./);
 f.controller.setField(key,"value","99");f.controller.addRow();f.controller.cancel();assert.equal(f.controller.getSnapshot().draft.entries[0].value,"40.25");assert.equal(f.controller.getSnapshot().draft.entries.length,1);
 assert.equal(f.storage.size,1);assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);release();await pending;
});
test("saved versions are read-only; copy populates a separate draft and creates a fresh version",async()=>{
 const original=version({unit:"in",entries:[{name:"Hip",value:"16.5"},{name:"Thigh",value:"9.25"}]}),before=structuredClone(original);
 const f=fixture(async b=>b.operation==="list"?json({versions:[original],nextCursor:null}):b.operation==="get"?json({version:original}):json({version:version({id:b.id,versionNumber:2,unit:b.unit,entries:b.entries})}));
 await f.controller.load();await f.controller.open(original.id);const html=render(f);assert.match(html,/16\.5 in/);assert.doesNotMatch(html,/<input|<form|>Edit|>Delete/);
 const draw=hooks(Measurements,{clientId,controller:f.controller});button(draw(),"Copy to new version").props.onClick();assert.equal(f.controller.getSnapshot().draft.unit,"in");assert.deepEqual(f.controller.getSnapshot().draft.entries.map(({name,value})=>({name,value})),original.entries);
 assert.equal(f.requests.length,2);assert.equal(f.generated(),0);f.controller.setField(f.controller.getSnapshot().draft.entries[0].key,"value","17.25");await f.controller.save();
 const write=f.requests.at(-1).body;assert.equal(write.operation,"create");assert.notEqual(write.id,original.id);assert.equal(write.unit,"in");assert.deepEqual(original,before);assert.match(render(f),/Version 2/);
});
test("pagination is explicit, bounded and newest-first without fetching every page",async()=>{
 const newer=version({versionNumber:3}),older=version({id:id(3),versionNumber:2});
 const f=fixture(async b=>json(b.cursor?{versions:[older],nextCursor:null}:{versions:[newer],nextCursor:{versionNumber:3}}));
 await f.controller.load();assert.equal(f.requests.length,1);assert.match(render(f),/Load more versions/);await f.controller.loadMore();assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1].body,{operation:"list",clientId,limit:25,cursor:{versionNumber:3}});
 assert.deepEqual(f.controller.getSnapshot().rows.map(v=>v.versionNumber),[3,2]);assert.doesNotMatch(render(f),/Load more versions/);assert.equal(await f.controller.loadMore(),false);
});
test("Unicode duplicate rejection remains server-authoritative and preserves the entire editable draft",async()=>{
 const f=fixture(async b=>b.operation==="create"?json({error:"validation_failed"},422):json({versions:[],nextCursor:null})),key=await draft(f,"\u00c9paule","1");
 f.controller.addRow();const second=f.controller.getSnapshot().draft.entries[1].key;f.controller.setField(second,"name","e\u0301PAULE");f.controller.setField(second,"value","2");
 assert.equal(f.controller.canSave(),true);const before=structuredClone(f.controller.getSnapshot().draft);await f.controller.save();assert.deepEqual(f.controller.getSnapshot().draft,before);
 assert.equal(f.controller.getSnapshot().uncertain,false);assert.match(render(f),/equivalent Unicode spelling may be duplicates/);assert.equal(f.storage.size,0);f.controller.setField(key,"name","Different label");assert.equal(f.controller.canSave(),true);
});
test("lost response retains the exact UUID/payload; read reconciliation confirms without another create",async()=>{
 let saved;const f=fixture(async b=>{if(b.operation==="create"){saved=version({id:b.id,entries:b.entries});throw Error("PRIVATE network error");}return b.operation==="get"?json({version:saved}):json({versions:[],nextCursor:null});});
 const key=await draft(f);await f.controller.save();const state=f.controller.getSnapshot();assert.equal(state.uncertain,true);assert.equal(state.createId,id(2));assert.equal(f.storage.size,1);assert.match(render(f),/could not be confirmed/);assert.doesNotMatch(render(f),/version 1 saved|PRIVATE/);
 f.controller.begin();f.controller.cancel();f.controller.setUnit("in");f.controller.setField(key,"value","99");assert.equal(f.controller.getSnapshot().draft.entries[0].value,"40.25");assert.equal(f.generated(),1);
 await f.controller.checkSaved();assert.equal(f.controller.getSnapshot().uncertain,false);assert.equal(f.storage.size,0);assert.match(render(f),/has been confirmed/);assert.deepEqual(f.requests.map(r=>r.body.operation),["list","create","get"]);
});
test("unconfirmed 503 and absent record permit only an explicit identical retry with the original UUID",async()=>{
 let attempts=0;const f=fixture(async b=>b.operation==="create"?++attempts===1?json({error:"unavailable"},503):json({version:version({id:b.id,entries:b.entries})}):b.operation==="get"?json({error:"measurement_not_found"},404):json({versions:[],nextCursor:null}));
 await draft(f);await f.controller.save();await f.controller.checkSaved();assert.equal(f.controller.getSnapshot().uncertain,true);assert.match(render(f),/does not confirm that the earlier save failed/);assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);
 await f.controller.retry();const writes=f.requests.filter(r=>r.body.operation==="create");assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);assert.equal(f.generated(),1);
});
test("refresh recovery restores only the scoped UUID and never replays a create or allocates another UUID",async()=>{
 let saved;const f=fixture(async b=>{if(b.operation==="create"){saved=version({id:b.id,entries:b.entries});throw Error("lost response");}return b.operation==="get"?json({version:saved}):json({versions:[],nextCursor:null});});
 await draft(f);await f.controller.save();assert.deepEqual([...f.storage.values()],[id(2)]);assert.doesNotMatch(JSON.stringify([...f.storage]),/Waist|40\.25|session_token/);
 let generated=0;const refreshed=createMeasurementsController(f.api,clientId,()=>{},{intent:f.intent,newId:()=>{generated++;return id(9);}});await refreshed.load();
 assert.equal(refreshed.getSnapshot().uncertain,true);assert.equal(refreshed.getSnapshot().createId,id(2));assert.equal(refreshed.getSnapshot().submitted,null);refreshed.begin();assert.equal(await refreshed.retry(),false);assert.equal(generated,0);
 assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);await refreshed.checkSaved();assert.equal(refreshed.getSnapshot().selected.id,id(2));assert.equal(f.storage.size,0);
 const other=createMeasurementIntent("other-account",clientId,()=>({getItem:()=>null,setItem(){},removeItem(){}}));assert.equal(other.read(),null);
});
test("rate limiting preserves drafts and disables actions until Retry-After expires",async()=>{
 let now=1000;const f=fixture(async b=>b.operation==="create"?json({error:"limited"},429,{"retry-after":"5"}):json({versions:[],nextCursor:null}),{now:()=>now});await draft(f);await f.controller.save();
 assert.match(render(f),/Wait 5 seconds/);assert.equal(f.controller.canSave(),false);assert.equal(f.storage.size,0);now=5999;f.controller.resume();assert.equal(f.controller.canSave(),false);now=6000;f.controller.resume();assert.equal(f.controller.canSave(),true);
});
test("expired sessions clear cached measurements and refresh the existing session controller",async()=>{
 let status=200;const f=fixture(async()=>status===200?json({versions:[version()],nextCursor:null}):json({error:"PRIVATE"},401));await f.controller.load();status=401;await f.controller.load();
 assert.equal(f.expired(),1);assert.deepEqual(f.controller.getSnapshot().rows,[]);assert.match(render(f),/Sign in again/);assert.doesNotMatch(render(f),/Version 1|PRIVATE/);
});
test("load errors preserve known rows; wrong-client, malformed and wrong-ID responses fail closed",async()=>{
 let failed=false;const f=fixture(async()=>failed?json({error:"PRIVATE"},503):json({versions:[version()],nextCursor:null}));await f.controller.load();failed=true;await f.controller.load();assert.match(render(f),/Retry loading measurements/);assert.match(render(f),/Version 1/);assert.doesNotMatch(render(f),/No measurement versions yet|PRIVATE/);
 for(const response of [{version:version({id:id(9)})},{version:version({clientId:otherClient})},{version:{...version(),ownerId:"forged"}}]){
  const wrong=fixture(async b=>b.operation==="create"?json(response):json({versions:[],nextCursor:null}));await draft(wrong);await wrong.controller.save();assert.equal(wrong.controller.getSnapshot().uncertain,true);assert.equal(wrong.requests.length,2);
 }
 const outsider=fixture(async()=>json({versions:[version({clientId:otherClient})],nextCursor:null}));await outsider.controller.load();assert.equal(outsider.controller.getSnapshot().rows.length,0);
});
test("browser storage failures prevent untracked writes, while account/client intent keys stay isolated",async()=>{
 const map=new Map(),browser={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const a=createMeasurementIntent("account-a",clientId,()=>browser),b=createMeasurementIntent("account-b",clientId,()=>browser),c=createMeasurementIntent("account-a",otherClient,()=>browser);
 a.write(id(2));assert.equal(b.read(),null);assert.equal(c.read(),null);assert.throws(()=>a.write(id(3)));assert.equal(a.read(),id(2));a.clear(id(3));assert.equal(a.read(),id(2));a.clear(id(2));assert.equal(map.size,0);
 const f=fixture(async()=>json({versions:[],nextCursor:null}),{intent:{read:()=>null,write(){throw Error("PRIVATE quota");},clear(){}}});await draft(f);await f.controller.save();assert.equal(f.requests.length,1);assert.match(render(f),/no save request was sent/);assert.doesNotMatch(render(f),/PRIVATE/);
});
test("forms use accessible labels, real disabled states, navigation warnings and escaped label text",async()=>{
 const f=fixture(async b=>b.operation==="create"?json({error:"unavailable"},503):json({versions:[],nextCursor:null}));await draft(f);const html=render(f);assert.match(html,/for="measurement-unit"/);assert.match(html,/for="measurement-\d+-name"/);assert.match(html,/for="measurement-\d+-value"/);
 const tree=hooks(Measurements,{clientId,controller:f.controller,disabled:true})();assert.equal(submit(tree).props.disabled,true);
 await f.controller.save();const effects=[];hooks(Measurements,{clientId,controller:f.controller},effects)();const effect=effects.find(e=>e.callback.toString().includes("beforeunload"));assert.ok(effect);
 const prior=globalThis.window;let handler,removed=false;globalThis.window={addEventListener:(_e,fn)=>{handler=fn;},removeEventListener:()=>{removed=true;}};
 try{const cleanup=effect.callback();const event={preventDefault(){this.prevented=true;}};handler(event);assert.equal(event.prevented,true);cleanup();assert.equal(removed,true);}finally{if(prior===undefined)delete globalThis.window;else globalThis.window=prior;}
 const details=fixture(async b=>b.operation==="get"?json({version:version({entries:[{name:"<script>label</script>",value:"1"}]})}):json({versions:[],nextCursor:null}));await details.controller.load();await details.controller.open(id(1));assert.match(render(details),/&lt;script&gt;label&lt;\/script&gt;/);assert.doesNotMatch(render(details),/<script>/);
});
test("Client details expose Measurements through the existing dashboard and retain Client editing",async()=>{
 const row={id:clientId,fullName:"Synthetic client",phone:null,email:null,createdAt:"2026-11-08T12:00:00.000Z",updatedAt:"2026-11-08T12:00:00.000Z"};
 const api=createClientRecordClient(origin,{currentOrigin:()=>origin,fetch:async(_path,init)=>JSON.parse(init.body).operation==="list"?json({clients:[row],nextCursor:null}):json({client:row})}),controller=createClientRecordsController(api,()=>{});await controller.load();await controller.select(clientId);
 const html=renderToStaticMarkup(React.createElement(Clients,{controller,measurementContext:{origin,userId:"verified-owner",sessionController:{refresh:async()=>{}}}}));
 assert.match(html,/Synthetic client/);assert.match(html,/>Measurements</);assert.match(html,/Edit client/);assert.match(html,/Loading measurement history/);
});

test("uncertain conflicts retain their original reference and 401 during reconciliation cannot lose refresh recovery",async()=>{
 let status=409;const f=fixture(async b=>b.operation==="create"?json({error:"measurement_conflict"},status):b.operation==="get"?json({error:"unauthenticated"},401):json({versions:[],nextCursor:null}));
 await draft(f);await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.match(render(f),/conflicts with saved measurements/);assert.equal(f.storage.size,1);
 await f.controller.checkSaved();assert.equal(f.expired(),1);assert.equal(f.storage.size,1);assert.equal(f.requests.filter(r=>r.body.operation==="create").length,1);
});
test("cancel discards only unsaved changes and never submits or alters a saved version",async()=>{
 const original=version();const f=fixture(async b=>b.operation==="get"?json({version:original}):json({versions:[original],nextCursor:null}));
 await f.controller.load();await f.controller.open(original.id);f.controller.begin(true);f.controller.setField(f.controller.getSnapshot().draft.entries[0].key,"name","Changed draft");
 f.controller.cancel();assert.equal(f.controller.getSnapshot().mode,"details");assert.deepEqual(f.controller.getSnapshot().selected,original);assert.equal(f.generated(),0);assert.equal(f.requests.some(r=>r.body.operation==="create"),false);
});
test("different-origin, forbidden and missing-business responses do not expose technical errors",async()=>{
 const other=createMeasurementClient(origin,{currentOrigin:()=>"https://other.invalid",fetch:async()=>assert.fail("Do not fetch another origin")});assert.equal((await other.list(clientId)).ok,false);
 for(const [body,status,pattern]of [[{error:"business_required"},409,/Set up your business on Home/],[{error:"PRIVATE"},403,/access was refused/],[{error:"PRIVATE"},404,/no longer available/]]){
  const f=fixture(async()=>json(body,status));await f.controller.load();assert.match(render(f),pattern);assert.doesNotMatch(render(f),/PRIVATE|No measurement versions yet/);
 }
});
