// Offline frontend adapters/controllers and actual React markup. No browser or PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {createOrderClient,createOrderIntent,createOrdersController,orderDraftValidation} from "../../lib/order-client.ts";
import {createClientRecordClient} from "../../lib/client-record-client.ts";
import {orderPath} from "../../lib/order-contract.ts";
import {createMeasurementClient} from "../../lib/measurement-client.ts";
import {measurementPath} from "../../lib/measurement-contract.ts";
import {clientRecordPath} from "../../lib/client-record-contract.ts";
const {default:Orders,OrdersView}=await import("../../app/dashboard/Orders.tsx");
const origin="http://127.0.0.1:3000",id="11111111-1111-4111-8111-111111111111",id2="22222222-2222-4222-8222-222222222222",clientId="33333333-3333-4333-8333-333333333333",versionId="44444444-4444-4444-8444-444444444444",itemId="55555555-5555-4555-8555-555555555555",item2="66666666-6666-4666-8666-666666666666";
const timestamp="2026-11-09T12:00:00.000Z",row=(patch={})=>({id,clientId,createdAt:timestamp,updatedAt:timestamp,...patch});
const order=(patch={})=>({...row(),items:[{id:itemId,description:"Agbada with lining",measurementVersionId:versionId,createdAt:timestamp,updatedAt:timestamp},{id:item2,description:"Waistcoat",measurementVersionId:null,createdAt:timestamp,updatedAt:timestamp}],...patch});
const client=(patch={})=>({id:clientId,fullName:"Synthetic client",phone:null,email:null,createdAt:timestamp,updatedAt:timestamp,...patch});
const json=(body,status=200,headers={})=>Response.json(body,{status,headers});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No live HTTP allowed");test.after(()=>{globalThis.fetch=originalFetch;});
function fixture(reply,options={}){
 const requests=[];let expired=0;const fetch=async(path,init)=>{const body=JSON.parse(init.body);assert.ok(["list","get","create","update_item"].includes(body.operation));requests.push({path,...init,body});return reply(body,path,init);};
 const api=createOrderClient(origin,{currentOrigin:()=>origin,fetch}),clients=createClientRecordClient(origin,{currentOrigin:()=>origin,fetch}),controller=createOrdersController(api,clients,()=>expired++,options);
 return {api,controller,requests,expired:()=>expired};
}
const render=(f,disabled=false)=>renderToStaticMarkup(React.createElement(Orders,{controller:f.controller,disabled}));
function hooks(Component,props,effects=[]){const slots=[];let index=0;const state=v=>{const i=index++;if(!(i in slots))slots[i]=v;return [slots[i],v=>{slots[i]=v;}];};const dispatcher={useState:state,useMemo:(factory,deps)=>{const i=index++,prior=slots[i];if(!prior||prior.deps.length!==deps.length||deps.some((dep,j)=>!Object.is(dep,prior.deps[j])))slots[i]={deps,value:factory()};return slots[i].value;},useRef:v=>state({current:v})[0],useEffect:(callback,deps)=>{index++;effects.push({callback,deps});},useSyncExternalStore:(_s,get)=>{index++;return get();}};
 return()=>{const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,prior=internals.H;index=0;internals.H=dispatcher;try{return Component(props);}finally{internals.H=prior;}};}
function find(node,predicate){if(!node||typeof node!=="object")return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const value=find(child,predicate);if(value)return value;}}
const defaultReply=(body,path)=>path===clientRecordPath?json({client:client()}):body.operation==="list"?json({orders:[row()],nextCursor:null}):json({order:order()});
test("Orders starts loading, renders a genuine empty state and sends only a bounded list request",async()=>{
 const f=fixture(async()=>json({orders:[],nextCursor:null}));assert.match(render(f),/Loading orders/);await f.controller.load();const html=render(f);assert.match(html,/No orders yet/);assert.doesNotMatch(html,/Edit|Delete|Planned|Agbada/);assert.equal(f.requests.length,1);
 const r=f.requests[0];assert.equal(r.path,orderPath);assert.deepEqual(r.body,{operation:"list",limit:25});assert.equal(r.method,"POST");assert.equal(r.credentials,"same-origin");assert.equal(r.cache,"no-store");assert.equal(r.redirect,"error");assert.equal(r.referrerPolicy,"no-referrer");assert.equal(r.headers["content-type"],"application/json");assert.equal(r.signal.aborted,false);
});
test("explicit cursor pagination preserves newest-first pages and never fetches all Orders, Clients or item counts",async()=>{
 const first=row(),second=row({id:id2,createdAt:"2026-11-08T12:00:00.000Z"}),cursor={id:first.id,createdAt:first.createdAt};const f=fixture(async b=>json(b.cursor?{orders:[second],nextCursor:null}:{orders:[first],nextCursor:cursor}));
 await f.controller.load();assert.equal(f.requests.length,1);assert.match(render(f),/Load more orders/);assert.match(render(f),new RegExp(clientId));assert.doesNotMatch(render(f),/clothing items|Synthetic client/);
 await f.controller.loadMore();assert.deepEqual(f.requests[1].body,{operation:"list",limit:25,cursor});assert.equal(f.controller.getSnapshot().rows.length,2);assert.doesNotMatch(render(f),/Load more orders/);assert.equal(await f.controller.loadMore(),false);assert.equal(f.requests.length,2);
});
test("list selection opens actual Order get then authorized Client get, showing all clothes, references and timestamps",async()=>{
 const f=fixture(defaultReply);await f.controller.load();const draw=hooks(Orders,{controller:f.controller});const button=find(draw(),n=>n.type==="button"&&n.props['aria-label']===`View order ${id}`);assert.ok(button);button.props.onClick();await new Promise(resolve=>setTimeout(resolve,0));
 const html=render(f);assert.deepEqual(f.requests.map(r=>[r.path,r.body]),[[orderPath,{operation:"list",limit:25}],[orderPath,{operation:"get",id}],[clientRecordPath,{operation:"get",id:clientId}]]);
 for(const text of ["Order details","Synthetic client","Clothing items (2)","Agbada with lining","Waistcoat","Not selected","Saved measurements selected",versionId,"Back to Orders"])assert.ok(html.includes(text),text);
 assert.match(html,/<time dateTime="2026-11-09T12:00:00.000Z"/i);assert.doesNotMatch(html,/<form|<input|Delete|payment|approval|latest measurement/i);
 find(draw(),n=>n.type==="button"&&n.props.children==="Back to Orders").props.onClick();assert.equal(f.controller.getSnapshot().mode,"list");assert.match(render(f),/Your orders/);assert.equal(f.requests.length,3);
});
test("loading detail and Client states remain accessible and repeated selections do not issue duplicate reads",async()=>{
 let detail,contact;const f=fixture((body,path)=>path===clientRecordPath?new Promise(resolve=>{contact=()=>resolve(json({client:client()}));}):body.operation==="get"?new Promise(resolve=>{detail=()=>resolve(json({order:order()}));}):json({orders:[row()],nextCursor:null}));
 await f.controller.load();const pending=f.controller.open(id);assert.match(render(f),/Loading order details/);assert.match(render(f),/aria-busy="true"/);assert.equal(await f.controller.open(id),false);assert.equal(f.requests.length,2);
 detail();await new Promise(resolve=>setTimeout(resolve,0));assert.match(render(f),/Loading client details/);assert.match(render(f),/Agbada with lining/);contact();await pending;assert.match(render(f),/Synthetic client/);
});
test("list/next-page failures retain confirmed rows, preserve the cursor and offer an explicit retry",async()=>{
 let fail=false;const cursor={createdAt:timestamp,id};const f=fixture(async b=>fail?json({error:"PRIVATE SQL"},503):json({orders:[row()],nextCursor:b.cursor?null:cursor}));await f.controller.load();fail=true;await f.controller.loadMore();assert.match(render(f),/Retry loading orders/);assert.doesNotMatch(render(f),/No orders yet|PRIVATE SQL/);assert.equal(f.controller.getSnapshot().rows.length,1);assert.deepEqual(f.controller.getSnapshot().cursor,cursor);
 const before=f.requests.length;await f.controller.retry();assert.equal(f.requests.length,before+1);assert.deepEqual(f.requests.at(-1).body.cursor,cursor);
});
test("inaccessible Order details expose no data and retry uses the original Order ID",async()=>{
 const f=fixture(async b=>b.operation==="get"?json({error:"order_not_found"},404):json({orders:[row()],nextCursor:null}));await f.controller.load();await f.controller.open(id);const html=render(f);assert.match(html,/This order is no longer available/);assert.match(html,/Retry loading order/);assert.match(html,/Back to Orders/);assert.doesNotMatch(html,/Agbada|Synthetic client/);await f.controller.retry();assert.deepEqual(f.requests.at(-1).body,{operation:"get",id});
});
test("Client failure preserves authorized Order information and supports retry without another Order fetch",async()=>{
 let fail=true;const f=fixture(async(body,path)=>path===clientRecordPath?fail?json({error:"PRIVATE"},503):json({client:client({phone:"1234567",email:"client@example.invalid"})}):defaultReply(body,path));await f.controller.load();await f.controller.open(id);
 assert.match(render(f),/Client details could not be loaded/);assert.match(render(f),/Agbada/);assert.doesNotMatch(render(f),/PRIVATE|Synthetic client/);fail=false;await f.controller.retryClient();assert.match(render(f),/Synthetic client/);assert.match(render(f),/client@example.invalid/);assert.equal(f.requests.filter(r=>r.path===orderPath&&r.body.operation==="get").length,1);
});
test("401 at the Order or Client stage clears all private state and requests authoritative session refresh",async()=>{
 for(const atClient of [false,true]){let expire=false;const f=fixture(async(body,path)=>expire&&((path===clientRecordPath)===atClient)?json({error:"PRIVATE"},401):defaultReply(body,path));await f.controller.load();if(!atClient)await f.controller.open(id);expire=true;if(atClient)await f.controller.open(id);else await f.controller.load();
 assert.equal(f.expired(),1);assert.equal(f.controller.getSnapshot().status,"unauthenticated");assert.deepEqual(f.controller.getSnapshot().rows,[]);assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.controller.getSnapshot().client,null);assert.match(render(f),/Sign in again/);assert.doesNotMatch(render(f),/Agbada|Synthetic client/);}
});
test("missing business and forbidden requests hide records without a fabricated empty state",async()=>{
 for(const [status,error,expected]of [[409,"business_required","Set up your business"],[403,"origin_not_allowed","Access to orders was refused"]]){const f=fixture(async()=>json({error},status));await f.controller.load();assert.match(render(f),new RegExp(expected));assert.doesNotMatch(render(f),/No orders yet|Agbada/);assert.equal(f.controller.getSnapshot().selected,null);}
});
test("429 pauses retry until Retry-After without automatic requests and never displays raw errors",async()=>{
 let now=1000;const f=fixture(async()=>json({error:"PRIVATE"},429,{"retry-after":"5"}),{now:()=>now});await f.controller.load();assert.equal(f.controller.getSnapshot().retryUntil,6000);assert.match(render(f),/Wait 5 seconds/);assert.match(render(f),/disabled=""/);assert.equal(await f.controller.retry(),false);assert.equal(f.requests.length,1);now=6000;f.controller.resume();await f.controller.retry();assert.equal(f.requests.length,2);assert.doesNotMatch(render(f),/PRIVATE/);
});
test("malformed/wrong-ID replies and broken page ordering/cursors are refused before display",async()=>{
 const invalidPages=[{orders:[row(),row()],nextCursor:null},{orders:[row(),row({id:id2,createdAt:"2026-11-10T12:00:00.000Z"})],nextCursor:null},{orders:[row()],nextCursor:{id:id2,createdAt:timestamp}},{orders:Array.from({length:26},(_,i)=>row({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`})),nextCursor:null}];
 for(const page of invalidPages){const f=fixture(async()=>json(page));await f.controller.load();assert.equal(f.controller.getSnapshot().status,"unavailable");assert.deepEqual(f.controller.getSnapshot().rows,[]);}
 const wrong=fixture(async()=>json({order:order({id:id2})}));assert.equal((await wrong.api.get(id)).ok,false);assert.equal(wrong.requests.length,1);assert.equal((await wrong.api.get("invalid")).ok,false);assert.equal(wrong.requests.length,1);
 const contact=fixture((body,path)=>path===clientRecordPath?json({client:client({id:id2,fullName:"Must not appear"})}):defaultReply(body,path));await contact.controller.load();await contact.controller.open(id);assert.doesNotMatch(render(contact),/Must not appear/);
});
test("back navigation suppresses late detail responses and parent disabled state keeps buttons inactive",async()=>{
 let release;const f=fixture(body=>body.operation==="get"?new Promise(resolve=>{release=()=>resolve(json({order:order()}));}):json({orders:[row()],nextCursor:null}));await f.controller.load();const pending=f.controller.open(id);f.controller.back();release();await pending;assert.equal(f.controller.getSnapshot().mode,"list");assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.requests.length,2);
 const html=render(f,true);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/Agbada/);
});
test("different origins never fetch, data is escaped, and the browser adapter exposes only the approved list, get, create and item-update operations",async()=>{
 const api=createOrderClient(origin,{currentOrigin:()=>"https://other.invalid",fetch:async()=>assert.fail("No cross-origin request")});assert.equal((await api.list()).ok,false);assert.deepEqual(Object.keys(api).sort(),["create","get","list","updateItem"]);
 const f=fixture((body,path)=>path===clientRecordPath?json({client:client({fullName:"<script>client</script>"})}):body.operation==="list"?json({orders:[row()],nextCursor:null}):json({order:order({items:[{...order().items[0],description:"<script>item</script>"}]})}));await f.controller.load();await f.controller.open(id);const html=render(f);assert.match(html,/&lt;script&gt;item/);assert.match(html,/&lt;script&gt;client/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Clothing items \(1\)/);
});
test("initial effect deduplicates repeated mount loading and detail heading receives focus",async()=>{
 const f=fixture(defaultReply),effects=[],draw=hooks(Orders,{controller:f.controller},effects);draw();const initial=effects.find(e=>e.deps?.[0]===f.controller);initial.callback();initial.callback();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.requests.length,1);await f.controller.open(id);effects.length=0;const tree=draw(),heading=find(tree,n=>n.type==="h2");let focused=false;heading.props.ref.current={focus(){focused=true;}};const focus=effects.find(e=>e.deps?.[0]==="details");focus.callback();assert.equal(focused,true);
});

// Mount the actual boundary with local hook/transport doubles, never live HTTP.
async function withMountedViews(reply,verify){
 const storage=Object.getOwnPropertyDescriptor(globalThis,"sessionStorage"),location=Object.getOwnPropertyDescriptor(globalThis,"location"),fetch=globalThis.fetch,requests=[],mounted=[];let refreshes=0;
 Object.defineProperty(globalThis,"location",{configurable:true,value:{origin}});
 const values=new Map();Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});
 globalThis.fetch=async(path,init)=>{const body=JSON.parse(init.body);requests.push({path,body});return reply(body,path,requests.length);};
 const sessionController={refresh:async()=>{refreshes++;}};
 const mount=(userId="synthetic-owner")=>{
   const effects=[],draw=hooks(OrdersView,{origin,userId,sessionController},effects),view=draw(),controller=view.props.controller;
   let cleanup=effects[0].callback();const childEffects=[];hooks(view.type,view.props,childEffects)();
   const start=()=>childEffects[0].callback();
   const mountedView={controller,draw,start,unmount:()=>cleanup(),replay:()=>{cleanup();cleanup=effects[0].callback();start();}};
   mounted.push(mountedView);return mountedView;
 };
 try{await verify({mount,requests,refreshes:()=>refreshes});}finally{
   for(const view of mounted)view.unmount();globalThis.fetch=fetch;
   if(location)Object.defineProperty(globalThis,"location",location);else delete globalThis.location;
   if(storage)Object.defineProperty(globalThis,"sessionStorage",storage);else delete globalThis.sessionStorage;
 }
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));
test("leaving Orders and returning mounts fresh state and reloads rather than retaining rows, errors or cooldowns",async()=>{
 for(const status of [200,503,429])await withMountedViews((_body,_path,count)=>count===1?status===200?json({orders:[row()],nextCursor:null}):json({error:"unavailable"},status,{"retry-after":"5"}):json({orders:[row({id:id2})],nextCursor:null}),async({mount,requests})=>{
   const first=mount();assert.equal(first.draw().props.controller,first.controller);first.start();await settled();
   assert.equal(first.controller.getSnapshot().status,status===200?"ready":"unavailable");
   if(status===429){assert.equal(await first.controller.retry(),false);assert.equal(requests.length,1);}
   first.unmount();const next=mount();assert.notEqual(next.controller,first.controller);
   assert.equal(next.controller.getSnapshot().status,"idle");assert.deepEqual(next.controller.getSnapshot().rows,[]);assert.equal(next.controller.getSnapshot().message,"");assert.equal(next.controller.getSnapshot().retryUntil,null);
   next.start();await settled();assert.equal(requests.length,2);assert.deepEqual(next.controller.getSnapshot().rows.map(row=>row.id),[id2]);
 });
});
test("late list success, errors, expiry and rate limits from an unmounted view cannot affect the new view or shared session",async()=>{
 for(const status of [200,401,503,429]){
   let release;await withMountedViews((_body,_path,count)=>count===1?new Promise(resolve=>{release=()=>resolve(status===200?json({orders:[row()],nextCursor:null}):json({error:"unavailable"},status,{"retry-after":"5"}));}):json({orders:[row({id:id2})],nextCursor:null}),async({mount,requests,refreshes})=>{
     const first=mount();first.start();const abandoned=first.controller.getSnapshot();first.unmount();
     const next=mount();next.start();await settled();const current=next.controller.getSnapshot();release();await settled();
     assert.equal(first.controller.getSnapshot(),abandoned);assert.equal(next.controller.getSnapshot(),current);assert.deepEqual(current.rows.map(row=>row.id),[id2]);assert.equal(refreshes(),0);assert.equal(requests.length,2);
   });
 }
});
test("a late unmounted detail response cannot start a Client request or replace the remounted list",async()=>{
 let release;await withMountedViews((body,path)=>path===orderPath&&body.operation==="get"?new Promise(resolve=>{release=()=>resolve(json({order:order()}));}):json({orders:[row()],nextCursor:null}),async({mount,requests,refreshes})=>{
   const first=mount();first.start();await settled();const pending=first.controller.open(id);const abandoned=first.controller.getSnapshot();first.unmount();
   const next=mount();next.start();await settled();const current=next.controller.getSnapshot();release();assert.equal(await pending,false);
   assert.equal(first.controller.getSnapshot(),abandoned);assert.equal(next.controller.getSnapshot(),current);assert.equal(current.mode,"list");assert.equal(current.selected,null);assert.equal(requests.filter(r=>r.path===clientRecordPath).length,0);assert.equal(refreshes(),0);
 });
});
test("late Client results cannot update an unmounted Order or refresh the new view's shared session",async()=>{
 for(const status of [200,401]){
   let release;await withMountedViews((body,path)=>path===clientRecordPath?new Promise(resolve=>{release=()=>resolve(status===200?json({client:client()}):json({error:"unauthenticated"},401));}):defaultReply(body,path),async({mount,refreshes})=>{
     const first=mount();first.start();await settled();const pending=first.controller.open(id);await settled();assert.equal(first.controller.getSnapshot().pending,"client");
     const abandoned=first.controller.getSnapshot();first.unmount();const next=mount();next.start();await settled();const current=next.controller.getSnapshot();release();assert.equal(await pending,false);
     assert.equal(first.controller.getSnapshot(),abandoned);assert.equal(next.controller.getSnapshot(),current);assert.equal(current.selected,null);assert.equal(refreshes(),0);
   });
 }
});
test("Strict Mode effect replay retains one pending initial request and accepts its result",async()=>{
 let release;await withMountedViews(()=>new Promise(resolve=>{release=()=>resolve(json({orders:[row()],nextCursor:null}));}),async({mount,requests})=>{
   const view=mount();view.start();view.replay();assert.equal(view.draw().props.controller,view.controller);assert.equal(requests.length,1);
   release();await settled();assert.equal(view.controller.getSnapshot().status,"ready");assert.equal(view.controller.getSnapshot().rows.length,1);
   view.replay();assert.equal(requests.length,1);
 });
});
test("an active Orders boundary still forwards session expiry to the existing session controller",async()=>{
 await withMountedViews(()=>json({error:"unauthenticated"},401),async({mount,refreshes})=>{
   const view=mount();view.start();await settled();assert.equal(view.controller.getSnapshot().status,"unauthenticated");assert.equal(refreshes(),1);
 });
});

function creationFixture({reply,options={},storage}={}){
 const requests=[],saved=new Map(),values=storage??new Map();let serial=100,expired=0;
 const tab={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const intent=createOrderIntent("owner-a",()=>tab);
 const version=(chosen=clientId)=>({id:chosen===clientId?versionId:item2,clientId:chosen,versionNumber:1,unit:"cm",recordedAt:timestamp,entries:[{name:"Agbada Width",value:"40.25"}]});
 const fallback=(body,path)=>{
   if(path===clientRecordPath)return body.operation==="list"?json({clients:[client(),client({id:id2,fullName:"Second client"})],nextCursor:null}):json({client:client({id:body.id})});
   if(path===measurementPath)return json({versions:[version(body.clientId)],nextCursor:null});
   if(body.operation==="list")return json({orders:[],nextCursor:null});
   if(body.operation==="get")return saved.has(body.id)?json({order:saved.get(body.id)}):json({error:"order_not_found"},404);
   if(body.operation==="update_item"){
     const order=saved.get(body.id),item=order?.items.find(item=>item.id===body.itemId);if(!item)return json({error:"order_not_found"},404);
     if(item.updatedAt!==body.expectedUpdatedAt)return json({error:"order_conflict"},409);
     const description=body.description??item.description,measurementVersionId=body.measurementVersionId===undefined?item.measurementVersionId:body.measurementVersionId;
     if(description!==item.description||measurementVersionId!==item.measurementVersionId){item.description=description;item.measurementVersionId=measurementVersionId;item.updatedAt=new Date(Date.parse(item.updatedAt)+1).toISOString();}
     return json({order});
   }
   const order={id:body.id,clientId:body.clientId,createdAt:timestamp,updatedAt:timestamp,items:body.items.map(item=>({...item,createdAt:timestamp,updatedAt:timestamp}))};
   // Match the reviewed backend: the Order UUID never overwrites existing content.
   if(saved.has(body.id)){
     const existing=saved.get(body.id),contents=rows=>rows.map(({id,description,measurementVersionId})=>({id,description,measurementVersionId})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
     return existing.clientId===body.clientId&&JSON.stringify(contents(existing.items))===JSON.stringify(contents(order.items))?json({order:existing}):json({error:"order_conflict"},409);
   }
   saved.set(body.id,order);return json({order});
 };
 const fetch=async(path,init)=>{const body=JSON.parse(init.body);requests.push({path,...init,body});return reply?reply(body,path,()=>fallback(body,path)):fallback(body,path);};
 const transport={fetch,currentOrigin:()=>origin},api=createOrderClient(origin,transport),clients=createClientRecordClient(origin,transport),measurements=createMeasurementClient(origin,transport);
 const controller=createOrdersController(api,clients,()=>expired++,{newId:()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,measurements,intent,...options});
 return {controller,api,requests,saved,values,intent,version,expired:()=>expired};
}
async function draft(f){await f.controller.load();await f.controller.beginCreate();await f.controller.chooseClient(clientId);const item=f.controller.getSnapshot().draft.items[0];f.controller.setDescription(item.id,"  Agbada Width and matching trousers  ");return item.id;}
const writes=f=>f.requests.filter(r=>r.path===orderPath&&r.body.operation==="create");
test("Create Order uses existing form handlers, authorized Client choices and optional explicit measurement selection",async()=>{
 const f=creationFixture();await f.controller.load();const draw=hooks(Orders,{controller:f.controller});
 find(draw(),n=>n.type==="button"&&n.props.children==="Create Order").props.onClick();await settled();assert.equal(f.controller.getSnapshot().mode,"create");
 let html=render(f);assert.match(html,/Select an existing client/);assert.match(html,/Synthetic client/);assert.match(html,/Second client/);assert.match(html,/<button type="submit" disabled=""/);assert.doesNotMatch(html,/Agreement|Price|Delivery date/);
 find(draw(),n=>n.type==="select"&&n.props.id==="order-client").props.onChange({currentTarget:{value:clientId}});await settled();
 const item=f.controller.getSnapshot().draft.items[0];find(draw(),n=>n.type==="textarea").props.onChange({currentTarget:{value:"\u00ccr\u00f2 and B\u00f9b\u00e1"}});
 assert.equal(f.controller.canSave(),true);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,null);
 html=render(f);assert.match(html,/Version 1 \u00b7 cm/);assert.match(html,/No measurements selected/);assert.match(html,/<label for="order-client">Client/);assert.match(html,/rows="3"/);
 find(draw(),n=>n.type==="select"&&n.props.id===`order-item-${item.id}-version`).props.onChange({currentTarget:{value:versionId}});assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,versionId);
 find(draw(),n=>n.type==="form").props.onSubmit({preventDefault(){}});await settled();assert.equal(writes(f).length,1);assert.match(render(f),/Order created/);assert.match(render(f),/Order details/);assert.match(render(f),/\u00ccr\u00f2 and B\u00f9b\u00e1/);
});
test("item count, custom Unicode descriptions and exact shared validation disable invalid creation",async()=>{
 const f=creationFixture();const first=await draft(f);f.controller.setDescription(first,"");assert.equal(f.controller.canSave(),false);
 for(const invalid of [" \u0085 ","x".repeat(501),"bad\u0000description","\ud800"]){f.controller.setDescription(first,invalid);assert.equal(f.controller.canSave(),false);assert.equal(await f.controller.save(),false);}
 f.controller.setDescription(first,"\u0085"+"\u{1f9f5}".repeat(500)+"\u0085");assert.equal(f.controller.canSave(),true);
 assert.equal(orderDraftValidation({clientId,items:[]}).success,false);assert.equal(orderDraftValidation({...f.controller.getSnapshot().draft,items:Array(51).fill(f.controller.getSnapshot().draft.items[0])}).success,false);
 f.controller.removeItem(first);assert.equal(f.controller.getSnapshot().draft.items.length,1);
 const draw=hooks(Orders,{controller:f.controller});find(draw(),n=>n.type==="button"&&n.props.children==="Add clothing item").props.onClick();assert.equal(f.controller.getSnapshot().draft.items.length,2);assert.equal(f.controller.canSave(),false);
 const second=f.controller.getSnapshot().draft.items[1];f.controller.setDescription(second.id,"Waist (Round) reference");assert.equal(f.controller.canSave(),true);
 find(draw(),n=>n.type==="button"&&n.props['aria-label']==="Remove clothing item 2").props.onClick();assert.equal(f.controller.getSnapshot().draft.items.length,1);
 for(let i=1;i<55;i++)f.controller.addItem();assert.equal(f.controller.getSnapshot().draft.items.length,50);assert.equal(new Set(f.controller.getSnapshot().draft.items.map(item=>item.id)).size,50);
 assert.equal(find(draw(),n=>n.type==="button"&&n.props.children==="Add clothing item").props.disabled,true);assert.match(render(f),/Maximum of 50 clothing items reached/);assert.equal(writes(f).length,0);
});
test("Client and measurement choices use bounded explicit pagination and reject forged selections",async()=>{
 let clientPage=0,versionPage=0;const f=creationFixture({reply:(body,path,fallback)=>{
   if(path===clientRecordPath&&body.operation==="list"){clientPage++;return json({clients:[client({id:body.cursor?id2:clientId})],nextCursor:body.cursor?null:{id:clientId,createdAt:timestamp}});}
   if(path===measurementPath){versionPage++;return json({versions:[{id:body.cursor?item2:versionId,clientId:body.clientId,versionNumber:body.cursor?1:2,unit:"in",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:body.cursor?null:{versionNumber:2}});}
   return fallback();
 }});await f.controller.load();await f.controller.beginCreate();assert.equal(clientPage,1);assert.equal(await f.controller.chooseClient(itemId),false);
 await f.controller.loadChoices(true);assert.equal(clientPage,2);assert.deepEqual(f.requests.filter(r=>r.path===clientRecordPath).at(-1).body,{operation:"list",limit:25,cursor:{id:clientId,createdAt:timestamp}});
 await f.controller.chooseClient(clientId);assert.equal(versionPage,1);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,null);
 await f.controller.loadVersions(true);assert.equal(versionPage,2);assert.deepEqual(f.requests.filter(r=>r.path===measurementPath).at(-1).body,{operation:"list",clientId,limit:25,cursor:{versionNumber:2}});
 const item=f.controller.getSnapshot().draft.items[0];f.controller.setMeasurement(item.id,item2);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,item2);
 f.controller.setMeasurement(item.id,itemId);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,item2);
 await f.controller.chooseClient(id2);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,null);assert.equal(f.requests.at(-1).body.clientId,id2);
});
test("wrong-Client Measurement responses are rejected without auto-selecting a version",async()=>{
 const f=creationFixture({reply:(body,path,fallback)=>path===measurementPath?json({versions:[{id:versionId,clientId:id2,versionNumber:1,unit:"cm",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:null}):fallback()});
 const item=await draft(f);assert.deepEqual(f.controller.getSnapshot().versions,[]);f.controller.setMeasurement(item,versionId);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,null);assert.equal(f.controller.canSave(),true);assert.match(render(f),/Saved measurements could not be loaded/);
});
test("name-only Client and unselected measurements create one Order with all item IDs and normalized descriptions",async()=>{
 const f=creationFixture();const item=await draft(f);f.controller.addItem();const second=f.controller.getSnapshot().draft.items[1];f.controller.setDescription(second.id,"\u0085B\u00f9b\u00e1\u0085");const id=f.controller.getSnapshot().createId;
 assert.equal(await f.controller.save(),true);assert.equal(writes(f).length,1);const request=writes(f)[0];
 assert.deepEqual(request.body,{operation:"create",id,clientId,items:[{id:item,description:"Agbada Width and matching trousers",measurementVersionId:null},{id:second.id,description:"B\u00f9b\u00e1",measurementVersionId:null}]});
 assert.equal(request.credentials,"same-origin");assert.equal(request.redirect,"error");assert.equal(request.cache,"no-store");assert.equal(f.values.size,0);assert.equal(f.controller.getSnapshot().mode,"details");assert.equal(f.controller.getSnapshot().selected.items.length,2);assert.equal(f.controller.getSnapshot().client.fullName,"Synthetic client");
});
test("pending creation disables controls, freezes the submitted payload and prevents repeated clicks",async()=>{
 let release;const f=creationFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?new Promise(resolve=>{release=()=>resolve(fallback());}):fallback()});const item=await draft(f);const pending=f.controller.save();
 assert.equal(await f.controller.save(),false);assert.equal(await f.controller.retryCreate(),false);f.controller.setDescription(item,"Must not replace");f.controller.addItem();f.controller.cancelCreate();f.controller.back();
 assert.equal(f.controller.getSnapshot().draft.items.length,1);assert.notEqual(f.controller.getSnapshot().draft.items[0].description,"Must not replace");assert.equal(f.controller.getSnapshot().mode,"create");
 assert.match(render(f),/Creating/);assert.match(render(f),/<textarea[^>]*disabled=""/);assert.equal(writes(f).length,1);assert.equal(f.values.size,1);release();assert.equal(await pending,true);
});
test("lost create response reconciles the original UUID with GET and never repeats a write automatically",async()=>{
 const f=creationFixture({reply:(body,path,fallback)=>{const response=fallback();if(path===orderPath&&body.operation==="create")throw Error("response lost after commit");return response;}});await draft(f);const id=f.controller.getSnapshot().createId;
 assert.equal(await f.controller.save(),false);assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.intent.read(),id);assert.match(render(f),/Check saved order/);assert.equal(writes(f).length,1);
 f.controller.cancelCreate();await f.controller.beginCreate();assert.equal(f.controller.getSnapshot().createId,id);assert.equal(await f.controller.checkSaved(),true);assert.equal(f.intent.read(),null);assert.equal(writes(f).length,1);assert.equal(f.controller.getSnapshot().selected.id,id);
});
test("an unavailable save and a missing reconciliation result allow only explicit retry of the same UUID and item contents",async()=>{
 let unavailable=true;const f=creationFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"&&unavailable?json({error:"private"},503):fallback()});const item=await draft(f);await f.controller.save();const original=structuredClone(writes(f)[0].body);
 assert.equal(await f.controller.checkSaved(),false);f.controller.setDescription(item,"Changed");f.controller.setMeasurement(item,versionId);await f.controller.chooseClient(id2);f.controller.addItem();assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(writes(f).length,1);
 unavailable=false;assert.equal(await f.controller.retryCreate(),true);assert.deepEqual(writes(f)[1].body,original);assert.equal(f.saved.size,1);assert.doesNotMatch(render(f),/private/);
});
test("409 and mismatched successful replies remain uncertain and never replace the original draft",async()=>{
 for(const response of ["conflict","mismatch"]){const f=creationFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?response==="conflict"?json({error:"order_conflict"},409):json({order:{id:body.id,clientId,createdAt:timestamp,updatedAt:timestamp,items:body.items.map(item=>({...item,description:"Different",createdAt:timestamp,updatedAt:timestamp}))}}):fallback()});await draft(f);const before=structuredClone(f.controller.getSnapshot().draft);
 await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.deepEqual(f.controller.getSnapshot().draft,before);assert.equal(f.controller.canSave(),false);assert.equal(f.values.size,1);assert.equal(f.controller.getSnapshot().selected,null);}
});
test("422 and stale selections preserve the editable draft while rate limits enforce Retry-After",async()=>{
 for(const status of [422,404,429]){let now=1000;const f=creationFixture({options:{now:()=>now},reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error:"PRIVATE"},status,{"retry-after":"5"}):fallback()});await draft(f);const before=structuredClone(f.controller.getSnapshot().draft);await f.controller.save();
 assert.equal(f.controller.getSnapshot().uncertain,false);assert.deepEqual(f.controller.getSnapshot().draft,before);assert.equal(f.values.size,0);assert.doesNotMatch(render(f),/PRIVATE/);
 if(status===429){assert.equal(f.controller.getSnapshot().retryUntil,6000);assert.equal(await f.controller.save(),false);assert.equal(writes(f).length,1);now=6000;f.controller.resume();assert.equal(f.controller.canSave(),true);}else assert.equal(f.controller.canSave(),true);
 if(status===404)assert.match(render(f),/no longer available/);}
});
test("save references survive navigation/refresh, isolate accounts and never persist Client information",async()=>{
 const storage=new Map(),f=creationFixture({storage,reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error:"unavailable"},503):fallback()});await draft(f);await f.controller.save();const id=f.intent.read();assert.deepEqual([...storage.values()],[id]);
 const fresh=creationFixture({storage});await fresh.controller.load();assert.equal(fresh.controller.getSnapshot().mode,"create");assert.equal(fresh.controller.getSnapshot().uncertain,true);assert.equal(fresh.controller.getSnapshot().createId,id);assert.equal(await fresh.controller.beginCreate(),false);assert.equal(await fresh.controller.retryCreate(),false);assert.match(render(fresh),/Check saved order/);assert.doesNotMatch(render(fresh),/Retry same request/);
 const tab={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};assert.equal(createOrderIntent("owner-b",()=>tab).read(),null);assert.equal(await fresh.controller.checkSaved(),false);assert.equal(fresh.intent.read(),id);
});
test("storage failures fail closed before a write and corrupted intent blocks new creation",async()=>{
 const f=creationFixture({options:{intent:{read:()=>null,write:()=>{throw Error("denied");},clear(){}}}});await draft(f);await f.controller.save();assert.equal(writes(f).length,0);assert.match(render(f),/No order request was sent/);assert.equal(f.controller.getSnapshot().draft.items.length,1);
 const corrupt=creationFixture({options:{intent:{read:()=>{throw Error("corrupt");},write(){},clear(){}}}});await corrupt.controller.load();assert.equal(corrupt.controller.getSnapshot().intentBlocked,true);assert.equal(await corrupt.controller.beginCreate(),false);assert.match(render(corrupt),/could not read the previous save reference/);
});
test("session loss clears the draft; old unmounted save responses cannot expose results or refresh another account",async()=>{
 for(const status of [401,403]){const f=creationFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error:"private"},status):fallback()});await draft(f);await f.controller.save();assert.equal(f.controller.getSnapshot().status,status===401?"unauthenticated":"forbidden");assert.equal(f.controller.getSnapshot().draft.items.length,0);assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.expired(),status===401?1:0);}
 for(const status of [200,401]){let active=true,release;const f=creationFixture({options:{isActive:()=>active},reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?new Promise(resolve=>{release=()=>resolve(status===200?fallback():json({error:"unauthenticated"},401));}):fallback()});await draft(f);const pending=f.controller.save(),before=f.controller.getSnapshot(),id=f.intent.read();active=false;release();assert.equal(await pending,false);assert.equal(f.controller.getSnapshot(),before);assert.equal(f.expired(),0);assert.equal(f.intent.read(),id);}
});
test("unavailable choice lists offer retry and genuine empty Client/measurement states",async()=>{
 let fail=true;const f=creationFixture({reply:(body,path,fallback)=>path===clientRecordPath&&body.operation==="list"?fail?json({error:"private"},503):json({clients:[],nextCursor:null}):fallback()});await f.controller.load();await f.controller.beginCreate();assert.match(render(f),/Clients could not be loaded/);assert.equal(f.controller.canSave(),false);fail=false;await f.controller.loadChoices();assert.match(render(f),/No clients yet/);assert.equal(writes(f).length,0);
 const empty=creationFixture({reply:(body,path,fallback)=>path===measurementPath?json({versions:[],nextCursor:null}):fallback()});await draft(empty);assert.match(render(empty),/No saved measurements for this client/);assert.equal(empty.controller.canSave(),true);
});

test("changing authenticated users during a mounted save isolates the new view and retains only the old user's reconciliation reference",async()=>{
 for(const status of [200,401]){
   let release;await withMountedViews((body,path)=>{
     if(path===clientRecordPath)return json(body.operation==="list"?{clients:[client()],nextCursor:null}:{client:client()});
     if(path===measurementPath)return json({versions:[],nextCursor:null});
     if(body.operation==="create")return new Promise(resolve=>{release=()=>resolve(status===200?json({order:{id:body.id,clientId:body.clientId,createdAt:timestamp,updatedAt:timestamp,items:body.items.map(item=>({...item,createdAt:timestamp,updatedAt:timestamp}))}}):json({error:"unauthenticated"},401));});
     return json({orders:[],nextCursor:null});
   },async({mount,requests,refreshes})=>{
     const first=mount("owner-a");first.start();await settled();await first.controller.beginCreate();await first.controller.chooseClient(clientId);first.controller.setDescription(first.controller.getSnapshot().draft.items[0].id,"Disposable clothing item");
     const originalId=first.controller.getSnapshot().createId,pending=first.controller.save();first.unmount();
     const second=mount("owner-b");second.start();await settled();assert.equal(second.controller.getSnapshot().uncertain,false);assert.equal(second.controller.getSnapshot().mode,"list");
     const current=second.controller.getSnapshot();release();assert.equal(await pending,false);assert.equal(second.controller.getSnapshot(),current);assert.equal(refreshes(),0);
     second.unmount();const restored=mount("owner-a");restored.start();await settled();assert.equal(restored.controller.getSnapshot().uncertain,true);assert.equal(restored.controller.getSnapshot().createId,originalId);assert.equal(requests.filter(r=>r.path===orderPath&&r.body.operation==="create").length,1);
   });
 }
});
test("a rate-limited retry of an uncertain write keeps the original request frozen and bounded",async()=>{
 let attempts=0,now=1000;const f=creationFixture({options:{now:()=>now},reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error:"unavailable"},++attempts===1?503:429,{"retry-after":"5"}):fallback()});
 const item=await draft(f);await f.controller.save();const submitted=structuredClone(f.controller.getSnapshot().submitted);await f.controller.retryCreate();
 assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.controller.getSnapshot().retryUntil,6000);assert.equal(f.intent.read(),submitted.id);f.controller.setDescription(item,"Must not change");assert.deepEqual(f.controller.getSnapshot().submitted,submitted);assert.equal(await f.controller.retryCreate(),false);assert.equal(writes(f).length,2);
 now=6000;f.controller.resume();await f.controller.retryCreate();assert.deepEqual(writes(f).at(-1).body,submitted);
});

async function restoredRecovery(options={}){
 const f=creationFixture(options);f.intent.write(id);await f.controller.load();return f;
}
async function reconstruct(f){
 await f.controller.checkSaved();await f.controller.rebuild();await f.controller.chooseClient(clientId);
 const item=f.controller.getSnapshot().draft.items[0];f.controller.setDescription(item.id,"Reconstructed clothing item");return item.id;
}
test("restored 404 offers explicit reconstruction only, keeping the original Order UUID and optional measurements",async()=>{
 const generated=[],f=await restoredRecovery({options:{newId:()=>{const value=`00000000-0000-4000-8000-${String(700+generated.length).padStart(12,"0")}`;generated.push(value);return value;}}});
 assert.equal(await f.controller.rebuild(),false);assert.deepEqual(generated,[]);assert.doesNotMatch(render(f),/Rebuild using original reference/);assert.equal(writes(f).length,0);
 await f.controller.checkSaved();assert.match(render(f),/earlier write may still commit/);assert.match(render(f),/Rebuild using original reference/);assert.deepEqual(generated,[]);assert.equal(f.controller.getSnapshot().uncertain,true);
 const draw=hooks(Orders,{controller:f.controller});find(draw(),n=>n.type==="button"&&n.props.children==="Rebuild using original reference").props.onClick();await settled();
 assert.equal(generated.length,1);assert.equal(f.controller.getSnapshot().createId,id);assert.equal(f.intent.read(),id);assert.equal(f.controller.getSnapshot().uncertain,false);assert.equal(f.controller.getSnapshot().reserved,true);assert.match(render(f),/Cancel, navigation and refresh keep that reference/);
 assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,null);await f.controller.chooseClient(clientId);f.controller.setDescription(generated[0],"A rebuilt order");f.controller.setMeasurement(generated[0],versionId);
 assert.equal(await f.controller.save(),true);assert.deepEqual(writes(f)[0].body,{operation:"create",id,clientId,items:[{id:generated[0],description:"A rebuilt order",measurementVersionId:versionId}]});assert.equal(f.values.size,0);assert.equal(f.saved.size,1);assert.equal(f.controller.getSnapshot().selected.id,id);assert.equal(generated.length,1);
});
test("an in-memory uncertain payload keeps Retry same request instead of offering reconstruction after 404",async()=>{
 const f=creationFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error:"unavailable"},503):fallback()});await draft(f);await f.controller.save();const submitted=structuredClone(f.controller.getSnapshot().submitted);
 await f.controller.checkSaved();assert.match(render(f),/Retry same request/);assert.doesNotMatch(render(f),/Rebuild using original reference/);assert.equal(await f.controller.rebuild(),false);assert.deepEqual(f.controller.getSnapshot().submitted,submitted);assert.equal(f.controller.getSnapshot().createId,submitted.id);
});
test("cancelling, navigation and refresh cannot release a reconstructed Order reference or allocate another Order UUID",async()=>{
 let generated=0;const f=await restoredRecovery({options:{newId:()=>`00000000-0000-4000-8000-${String(800+generated++).padStart(12,"0")}`}});await reconstruct(f);assert.equal(generated,1);
 f.controller.back();assert.equal(await f.controller.load(),false);assert.equal(await f.controller.beginCreate(),false);assert.equal(generated,1);assert.equal(f.intent.read(),id);
 const draw=hooks(Orders,{controller:f.controller});find(draw(),n=>n.type==="button"&&n.props.children==="Cancel").props.onClick();assert.equal(f.controller.getSnapshot().uncertain,true);assert.match(render(f),/original Order reference is still reserved/);
 f.controller.back();assert.equal(await f.controller.beginCreate(),false);assert.equal(generated,1);assert.deepEqual([...f.values.values()],[id]);
 const refreshed=creationFixture({storage:f.values,options:{newId:()=>assert.fail("Refresh must not allocate an Order UUID")}});await refreshed.controller.load();assert.equal(refreshed.controller.getSnapshot().createId,id);assert.equal(refreshed.controller.getSnapshot().uncertain,true);assert.equal(refreshed.controller.getSnapshot().submitted,null);assert.equal(await refreshed.controller.beginCreate(),false);assert.equal(writes(refreshed).length,0);
 await refreshed.controller.checkSaved();assert.match(render(refreshed),/Rebuild using original reference/);assert.deepEqual([...f.values.values()],[id]);
});
test("a late original commit conflicts with reconstruction; explicit review shows the saved Order without claiming the draft was saved",async()=>{
 const f=await restoredRecovery();const rebuiltItem=await reconstruct(f),rebuilt=structuredClone(f.controller.getSnapshot().draft);
 const original=order({items:[{id:itemId,description:"Original accepted description",measurementVersionId:null,createdAt:timestamp,updatedAt:timestamp}]});f.saved.set(id,structuredClone(original));
 assert.equal(await f.controller.save(),false);assert.equal(writes(f)[0].body.id,id);assert.equal(writes(f)[0].body.items[0].id,rebuiltItem);assert.equal(f.saved.size,1);assert.deepEqual(f.saved.get(id),original);assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.controller.getSnapshot().selected,null);assert.doesNotMatch(render(f),/Order created|Saved order confirmed/);
 assert.equal(await f.controller.checkSaved(),false);assert.equal(f.controller.getSnapshot().reviewAvailable,true);assert.deepEqual(f.controller.getSnapshot().draft,rebuilt);assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.intent.read(),id);assert.equal(await f.controller.beginCreate(),false);assert.equal(writes(f).length,1);
 const draw=hooks(Orders,{controller:f.controller});find(draw(),n=>n.type==="button"&&n.props.children==="Review saved Order").props.onClick();await settled();
 assert.equal(f.controller.getSnapshot().mode,"details");assert.deepEqual(f.controller.getSnapshot().selected,original);assert.match(render(f),/Showing the existing saved Order/);assert.match(render(f),/Your draft has not replaced its contents/);assert.match(render(f),/Original accepted description/);assert.doesNotMatch(render(f),/Order created|Saved order confirmed|Reconstructed clothing item/);assert.equal(f.intent.read(),null);assert.equal(writes(f).length,1);assert.deepEqual(f.saved.get(id),original);
});
test("different-content 200 replies are not accepted as reconstruction success",async()=>{
 const original=order({items:[{id:itemId,description:"Late original contents",measurementVersionId:null,createdAt:timestamp,updatedAt:timestamp}]});
 const f=await restoredRecovery({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({order:original}):fallback()});await reconstruct(f);await f.controller.save();assert.equal(f.controller.getSnapshot().uncertain,true);assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.intent.read(),id);assert.doesNotMatch(render(f),/Order created|Saved order confirmed/);
 f.saved.set(id,original);await f.controller.checkSaved();assert.match(render(f),/Review saved Order/);assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.intent.read(),id);
});
test("validation, stale-selection and rate-limit responses during reconstruction never release its reserved UUID",async()=>{
 for(const status of [422,404,429]){
   const f=await restoredRecovery({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error:"private"},status,{"retry-after":"5"}):fallback()});await reconstruct(f);await f.controller.save();
   assert.equal(f.intent.read(),id);assert.equal(f.controller.getSnapshot().reserved,true);assert.equal(f.controller.getSnapshot().createId,id);assert.deepEqual([...f.values.values()],[id]);
   const fresh=creationFixture({storage:f.values});await fresh.controller.load();assert.equal(fresh.controller.getSnapshot().uncertain,true);assert.equal(fresh.controller.getSnapshot().createId,id);assert.equal(await fresh.controller.beginCreate(),false);
 }
});
test("review rechecks the original reference and fails closed if it disappears or the session expires",async()=>{
 for(const status of [404,401]){
   let changed=false;const f=await restoredRecovery({reply:(body,path,fallback)=>changed&&path===orderPath&&body.operation==="get"?json({error:"private"},status):fallback()});await reconstruct(f);f.controller.cancelCreate();f.saved.set(id,order());
   await f.controller.checkSaved();assert.equal(f.controller.getSnapshot().reviewAvailable,true);changed=true;assert.equal(await f.controller.reviewSaved(),false);assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.intent.read(),id);assert.equal(writes(f).length,0);
   if(status===401)assert.equal(f.expired(),1);else assert.equal(f.controller.getSnapshot().uncertain,true);
 }
});

test("authentication and business-access refusals cannot clear a reconstructed reference from account-scoped storage",async()=>{
 for(const [status,error] of [[401,"unauthenticated"],[403,"origin_not_allowed"],[409,"business_required"]]){
   const f=await restoredRecovery({reply:(body,path,fallback)=>path===orderPath&&body.operation==="create"?json({error},status):fallback()});await reconstruct(f);await f.controller.save();
   assert.equal(f.intent.read(),id);assert.equal(f.controller.getSnapshot().selected,null);assert.deepEqual(f.controller.getSnapshot().draft.items,[]);
   const restored=creationFixture({storage:f.values});await restored.controller.load();assert.equal(restored.controller.getSnapshot().createId,id);assert.equal(restored.controller.getSnapshot().uncertain,true);assert.equal(await restored.controller.beginCreate(),false);
 }
});

test("the simplified creation form groups fields, hides singleton Remove and permanent helper controls, and retains bottom actions",async()=>{
 const f=creationFixture();await f.controller.load();await f.controller.beginCreate();const draw=hooks(Orders,{controller:f.controller});
 let html=render(f);assert.doesNotMatch(html,/Reload clients|Reload measurement versions|Try again|Measurements are optional during preparation|[0-9]+ of 50 clothing items|Remove clothing item|Maximum of 50/);
 assert.match(html,/Saved measurements \(optional\)/);assert.match(html,/No measurements selected/);assert.equal(find(draw(),n=>n.type==="button"&&n.props.type==="submit").props.disabled,true);
 const form=find(draw(),n=>n.type==="form"),first=[form.props.children].flat(Infinity)[0];assert.ok(find(first,n=>n.type==="select"&&n.props.id==="order-client"));
 await f.controller.chooseClient(clientId);const item=f.controller.getSnapshot().draft.items[0];f.controller.setDescription(item.id,"A clothing item");
 let tree=draw(),group=find(tree,n=>n.type==="fieldset");assert.ok(find(group,n=>n.type==="textarea"));assert.ok(find(group,n=>n.type==="label"&&n.props.children==="Saved measurements (optional)"));assert.ok(find(group,n=>n.type==="select"));
 const save=find(tree,n=>n.type==="button"&&n.props.type==="submit");assert.equal(save.props.disabled,false);const actions=find(tree,n=>n.props?.className==="businessActions"&&find(n,c=>c===save));assert.ok(actions);assert.ok(find(actions,n=>n.type==="button"&&n.props.children==="Cancel"));
 f.controller.addItem();tree=draw();assert.ok(find(tree,n=>n.type==="button"&&n.props['aria-label']==="Remove clothing item 2"));find(tree,n=>n.type==="button"&&n.props['aria-label']==="Remove clothing item 1").props.onClick();assert.equal(f.controller.getSnapshot().draft.items.length,1);assert.equal(find(draw(),n=>n.type==="button"&&n.props['aria-label']?.startsWith("Remove clothing item")),undefined);
 assert.equal(writes(f).length,0);
});
test("Client pagination sits beneath its selector and failed-page Try again preserves choices and retries the same cursor",async()=>{
 let fail=true;const cursor={createdAt:timestamp,id:clientId};const f=creationFixture({reply:(body,path,fallback)=>path===clientRecordPath&&body.operation==="list"?body.cursor?fail?json({error:"private"},503):json({clients:[client({id:id2})],nextCursor:null}):json({clients:[client()],nextCursor:cursor}):fallback()});
 await f.controller.load();await f.controller.beginCreate();const draw=hooks(Orders,{controller:f.controller});let field=find(draw(),n=>n.props?.className==="clientField"&&find(n,c=>c.type==="select"&&c.props.id==="order-client"));
 find(field,n=>n.type==="button"&&n.props.children==="Load more clients").props.onClick();await settled();field=find(draw(),n=>n.props?.className==="clientField"&&find(n,c=>c.type==="select"&&c.props.id==="order-client"));
 assert.match(render(f),/Clients could not be loaded/);assert.equal(f.controller.getSnapshot().choices.length,1);assert.deepEqual(f.controller.getSnapshot().choiceCursor,cursor);assert.equal(find(field,n=>n.type==="select").props['aria-describedby'],"order-client-error");
 const retry=find(field,n=>n.type==="button"&&n.props.children==="Try again");assert.ok(retry);fail=false;retry.props.onClick();await settled();
 assert.deepEqual(f.requests.filter(r=>r.path===clientRecordPath&&r.body.operation==="list").map(r=>r.body.cursor??null),[null,cursor,cursor]);assert.equal(f.controller.getSnapshot().choices.length,2);assert.doesNotMatch(render(f),/Try again|private|Reload clients/);assert.equal(writes(f).length,0);
});
test("saved-measurement failures and pagination remain beside the relevant per-item selector with explicit selection intact",async()=>{
 let fail=true;const cursor={versionNumber:2};const f=creationFixture({reply:(body,path,fallback)=>path===measurementPath?body.cursor&&fail?json({error:"private"},503):json({versions:[{id:body.cursor?item2:versionId,clientId:body.clientId,versionNumber:body.cursor?1:2,unit:"cm",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:body.cursor?null:cursor}):fallback()});
 const item=await draft(f);f.controller.setMeasurement(item,versionId);const draw=hooks(Orders,{controller:f.controller});let field=find(draw(),n=>n.props?.className==="clientField"&&find(n,c=>c.type==="select"&&c.props.id===`order-item-${item}-version`));
 find(field,n=>n.type==="button"&&n.props.children==="Load more measurements").props.onClick();await settled();field=find(draw(),n=>n.props?.className==="clientField"&&find(n,c=>c.type==="select"&&c.props.id===`order-item-${item}-version`));
 assert.ok(find(field,n=>n.type==="p"&&n.props.children==="Saved measurements could not be loaded."));assert.equal(f.controller.getSnapshot().versions.length,1);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,versionId);
 const retry=find(field,n=>n.type==="button"&&n.props.children==="Try again");assert.equal(retry.props['aria-label'],"Try loading saved measurements again for clothing item 1");fail=false;retry.props.onClick();await settled();
 assert.deepEqual(f.requests.filter(r=>r.path===measurementPath).map(r=>r.body.cursor??null),[null,cursor,cursor]);assert.equal(f.controller.getSnapshot().versions.length,2);assert.equal(f.controller.getSnapshot().draft.items[0].measurementVersionId,versionId);assert.doesNotMatch(render(f),/Try again|Reload measurement versions|private/);assert.equal(writes(f).length,0);
});
test("inline picker retries retain cooldown and pending guards",async()=>{
 let now=1000,release;const f=creationFixture({options:{now:()=>now},reply:(body,path,fallback)=>path===clientRecordPath&&body.operation==="list"?json({error:"limited"},429,{"retry-after":"5"}):fallback()});
 await f.controller.load();await f.controller.beginCreate();const draw=hooks(Orders,{controller:f.controller});let retry=find(draw(),n=>n.type==="button"&&n.props['aria-label']==="Try loading clients again");assert.equal(retry.props.disabled,true);assert.match(render(f),/Wait 5 seconds/);assert.equal(await f.controller.loadChoices(),false);now=6000;f.controller.resume();assert.equal(find(draw(),n=>n.type==="button"&&n.props['aria-label']==="Try loading clients again").props.disabled,false);
 const pending=creationFixture({reply:(body,path,fallback)=>path===measurementPath?new Promise(resolve=>{release=()=>resolve(fallback());}):fallback()});await pending.controller.load();await pending.controller.beginCreate();const loading=pending.controller.chooseClient(clientId);assert.equal(await pending.controller.loadVersions(),false);assert.match(render(pending),/Loading saved measurements/);assert.match(render(pending),/<select[^>]*disabled=""/);release();await loading;assert.doesNotMatch(render(pending),/Try again/);assert.equal(writes(pending).length,0);
});

async function editingFixture(options={}){const f=creationFixture(options);f.saved.set(id,order());await f.controller.load();await f.controller.open(id);return f;}
const edits=f=>f.requests.filter(r=>r.path===orderPath&&r.body.operation==="update_item");
test("inline Edit populates one item, sends changed Unicode description with its original timestamp, and renders confirmed server details",async()=>{
 const f=await editingFixture(),draw=hooks(Orders,{controller:f.controller});find(draw(),n=>n.type==="button"&&n.props['aria-label']==="Edit clothing item 1").props.onClick();await settled();
 assert.equal(f.controller.getSnapshot().edit.original.id,itemId);assert.equal(f.controller.getSnapshot().edit.description,"Agbada with lining");assert.equal(f.controller.getSnapshot().edit.measurementVersionId,versionId);assert.equal(f.controller.canSaveEdit(),false);assert.match(render(f),/Save changes/);
 const form=find(draw(),n=>n.type==="form"&&n.props['aria-label']==="Edit clothing item 1");find(form,n=>n.type==="textarea").props.onChange({currentTarget:{value:"\u0085Agbada - \u00ccr\u00f2 details\u0085"}});assert.equal(f.controller.canSaveEdit(),true);
 form.props.onSubmit({preventDefault(){}});await settled();assert.deepEqual(edits(f)[0].body,{operation:"update_item",id,itemId,expectedUpdatedAt:timestamp,description:"Agbada - \u00ccr\u00f2 details"});
 assert.equal(f.controller.getSnapshot().edit,null);assert.match(render(f),/Clothing item saved/);assert.match(render(f),/Agbada - \u00ccr\u00f2 details/);assert.equal(f.controller.getSnapshot().selected.createdAt,timestamp);assert.equal(f.controller.getSnapshot().selected.updatedAt,timestamp);assert.equal(f.controller.getSnapshot().selected.items[0].createdAt,timestamp);assert.ok(f.controller.getSnapshot().selected.items[0].updatedAt>timestamp);assert.equal(writes(f).length,0);
});
test("unchanged or invalid descriptions never submit, and Cancel preserves saved fields and timestamps",async()=>{
 const f=await editingFixture();await f.controller.beginEdit(itemId);assert.equal(await f.controller.saveEdit(),false);f.controller.setEditDescription("  Agbada with lining  ");assert.equal(f.controller.canSaveEdit(),false);
 for(const invalid of [""," \u0085 ","x".repeat(501),"bad\u0000description","\ud800"]){f.controller.setEditDescription(invalid);assert.equal(f.controller.canSaveEdit(),false);assert.equal(await f.controller.saveEdit(),false);assert.match(render(f),/aria-invalid="true"/);}
 f.controller.setEditDescription("\u{1f9f5}".repeat(500));assert.equal(f.controller.canSaveEdit(),true);f.controller.setEditDescription("\u{1f9f5}".repeat(501));assert.equal(f.controller.canSaveEdit(),false);
 f.controller.setEditDescription("Unsaved change");const before=structuredClone(f.saved.get(id));hooks(Orders,{controller:f.controller})();f.controller.cancelEdit();assert.equal(f.controller.getSnapshot().edit,null);assert.deepEqual(f.saved.get(id),before);assert.equal(edits(f).length,0);
});
test("saved measurements are selected explicitly by eligible Client version UUID, can be cleared, and preserve older current selections",async()=>{
 const f=await editingFixture({reply:(body,path,fallback)=>path===measurementPath?json({versions:[{id:item2,clientId,versionNumber:2,unit:"in",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:{versionNumber:2}}):fallback()});await f.controller.beginEdit(itemId);
 assert.equal(f.controller.getSnapshot().edit.measurementVersionId,versionId);assert.match(render(f),/Current saved selection/);assert.match(render(f),/Load more measurements/);
 f.controller.setEditMeasurement(id2);assert.equal(f.controller.getSnapshot().edit.measurementVersionId,versionId);f.controller.setEditMeasurement(item2);assert.equal(await f.controller.saveEdit(),true);assert.deepEqual(edits(f)[0].body,{operation:"update_item",id,itemId,expectedUpdatedAt:timestamp,measurementVersionId:item2});
 const updated=f.controller.getSnapshot().selected.items[0].updatedAt;await f.controller.beginEdit(itemId);f.controller.setEditMeasurement("");assert.equal(await f.controller.saveEdit(),true);assert.deepEqual(edits(f)[1].body,{operation:"update_item",id,itemId,expectedUpdatedAt:updated,measurementVersionId:null});assert.equal(f.controller.getSnapshot().selected.items[0].measurementVersionId,null);
});
test("only one editor opens, pending saves block repeat submissions and controls, and no ownership fields are sent",async()=>{
 let release;const f=await editingFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="update_item"?new Promise(resolve=>{release=()=>resolve(fallback());}):fallback()});await f.controller.beginEdit(itemId);assert.equal(await f.controller.beginEdit(item2),false);assert.equal(await f.controller.beginEdit(id2),false);
 f.controller.setEditDescription("Changed together");f.controller.setEditMeasurement("");const pending=f.controller.saveEdit();assert.equal(await f.controller.saveEdit(),false);f.controller.setEditDescription("Must not replace");f.controller.cancelEdit();f.controller.back();assert.equal(f.controller.getSnapshot().edit.description,"Changed together");assert.equal(f.controller.getSnapshot().mode,"details");assert.equal(edits(f).length,1);assert.match(render(f),/Saving/);assert.match(render(f),/<textarea[^>]*disabled=""/);
 assert.deepEqual(Object.keys(edits(f)[0].body).sort(),["operation","id","itemId","expectedUpdatedAt","description","measurementVersionId"].sort());release();assert.equal(await pending,true);assert.equal(f.controller.getSnapshot().selected.items[0].measurementVersionId,null);assert.equal(f.controller.getSnapshot().selected.items[1].description,"Waistcoat");
});
test("stale 409 fetches current details once and never reapplies the draft or accepts it as success",async()=>{
 const f=await editingFixture();await f.controller.beginEdit(itemId);f.controller.setEditDescription("Stale draft");const current=f.saved.get(id).items[0];current.description="Other editor's change";current.updatedAt=new Date(Date.parse(timestamp)+1).toISOString();const gets=f.requests.filter(r=>r.path===orderPath&&r.body.operation==="get").length;
 assert.equal(await f.controller.saveEdit(),false);assert.equal(f.controller.getSnapshot().edit,null);assert.equal(f.controller.getSnapshot().selected.items[0].description,"Other editor's change");assert.match(render(f),/This item changed/);assert.match(render(f),/your edit was not reapplied/);assert.doesNotMatch(render(f),/Clothing item saved|Stale draft/);assert.equal(edits(f).length,1);assert.equal(f.requests.filter(r=>r.path===orderPath&&r.body.operation==="get").length,gets+1);
 const refreshedTimestamp=current.updatedAt;await f.controller.beginEdit(itemId);f.controller.setEditDescription("Explicit fresh edit");await f.controller.saveEdit();assert.equal(edits(f)[1].body.expectedUpdatedAt,refreshedTimestamp);
});
test("lost update responses read current state without claiming success even when values match",async()=>{
 const f=await editingFixture({reply:(body,path,fallback)=>{const response=fallback();if(path===orderPath&&body.operation==="update_item")throw Error("lost response after commit");return response;}});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Observed matching value");assert.equal(await f.controller.saveEdit(),false);
 assert.equal(f.controller.getSnapshot().selected.items[0].description,"Observed matching value");assert.equal(f.controller.getSnapshot().edit,null);assert.match(render(f),/save response was not confirmed/);assert.doesNotMatch(render(f),/Clothing item saved/);assert.equal(edits(f).length,1);
});
test("failed uncertainty reads preserve and lock the draft until a successful saved-state check",async()=>{
 let checking=false;const f=await editingFixture({reply:(body,path,fallback)=>{if(path===orderPath&&body.operation==="update_item"){checking=true;return json({error:"private"},503);}if(checking&&path===orderPath&&body.operation==="get")return json({error:"private"},503);return fallback();}});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Retain this draft");await f.controller.saveEdit();assert.equal(f.controller.getSnapshot().edit.description,"Retain this draft");assert.equal(f.controller.getSnapshot().edit.reason,"uncertain");assert.equal(f.controller.canSaveEdit(),false);f.controller.cancelEdit();assert.equal(await f.controller.beginEdit(item2),false);assert.equal(await f.controller.saveEdit(),false);assert.match(render(f),/Check saved item/);assert.doesNotMatch(render(f),/private/);assert.equal(edits(f).length,1);
 checking=false;await f.controller.checkEditedItem();assert.equal(f.controller.getSnapshot().edit,null);assert.equal(f.controller.getSnapshot().selected.items[0].description,"Agbada with lining");assert.match(render(f),/save response was not confirmed/);assert.equal(edits(f).length,1);
});
test("validation and rate-limit rejections retain the draft and existing Retry-After safeguards",async()=>{
 for(const status of [422,429]){let now=1000;const f=await editingFixture({options:{now:()=>now},reply:(body,path,fallback)=>path===orderPath&&body.operation==="update_item"?json({error:"private"},status,{"retry-after":"5"}):fallback()});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Keep input");await f.controller.saveEdit();assert.equal(f.controller.getSnapshot().edit.description,"Keep input");assert.equal(f.controller.getSnapshot().edit.reason,null);assert.doesNotMatch(render(f),/private|Clothing item saved/);
 if(status===429){assert.equal(f.controller.getSnapshot().retryUntil,6000);assert.equal(await f.controller.saveEdit(),false);now=6000;f.controller.resume();assert.equal(f.controller.canSaveEdit(),true);}else assert.match(render(f),/Check the description/);assert.equal(edits(f).length,1);}
});
test("edit authentication failures clear identity data, and unmounted save responses cannot update or refresh another session",async()=>{
 for(const status of [401,403]){const f=await editingFixture({reply:(body,path,fallback)=>path===orderPath&&body.operation==="update_item"?json({error:"private"},status):fallback()});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Change");await f.controller.saveEdit();assert.equal(f.controller.getSnapshot().selected,null);assert.equal(f.controller.getSnapshot().edit,null);assert.equal(f.expired(),status===401?1:0);}
 for(const status of [200,401]){let active=true,release;const f=await editingFixture({options:{isActive:()=>active},reply:(body,path,fallback)=>path===orderPath&&body.operation==="update_item"?new Promise(resolve=>{release=()=>resolve(status===200?fallback():json({error:"unauthenticated"},401));}):fallback()});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Change");const pending=f.controller.saveEdit(),before=f.controller.getSnapshot(),reads=f.requests.length;active=false;release();assert.equal(await pending,false);assert.equal(f.controller.getSnapshot(),before);assert.equal(f.expired(),0);assert.equal(f.requests.length,reads);}
});
test("editing measurement pagination and failed-page retry reuse the selected Order's Client",async()=>{
 let fail=true;const cursor={versionNumber:2};const f=await editingFixture({reply:(body,path,fallback)=>path===measurementPath?body.cursor&&fail?json({error:"private"},503):json({versions:[{id:body.cursor?versionId:item2,clientId,versionNumber:body.cursor?1:2,unit:"cm",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:body.cursor?null:cursor}):fallback()});await f.controller.beginEdit(itemId);const draw=hooks(Orders,{controller:f.controller});find(draw(),n=>n.type==="button"&&n.props.children==="Load more measurements").props.onClick();await settled();assert.match(render(f),/Saved measurements could not be loaded/);fail=false;find(draw(),n=>n.type==="button"&&n.props.children==="Try again").props.onClick();await settled();
 assert.deepEqual(f.requests.filter(r=>r.path===measurementPath).map(r=>r.body),[{operation:"list",clientId,limit:25},{operation:"list",clientId,limit:25,cursor},{operation:"list",clientId,limit:25,cursor}]);assert.equal(f.controller.getSnapshot().edit.measurementVersionId,versionId);assert.doesNotMatch(render(f),/Try again/);
});

test("an edit never selects another Client's measurements and can preserve its original association during a picker failure",async()=>{
 const f=await editingFixture({reply:(body,path,fallback)=>path===measurementPath?json({versions:[{id:item2,clientId:id2,versionNumber:2,unit:"cm",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:null}):fallback()});await f.controller.beginEdit(itemId);assert.deepEqual(f.controller.getSnapshot().versions,[]);f.controller.setEditMeasurement(item2);assert.equal(f.controller.getSnapshot().edit.measurementVersionId,versionId);
 f.controller.setEditDescription("Description only");assert.equal(await f.controller.saveEdit(),true);assert.equal(Object.hasOwn(edits(f)[0].body,"measurementVersionId"),false);assert.equal(f.controller.getSnapshot().selected.items[0].measurementVersionId,versionId);
});
test("a valid edit response may include another item's concurrent change without losing the returned server state",async()=>{
 const f=await editingFixture({reply:(body,path,fallback)=>{if(path===orderPath&&body.operation==="update_item"){const other=f.saved.get(id).items[1];other.description="Other item changed concurrently";other.updatedAt=new Date(Date.parse(timestamp)+1).toISOString();}return fallback();}});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Own edit");assert.equal(await f.controller.saveEdit(),true);assert.equal(f.controller.getSnapshot().selected.items[1].description,"Other item changed concurrently");assert.match(render(f),/Clothing item saved/);assert.equal(edits(f).length,1);
});
test("wrong identity, mismatched fields or non-advancing timestamps cannot become a confirmed edit",async()=>{
 for(const change of [saved=>{saved.id=id2;},saved=>{saved.items[0].id=id2;},saved=>{saved.items[0].description="Mismatch";},saved=>{}]){
  const f=await editingFixture({reply:(body,path,fallback)=>{if(path!==orderPath||body.operation!=="update_item")return fallback();const saved=order();saved.items[0].description=body.description;change(saved);return json({order:saved});}});await f.controller.beginEdit(itemId);f.controller.setEditDescription("Wanted edit");assert.equal(await f.controller.saveEdit(),false);assert.equal(f.controller.getSnapshot().selected.items[0].description,"Agbada with lining");assert.doesNotMatch(render(f),/Clothing item saved|Wanted edit/);assert.equal(edits(f).length,1);
 }
});
test("keyboard focus enters the inline editor and returns to its Edit button after Cancel; parent pending state blocks submission",async()=>{
 const f=await editingFixture(),effects=[],draw=hooks(Orders,{controller:f.controller},effects);draw();await f.controller.beginEdit(itemId);effects.length=0;const tree=draw(),input=find(tree,n=>n.type==="textarea");let inputFocused=0,buttonFocused=0;input.props.ref.current={focus(){inputFocused++;}};effects.find(e=>e.deps?.length===1&&e.deps[0]===itemId).callback();assert.equal(inputFocused,1);
 f.controller.setEditDescription("Valid edit");const blocked=hooks(Orders,{controller:f.controller,disabled:true})();assert.equal(find(blocked,n=>n.type==="button"&&n.props.type==="submit").props.disabled,true);find(blocked,n=>n.type==="form").props.onSubmit({preventDefault(){}});assert.equal(edits(f).length,0);
 f.controller.cancelEdit();effects.length=0;draw();const previous=Object.getOwnPropertyDescriptor(globalThis,"document");Object.defineProperty(globalThis,"document",{configurable:true,value:{getElementById(value){assert.equal(value,`order-edit-${itemId}`);return {focus(){buttonFocused++;}};}}});try{effects.find(e=>e.deps?.length===1&&e.deps[0]===undefined).callback();assert.equal(buttonFocused,1);}finally{if(previous)Object.defineProperty(globalThis,"document",previous);else delete globalThis.document;}
});


test("Order details prioritize a short reference, optional contacts and compact clothing-item cards",async()=>{
 const f=await editingFixture(),html=render(f),tree=hooks(Orders,{controller:f.controller})();
 assert.match(html,/>Order details<\/h2>/);assert.match(html,/Order 11111111/);assert.match(html,/<summary>Full Order identifier<\/summary><code>11111111-1111-4111-8111-111111111111<\/code>/);
 assert.doesNotMatch(html,/Order updated|Not provided|Phone number|Email address|Last edited|>Clothes</);
 assert.match(html,/class="orderClientName">Synthetic client/);assert.match(html,/Clothing items \(2\)/);assert.match(html,/<dt>Description<\/dt>/);assert.match(html,/Saved measurements selected/);assert.match(html,/Measurement version identifier/);assert.doesNotMatch(html,/Version 1/);
 const card=find(tree,n=>n.type==="li"&&find(n,c=>c.type==="h4"&&c.props.children[1]===1)),header=find(card,n=>n.props?.className==="orderItemHeading");
 assert.ok(find(header,n=>n.type==="h4"));assert.ok(find(header,n=>n.type==="button"&&n.props['aria-label']==="Edit clothing item 1"));
 assert.equal(f.requests.filter(r=>r.path===measurementPath).length,0);assert.equal(edits(f).length,0);assert.equal(writes(f).length,0);
});
test("Client contacts render only when present and failed authorized lookup keeps its reference and retry",async()=>{
 for(const contacts of [{phone:"1234567",email:null},{phone:null,email:"client@example.invalid"},{phone:"1234567",email:"client@example.invalid"}]){
  const f=fixture((body,path)=>path===clientRecordPath?json({client:client(contacts)}):defaultReply(body,path));await f.controller.load();await f.controller.open(id);const html=render(f);
  assert.equal(html.includes("Phone number"),!!contacts.phone);assert.equal(html.includes("Email address"),!!contacts.email);assert.doesNotMatch(html,/Not provided/);
 }
 const failed=fixture((body,path)=>path===clientRecordPath?json({error:"private"},503):defaultReply(body,path));await failed.controller.load();await failed.controller.open(id);
 assert.match(render(failed),new RegExp(clientId));assert.match(render(failed),/Retry client details/);assert.doesNotMatch(render(failed),/Synthetic client|Not provided|private/);
});
test("only authorized matching measurement data supplies a version number and changed items show Last edited",async()=>{
 const f=await editingFixture();await f.controller.beginEdit(itemId);f.controller.cancelEdit();assert.match(render(f),/Version 1/);
 f.saved.get(id).items[0].updatedAt="2026-11-09T12:01:00.000Z";await f.controller.open(id);const html=render(f);
 assert.equal((html.match(/Last edited/g)??[]).length,1);assert.match(html,/<time dateTime="2026-11-09T12:01:00.000Z"/i);assert.doesNotMatch(html,/Order updated|<dt>Created|<dt>Updated/);
 const other=await editingFixture({reply:(body,path,fallback)=>path===measurementPath?json({versions:[{id:versionId,clientId:id2,versionNumber:99,unit:"cm",recordedAt:timestamp,entries:[{name:"Hip",value:"20"}]}],nextCursor:null}):fallback()});
 await other.controller.beginEdit(itemId);other.controller.cancelEdit();assert.doesNotMatch(render(other),/Version 99/);assert.match(render(other),/Saved measurements selected/);
});
test("copy complete Order identifier reports success or a selectable fallback without API calls",async()=>{
 const f=await editingFixture(),draw=hooks(Orders,{controller:f.controller}),prior=Object.getOwnPropertyDescriptor(globalThis,"navigator"),requests=f.requests.length;
 try{
  let copied;Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{async writeText(value){copied=value;}}}});
  find(draw(),n=>n.type==="button"&&n.props['aria-label']==="Copy complete Order identifier").props.onClick();await settled();assert.equal(copied,id);
  assert.ok(find(draw(),n=>n.props?.role==="status"&&n.props.children==="Order identifier copied."));
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{async writeText(){throw Error("denied");}}}});
  find(draw(),n=>n.type==="button"&&n.props['aria-label']==="Copy complete Order identifier").props.onClick();await settled();
  assert.match(find(draw(),n=>n.props?.role==="status"&&typeof n.props.children==="string"&&n.props.children.startsWith("Copy unavailable")).props.children,/Full Order identifier/);
  assert.equal(f.requests.length,requests);
 }finally{if(prior)Object.defineProperty(globalThis,"navigator",prior);else delete globalThis.navigator;}
});
test("confirmed creation uses compact feedback while uncertain editing messages keep their safeguards",async()=>{
 const f=creationFixture();await draft(f);await f.controller.save();const html=render(f);
 assert.match(html,/class="orderSuccess"><p role="status" aria-live="polite">Order created\./);assert.doesNotMatch(html,/class="clientFeedback"><p role="status" aria-live="polite">Order created/);
 assert.equal(writes(f).length,1);assert.equal(edits(f).length,0);
});
