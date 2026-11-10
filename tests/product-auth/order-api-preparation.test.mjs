// Offline doubles only: no PostgreSQL, HTTP listener, private owner files or real writes.
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,mkdtempSync,chmodSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {orderRequestSchema,ORDER_BODY_LIMIT} from "../../lib/order-contract.ts";
import {saveMeasurementApiInventory} from "./measurement-api.integration.mjs";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {authorizeOrderApiProof,orderApiPlan,orderApiProofRequest,runOrderApiProof,orderCleanupProposalDigest,orderMeasurementFixtureCleanupDigest,orderApiProofFailure,orderItemEditPlan,orderItemEditCleanupDigest} from "./order-api.integration.mjs";
const source=readFileSync(new URL('./order-api.integration.mjs',import.meta.url),'utf8');
const ids={a:'11111111-1111-4111-8111-111111111111',a2:'22222222-2222-4222-8222-222222222222',b:'33333333-3333-4333-8333-333333333333',ma:'44444444-4444-4444-8444-444444444444',ma2:'55555555-5555-4555-8555-555555555555',mb:'66666666-6666-4666-8666-666666666666',excluded:'77777777-7777-4777-8777-777777777777'};
const env={NODE_ENV:'test',PRODUCT_DATABASE_MODE:'test',PRODUCT_DATABASE_CONFIRMED:'true',PRODUCT_ORDER_API_PROOF_CONFIRMED:'true',PRODUCT_ORDER_API_FIXTURES_CONFIRMED:'true',PRODUCT_ORDER_API_MEASUREMENT_FIXTURES_CONFIRMED:'true',PRODUCT_ORDER_API_BUSINESS_A_ID:'synthetic-a',PRODUCT_ORDER_API_BUSINESS_B_ID:'synthetic-b',PRODUCT_ORDER_API_CLIENT_A_ID:ids.a,PRODUCT_ORDER_API_OTHER_CLIENT_A_ID:ids.a2,PRODUCT_ORDER_API_CLIENT_B_ID:ids.b,PRODUCT_ORDER_API_MEASUREMENT_ID:ids.ma,PRODUCT_ORDER_API_EXCLUDED_MEASUREMENT_ID:ids.excluded,PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:ids.ma2,PRODUCT_ORDER_API_WRONG_BUSINESS_MEASUREMENT_ID:ids.mb,PRODUCT_ORDER_API_COOKIE_A:'better-auth.session_token=synthetic-a.signature',PRODUCT_ORDER_API_COOKIE_B:'better-auth.session_token=synthetic-b.signature',PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString('base64'),PRODUCT_SINGLE_ORIGIN_RUN_ID:'f249a598-919d-467c-9948-8a7e67d6191f',PRODUCT_SESSION_HTTP_ORIGIN:'http://127.0.0.1:3000',PRODUCT_TEST_DATABASE_URL:'postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product'};
const config=(write=false,patch={})=>authorizeOrderApiProof([write?'--owner-order-api-write-proof':'--owner-order-api-preflight'],{...env,...(write?{PRODUCT_ORDER_API_WRITES_CONFIRMED:'true',PRODUCT_ORDER_API_INVENTORY:'/private-offline-order-tests/'+randomUUID()+'.json',PRODUCT_ORDER_API_CLEANUP_PROPOSAL_CONFIRMED:'true',PRODUCT_ORDER_API_CLEANUP_PROPOSAL_SHA256:orderCleanupProposalDigest()}:{}),...patch});
const fixtureConfig=(write=false,patch={})=>authorizeOrderApiProof([write?'--owner-order-measurement-fixture-create':'--owner-order-measurement-fixture-preflight'],{...env,PRODUCT_ORDER_API_MEASUREMENT_ID:undefined,PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:undefined,PRODUCT_ORDER_API_WRONG_BUSINESS_MEASUREMENT_ID:undefined,PRODUCT_ORDER_MEASUREMENT_FIXTURE_SETUP_CONFIRMED:'true',...(write?{PRODUCT_ORDER_MEASUREMENT_FIXTURE_WRITES_CONFIRMED:'true',PRODUCT_ORDER_MEASUREMENT_FIXTURE_INVENTORY:'/private-offline-order-tests/'+randomUUID()+'.json',PRODUCT_ORDER_MEASUREMENT_FIXTURE_CLEANUP_CONFIRMED:'true',PRODUCT_ORDER_MEASUREMENT_FIXTURE_CLEANUP_SHA256:orderMeasurementFixtureCleanupDigest()}:{}),...patch});
const editConfig=(write=false,patch={})=>authorizeOrderApiProof([write?'--owner-order-item-edit-write-proof':'--owner-order-item-edit-preflight'],{...env,PRODUCT_ORDER_ITEM_EDIT_PROOF_CONFIRMED:'true',PRODUCT_ORDER_API_MEASUREMENT_ID:undefined,PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:undefined,PRODUCT_ORDER_API_WRONG_BUSINESS_MEASUREMENT_ID:undefined,...(write?{PRODUCT_ORDER_ITEM_EDIT_WRITES_CONFIRMED:'true',PRODUCT_ORDER_ITEM_EDIT_INVENTORY:'/private-offline-order-tests/'+randomUUID()+'.json',PRODUCT_ORDER_ITEM_EDIT_CLEANUP_CONFIRMED:'true',PRODUCT_ORDER_ITEM_EDIT_CLEANUP_SHA256:orderItemEditCleanupDigest()}:{}),...patch});
const fault=code=>Object.assign(Error('PRIVATE URL cookie IDs SQL payload'),{code,stack:'PRIVATE'});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail('No external network');test.after(()=>{globalThis.fetch=originalFetch;});
function fake(write=false,options={}){
 const c=options.editSetup?editConfig(write,options.duplicateProbe?{PRODUCT_ORDER_ITEM_EDIT_DUPLICATE_PROBE_CONFIRMED:"true"}:{}):options.fixtureSetup?fixtureConfig(write):config(write,options.noPositive?{PRODUCT_ORDER_API_MEASUREMENT_ID:undefined}:{}),sql=[],http=[],receipts=[],waits=[],reports=[],orders=[],items=[];
 let connected=false,readonly=false,onError,ambiguous=false;
 for(const actor of [0,1]){const id=actor===0?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',clientId=c.clients[actor===0?0:2];orders.push({id,businessId:c.businesses[actor],clientId,createdAt:new Date('2026-11-09T10:00:00.000Z'),updatedAt:new Date('2026-11-09T10:00:00.000Z')});items.push({id:actor===0?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':'dddddddd-dddd-4ddd-8ddd-dddddddddddd',orderId:id,clientId,description:'Existing synthetic item',measurementVersionId:null,createdAt:new Date('2026-11-09T10:00:00.000Z'),updatedAt:new Date('2026-11-09T10:00:00.000Z')});}
 const initial={orders:structuredClone(orders),items:structuredClone(items)},response=rows=>({rows,rowCount:rows.length});
 const measurements=options.fixtureSetup||options.editSetup?new Map([[ids.excluded,{id:ids.excluded,businessId:c.businesses[0],clientId:ids.a,versionNumber:1,unit:"cm",recordedAt:new Date("2026-11-09T09:00:00.000Z")}]]):new Map([[ids.ma,{id:ids.ma,businessId:c.businesses[0],clientId:ids.a,versionNumber:2}],[ids.ma2,{id:ids.ma2,businessId:c.businesses[0],clientId:ids.a2,versionNumber:2}],[ids.mb,{id:ids.mb,businessId:c.businesses[1],clientId:ids.b,versionNumber:2}]]);
 const measurementEntries=[...measurements.values()].map(v=>({measurementVersionId:v.id,name:'Existing synthetic entry',value:'1.25'}));
 initial.measurements=structuredClone([...measurements.values()]);initial.entries=structuredClone(measurementEntries);

 const db={on(_e,fn){onError=fn;},async connect(){if(options.connect)throw fault('08006');connected=true;},async end(){connected=false;if(options.end)throw fault('08003');},async query(q,p=[]){
  assert.ok(connected);sql.push(q);options.inject?.(q,p);
  if(q.startsWith('BEGIN')){assert.equal(readonly,false);assert.equal(q,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');readonly=true;return response([]);}
  if(q==='ROLLBACK'){readonly=false;if(options.rollback)throw fault('08006');return {command:'ROLLBACK'};}
  assert.ok(readonly);if(q.startsWith('SET LOCAL'))return response([]);assert.ok(q.startsWith('SELECT '));
  if(q.startsWith('SELECT current_database()'))return response([{database:options.wrongTarget?'stitchtrack_product_dev':'stitchtrack_product_test',role:c.target.user,session_role:c.target.user,host:'127.0.0.1',peer:'127.0.0.1',port:'5432',timezone:'UTC',namespace:'product',encoding:'UTF8',version:160015,safe:true}]);
  if(q.startsWith('SELECT c.relname AS name'))return response(['Account','AuthRateBucket','Business','BusinessMember','Client','EmailOutbox','EmailVerificationIssuance','MeasurementEntry','MeasurementVersion','Order','OrderItem','Session','TermsAcceptance','TermsVersion','User','Verification','_prisma_migrations'].sort().map(name=>({name,kind:'r',owner:'stitchtrack_product_test_migrator'})));
  if(q.startsWith('SELECT pg_get_userbyid(nspowner)'))return response([{owner:'stitchtrack_product_test_migrator',isolated_history:!options.publicHistory}]);
  if(q.startsWith('SELECT b."primaryOwnerUserId"'))return response(options.owner?[]:[{id:p[0]===c.businesses[0]?'owner-a':'owner-b'}]);
  if(q.startsWith('SELECT "userId"'))return response([{userId:p[0]==='digest:synthetic-a'?'owner-a':'owner-b',sufficient:!options.expired}]);
  if(q.startsWith('SELECT "id","businessId" FROM product."Client"'))return response(options.client?[]:[{id:p[0],businessId:p[1]}]);
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber"')){
   if(q.includes(',"unit"'))return response([...measurements.values()].filter(v=>p[0].includes(v.id)));
   const row=measurements.get(p[0]);return response(options.noMeasurement||!row?[]:[{id:row.id,businessId:row.businessId,clientId:row.clientId,versionNumber:options.versionOne?1:row.versionNumber}]);}
  if(q.startsWith('SELECT 1 FROM product."MeasurementVersion"'))return response([...measurements.values()].filter(v=>p[0].includes(v.id)).map(()=>({})));
  if(q.startsWith('SELECT 1 FROM product."MeasurementEntry"'))return response(measurementEntries.filter(e=>p[0].includes(e.measurementVersionId)).map(()=>({})));
  if(q.startsWith('SELECT "id","versionNumber" FROM product."MeasurementVersion"'))return response([...measurements.values()].filter(v=>v.businessId===p[0]&&v.clientId===p[1]).map(v=>({id:v.id,versionNumber:v.versionNumber})));
  if(q.startsWith('SELECT "measurementVersionId",encode'))return response(measurementEntries.filter(e=>p[0].includes(e.measurementVersionId)).map(e=>({measurementVersionId:e.measurementVersionId,name_hex:Buffer.from(e.name,'utf8').toString('hex'),value:e.value})));
  if(q.startsWith('SELECT 1 FROM product."Order"'))return response(orders.filter(o=>Array.isArray(p[0])?p[0].includes(o.id):o.id===p[0]).map(()=>({})));
  if(q.startsWith('SELECT 1 FROM product."OrderItem"'))return response(items.filter(i=>p[0].includes(i.id)||(Array.isArray(p[1])?p[1].includes(i.orderId):i.orderId===p[1])).map(()=>({})));
  if(q.startsWith('SELECT count(*)::int AS count FROM')||q.startsWith('SELECT md5(')){
   const table=q.match(/FROM product\."(\w+)"/u)[1],data=table==='Order'?orders:table==='OrderItem'?items:table==='MeasurementVersion'?[...measurements.values()]:table==='MeasurementEntry'?measurementEntries:[{stable:options.changedSnapshot&&(orders.length>initial.orders.length||measurements.size>initial.measurements.length)?'changed':table}];
   const filtered=q.includes('<>ALL')?data.filter(o=>!p[0].includes(table==='MeasurementEntry'?o.measurementVersionId:o.id)):q.includes('WHERE "businessId"')?data.filter(o=>o.businessId===p[0]&&(!q.includes('AND "clientId"')||o.clientId===p[1])):data;
   return response(q.startsWith('SELECT md5(')?[{digest:JSON.stringify(filtered)}]:[{count:options.nonempty&&table==='MeasurementVersion'&&q.includes('AND "clientId"')?1:options.tooMany&&q.includes('WHERE "businessId"')?21:filtered.length}]);
  }
  if(q.startsWith('SELECT "id" FROM product."Order"'))return response(orders.filter(o=>o.businessId===p[0]).toSorted((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?1:-1)).slice(0,32).map(o=>({id:o.id})));
  if(q.startsWith('SELECT "id","businessId","clientId","createdAt"'))return response(orders.filter(o=>p[0].includes(o.id)));
  if(q.startsWith('SELECT "id","orderId","clientId",encode'))return response(items.filter(i=>p[0].includes(i.id)||p[1].includes(i.orderId)).map(({description,...i})=>({...i,description_hex:Buffer.from(options.changedBytes?'altered':description,'utf8').toString('hex')})));
  throw Error('Unexpected offline observer query');
 }};
 const saved=o=>({id:o.id,clientId:o.clientId,createdAt:o.createdAt.toISOString(),updatedAt:o.updatedAt.toISOString(),items:items.filter(i=>i.orderId===o.id).map(({orderId,clientId,...i})=>({...i,createdAt:i.createdAt.toISOString(),updatedAt:i.updatedAt.toISOString()}))});
 const content=data=>data.map(({id,description,measurementVersionId=null})=>({id,description:description.trim(),measurementVersionId})).toSorted((a,b)=>a.id<b.id?-1:1);
 const request=async(url,init)=>{
  assert.equal(readonly,false,'No observer transaction spans an API call');http.push({url,init});const actor=init.headers.cookie===c.cookies[0]?0:init.headers.cookie===c.cookies[1]?1:-1;
  if(url.endsWith('/session'))return Response.json({user:{id:options.httpIdentity?'wrong':actor===0?'owner-a':'owner-b'}});
  if(url===c.origin+'/api/internal/tailor-measurements'){
   assert.ok(options.fixtureSetup||options.editSetup);assert.equal(readonly,false);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');if(actor<0)return Response.json({error:'unauthenticated'},{status:401});
   const body=JSON.parse(init.body),expectedClient=c.clients[actor===0?1:2];assert.equal(body.clientId,expectedClient);
   const value=v=>({id:v.id,clientId:v.clientId,versionNumber:v.versionNumber,unit:v.unit,recordedAt:v.recordedAt.toISOString(),entries:measurementEntries.filter(e=>e.measurementVersionId===v.id).map(({name,value})=>({name,value}))});
   if(body.operation==='create'){
    assert.ok(write&&receipts.length===1);assert.ok(receipts[0].value.plan.some(p=>p.body.id===body.id));assert.notEqual(body.id,ids.excluded);
    if(options.measurementUnavailable)return Response.json({error:'measurement_unavailable'},{status:503});
     if(options.secondFailure&&actor===1)throw fault('08006');
    const v={id:body.id,businessId:c.businesses[actor],clientId:body.clientId,versionNumber:1,unit:body.unit,recordedAt:new Date('2026-11-09T12:00:00.000Z')};measurements.set(v.id,v);measurementEntries.push(...body.entries.map(e=>({measurementVersionId:v.id,...e})));
    if(options.ambiguous&&!ambiguous){ambiguous=true;throw fault('08006');}return Response.json({version:value(v)});
   }
   if(body.operation==='get')return Response.json({version:value(measurements.get(body.id))});
   return Response.json({versions:[...measurements.values()].filter(v=>v.businessId===c.businesses[actor]&&v.clientId===expectedClient).map(value),nextCursor:null});
  }
  assert.equal(url,c.origin+'/api/internal/tailor-orders');assert.equal(init.method,'POST');assert.equal(init.redirect,'error');if(actor<0)return Response.json({error:'unauthenticated'},{status:401});
  const body=JSON.parse(init.body);
  if(body.operation==='create'){
   assert.equal(write,true);assert.ok(receipts.length);assert.ok(receipts[0].value.plan.some(p=>p.body.id===body.id),'Every create UUID must be inventoried before submission');
   if(options.rate)return Response.json({error:'rate_limited'},{status:429});
   if(Buffer.byteLength(init.body)>ORDER_BODY_LIMIT&&!options.acceptOversized)return Response.json({error:'body_too_large'},{status:413});
   const parsed=orderRequestSchema.safeParse(body);if(!parsed.success)return Response.json({error:'validation_failed'},{status:422});const value=parsed.data;
   if(actor!==0||value.clientId!==c.clients[options.editSetup?1:0])return Response.json({error:'order_not_found'},{status:404});
   if(value.items.some(i=>i.measurementVersionId&&measurements.get(i.measurementVersionId)?.clientId!==value.clientId))return Response.json({error:'order_not_found'},{status:404});
   const existing=orders.find(o=>o.id===value.id);if(existing){if(JSON.stringify(content(saved(existing).items))!==JSON.stringify(content(value.items)))return Response.json({error:'order_conflict'},{status:409});return Response.json({order:saved(existing)});}
   const now=new Date('2026-11-09T12:00:00.000Z'),parent={id:value.id,clientId:value.clientId,businessId:c.businesses[0],createdAt:now,updatedAt:now};
   if(value.items.some(i=>items.some(old=>old.id===i.id))){if(options.partialOrder)orders.push(parent);return Response.json({error:'order_conflict'},{status:409});}
   orders.push(parent);items.push(...value.items.map(i=>({...i,orderId:value.id,clientId:value.clientId,createdAt:now,updatedAt:now})));
   if(options.ambiguous&&!ambiguous){ambiguous=true;throw fault('08006');}return Response.json({order:saved(parent)});
  }
  if(body.operation==='update_item'){
   assert.ok(write&&options.editSetup&&receipts.length===1);assert.ok(receipts[0].value.plan[0].body.items.some(item=>item.id===body.itemId));
   if(options.updateUnavailable)return Response.json({error:'order_unavailable'},{status:503});
   const order=orders.find(o=>o.id===body.id&&o.businessId===c.businesses[actor]),item=items.find(i=>i.id===body.itemId&&i.orderId===order?.id);if(!item)return Response.json({error:'order_not_found'},{status:404});
   if(item.updatedAt.toISOString()!==body.expectedUpdatedAt&&!options.staleAccepted&&!(options.raceBoth&&body.description?.includes('competing')))return Response.json({error:'order_conflict'},{status:409});
   const description=body.description??item.description,measurementVersionId=body.measurementVersionId===undefined?item.measurementVersionId:body.measurementVersionId;
   if(options.noopMutates||description!==item.description||measurementVersionId!==item.measurementVersionId){item.description=description;item.measurementVersionId=measurementVersionId;item.updatedAt=new Date(item.updatedAt.getTime()+1);}
   if(options.corruptParent)order.updatedAt=new Date(order.updatedAt.getTime()+1);
   if(options.corruptMeasurement)measurementEntries.find(e=>e.measurementVersionId===receipts[0].value.plan[1].body.id).value='999';
   if(options.ambiguousEdit&&!ambiguous){ambiguous=true;throw fault('08006');}
   if(options.ambiguousRace&&body.description?.endsWith('choice A'))throw fault('08006');
   if(options.ambiguousRace&&body.description?.endsWith('choice B'))await new Promise(resolve=>setTimeout(resolve,10));
   return Response.json({order:saved(order)});
  }
  if(body.operation==='get'){const o=orders.find(o=>o.id===body.id&&o.businessId===c.businesses[actor]);return o?Response.json({order:saved(o)}):Response.json({error:'order_not_found'},{status:404});}
  const all=orders.filter(o=>o.businessId===c.businesses[actor]&&(!body.cursor||o.createdAt.toISOString()<body.cursor.createdAt||o.createdAt.toISOString()===body.cursor.createdAt&&o.id<body.cursor.id)).toSorted((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?1:-1)),page=all.slice(0,body.limit);
  return Response.json({orders:page.map(o=>({id:o.id,clientId:o.clientId,createdAt:o.createdAt.toISOString(),updatedAt:o.updatedAt.toISOString()})),nextCursor:all.length>body.limit?{id:page.at(-1).id,createdAt:page.at(-1).createdAt.toISOString()}:null});
 };
 const save=(path,value)=>{if(options.inventory&&receipts.length===0||options.finish&&receipts.length>0)throw fault('42501');assert.equal(connected,receipts.length===0);receipts.push({path,value:structuredClone(value)});};
 const inspect=async(_db,setStage)=>{assert.ok(readonly);setStage('schema_metadata');if(options.schema)throw fault('42501');setStage('application_privileges');if(options.privileges)throw fault('42501');};
 const run=()=>runOrderApiProof(c,{db,request,save,inspect,tokenDigest:value=>'digest:'+value,wait:async ms=>{waits.push(ms);if(options.observerLost)onError();},report:value=>reports.push(value)});
 return {run,c,db,sql,http,receipts,waits,reports,orders,items,measurements,measurementEntries,initial};
}
test('exact app-role target, fixtures and separate cleanup-review activation are required before connecting',()=>{
 assert.equal(config().write,false);assert.equal(config(true).write,true);
 for(const patch of [{NODE_ENV:'development'},{PRODUCT_DATABASE_MODE:'development'},{PRODUCT_ORDER_API_PROOF_CONFIRMED:undefined},{PRODUCT_ORDER_API_MEASUREMENT_FIXTURES_CONFIRMED:undefined},{PRODUCT_ORDER_API_OTHER_CLIENT_A_ID:ids.a},{PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:undefined},{PRODUCT_ORDER_API_MEASUREMENT_ID:ids.mb},{PRODUCT_ORDER_API_EXCLUDED_MEASUREMENT_ID:undefined},{PRODUCT_ORDER_API_MEASUREMENT_ID:ids.excluded},{PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:ids.excluded},{NODE_OPTIONS:'unsafe'},{PRODUCT_SESSION_HTTP_ORIGIN:'https://outside.invalid'},{PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace('_app:','_migrator:')}])assert.throws(()=>config(false,patch));
 for(const patch of [{PRODUCT_ORDER_API_WRITES_CONFIRMED:undefined},{PRODUCT_ORDER_API_CLEANUP_PROPOSAL_CONFIRMED:undefined},{PRODUCT_ORDER_API_CLEANUP_PROPOSAL_SHA256:'wrong'},{PRODUCT_ORDER_API_INVENTORY:'relative'}])assert.throws(()=>config(true,patch));
 assert.throws(()=>authorizeOrderApiProof([],env));
});
test('plan inventories every stable ID including rejection probes, oversized padding and the intentional shared item conflict',()=>{
 const p=orderApiPlan(config());assert.equal(p.length,11);assert.equal(new Set(p.map(p=>p.body.id)).size,11);assert.equal(new Set(p.flatMap(p=>p.body.items.map(i=>i.id))).size,69);
 assert.equal(p.find(p=>p.purpose==='initial').body.items.length,2);assert.equal(p.find(p=>p.purpose==='large').body.items.length,9);assert.ok(Buffer.byteLength(JSON.stringify(p.find(p=>p.purpose==='large').body))>16384);assert.equal(p.find(p=>p.purpose==='oversized_body').wireTargetBytes,ORDER_BODY_LIMIT+1);
 assert.equal(p.filter(p=>p.expectedStatus===200).length,2);
});
test('preflight performs only reads, creates no inventory and preserves existing rows',async()=>{
 const f=fake(),r=await f.run();assert.equal(r.status,'preflight_passed',JSON.stringify(r));assert.equal(r.orderWrites,0);assert.equal(f.receipts.length,0);assert.equal(f.http.some(h=>h.init.body&&JSON.parse(h.init.body).operation==='create'),false);assert.deepEqual(f.orders,f.initial.orders);assert.deepEqual(f.items,f.initial.items);assert.ok(f.sql.every(q=>/^(SELECT|BEGIN|SET LOCAL|ROLLBACK)/u.test(q)));
});
test('write proof verifies exactly two parents and eleven items with independent SQL and durable inventory/result linkage',async()=>{
 const f=fake(true),r=await f.run();assert.equal(r.status,'write_proof_passed',JSON.stringify(r));assert.equal(f.orders.length-f.initial.orders.length,2);assert.equal(f.items.length-f.initial.items.length,11);assert.equal(r.cleanupPerformed,false);assert.equal(r.explicitMeasurementCase,'tested');assert.equal(f.receipts.length,2);assert.doesNotMatch(JSON.stringify(f.receipts),/postgresql:|better-auth\.session_token|synthetic-a\.signature/u);assert.ok(!JSON.stringify(f.receipts).includes(ids.excluded));assert.ok(!JSON.stringify(f.http).includes(ids.excluded));assert.equal(f.waits.reduce((a,b)=>a+b,0),4*f.c.refillWait);assert.ok(f.waits.every(ms=>ms<=30000));assert.equal(f.receipts[1].value.runId,f.receipts[0].value.runId);assert.equal(f.receipts[1].value.inventoryCreatedAt,f.receipts[0].value.createdAt);assert.match(f.receipts[1].value.inventoryDigest,/^[0-9a-f]{64}$/u);
 assert.ok(f.http.some(h=>h.init.body&&Buffer.byteLength(h.init.body)>16384&&Buffer.byteLength(h.init.body)<=ORDER_BODY_LIMIT));assert.ok(f.http.some(h=>h.init.body&&Buffer.byteLength(h.init.body)===ORDER_BODY_LIMIT+1));assert.doesNotMatch(JSON.stringify(f.reports),/synthetic-a|11111111|cookie|postgresql:/u);
});
test('positive selection is optional, approved unrelated Version 1 fixtures work, and missing negative fixtures block writes',async()=>{
 const absent=fake(true,{noPositive:true});assert.equal((await absent.run()).explicitMeasurementCase,'not_configured');assert.ok(absent.receipts[1].value.orders.flatMap(o=>o.items).every(i=>i.measurementVersionId===null));
 const approvedFirst=fake(true,{versionOne:true});assert.equal((await approvedFirst.run()).status,'write_proof_passed');
 for(const options of [{noMeasurement:true}]){const f=fake(true,options),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,'measurement_fixtures');assert.equal(r.possibleCommittedOrders,0);assert.equal(f.receipts.length,0);}
});
test('target, metadata, privileges, account/session, Client and HTTP identity failures stop before inventory/writes',async()=>{
 for(const [options,stage]of [[{wrongTarget:true},'database_identity'],[{publicHistory:true},'schema_tables'],[{schema:true},'schema_metadata'],[{privileges:true},'application_privileges'],[{owner:true},'fixture_a_owner'],[{expired:true},'fixture_a_session'],[{client:true},'fixture_a_client'],[{httpIdentity:true},'http_session_a']]){const f=fake(true,options),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(f.receipts.length,0);assert.equal(f.orders.length,f.initial.orders.length);}
});
test('failed late item conflict must leave no empty parent or fresh item; byte/baseline mismatches fail closed',async()=>{
 for(const [options,stage]of [[{partialOrder:true},'invalid_absence'],[{changedBytes:true},'stored_items'],[{changedSnapshot:true},'unrelated_snapshot']]){const f=fake(true,options),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(f.receipts.length,1);assert.equal(r.noAutomaticRetry,true);}
});
test('ambiguous initial write retains original inventory and UUIDs and is never replayed or rolled back by observer',async()=>{
 const f=fake(true,{ambiguous:true}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,'initial');assert.equal(r.possibleCommittedOrders,1);assert.equal(r.possibleCommittedItems,2);assert.equal(f.receipts.length,1);assert.equal(f.orders.length-f.initial.orders.length,1);assert.equal(f.http.filter(h=>h.init.body&&JSON.parse(h.init.body).operation==='create').length,1);assert.equal(f.orders.at(-1).id,f.receipts[0].value.plan[0].body.id);
});
test('inventory failure prevents writes; rate refusal and oversize acceptance stop without automatic retries',async()=>{
 for(const [options,stage]of [[{inventory:true},'inventory'],[{rate:true},'initial'],[{acceptOversized:true},'oversized_body']]){const f=fake(true,options),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage);if(options.inventory)assert.equal(r.possibleCommittedOrders,0);if(options.rate){assert.equal(r.actualHttpStatus,429);assert.equal(r.expectedHttpStatus,200);assert.equal(f.http.filter(h=>h.init.body&&JSON.parse(h.init.body).operation==='create').length,1);}}
});
test('rollback, observer loss, connection cleanup and result-write failures cannot report success',async()=>{
 for(const [options,stage]of [[{rollback:true},'observer_rollback'],[{observerLost:true},'refill_initial'],[{end:true},'connection_cleanup'],[{finish:true},'finish_receipt']]){const f=fake(true,options),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(f.receipts.length,options.rollback||options.end&&r.possibleCommittedOrders===0?0:1);assert.equal(r.noAutomaticRetry,true);}
});
test('exclusive private receipt helper refuses overwrite and both full receipts fit existing 64 KiB reader',async()=>{
 const f=fake(true);assert.equal((await f.run()).status,'write_proof_passed');const dir=mkdtempSync(join(tmpdir(),'order-api-private-test-'));chmodSync(dir,0o700);const path=join(dir,'inventory.json');saveMeasurementApiInventory(path,f.receipts[0].value);saveMeasurementApiInventory(path+'.result.json',f.receipts[1].value);assert.deepEqual(privateReceipt.read(path),f.receipts[0].value);assert.deepEqual(privateReceipt.read(path+'.result.json'),f.receipts[1].value);assert.ok(statSync(path).size<=65536);assert.ok(statSync(path+'.result.json').size<=65536);assert.equal(statSync(path).mode&0o777,0o600);assert.throws(()=>saveMeasurementApiInventory(path,{}));assert.throws(()=>config(true,{PRODUCT_ORDER_API_INVENTORY:path}));const resultOnly=join(dir,'result-only.json');saveMeasurementApiInventory(resultOnly+'.result.json',{});assert.throws(()=>config(true,{PRODUCT_ORDER_API_INVENTORY:resultOnly}));
});
test('request/status sanitization and default schema inspectors have no migration, cleanup or retry path',async()=>{
 let calls=0;await assert.rejects(orderApiProofRequest('synthetic-cookie',{operation:'list'},{request:async()=>{calls++;return Response.json({PRIVATE:'secret'},{status:503});}}));assert.equal(calls,1);assert.deepEqual(orderApiProofFailure('PRIVATE',false,{orders:new Set(),items:new Set()},fault('PRIVATE')),{status:'failed',stage:'internal',inventorySaved:false,possibleCommittedOrders:0,possibleCommittedItems:0,noAutomaticRetry:true});
 assert.match(source,/await orderSchemaMetadata\(db\);/u);assert.match(source,/await orderApplicationPrivileges\(db\);/u);assert.doesNotMatch(source,/FROM product\._prisma_migrations|query\(["'`](?:COMMIT|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT)|retry429|lower\(|max\("versionNumber"\)/u);assert.match(source,/versionNumber>=1/u);assert.ok(source.includes('!values.includes(excludedMeasurementId)'));assert.match(source,/if\(process.argv\[1\]&&import.meta.url===pathToFileURL/u);
});


test('measurement setup modes require their own write and cleanup review; missing existing negative versions do not bypass normal Order proof guards',()=>{
 assert.equal(fixtureConfig().fixtureSetup,true);assert.equal(fixtureConfig(true).write,true);
 for(const patch of [{PRODUCT_ORDER_MEASUREMENT_FIXTURE_SETUP_CONFIRMED:undefined},{PRODUCT_ORDER_API_EXCLUDED_MEASUREMENT_ID:undefined},{PRODUCT_ORDER_API_OTHER_CLIENT_A_ID:ids.a}])assert.throws(()=>fixtureConfig(false,patch));
 for(const patch of [{PRODUCT_ORDER_MEASUREMENT_FIXTURE_WRITES_CONFIRMED:undefined,PRODUCT_ORDER_API_WRITES_CONFIRMED:'true'},{PRODUCT_ORDER_MEASUREMENT_FIXTURE_CLEANUP_CONFIRMED:undefined},{PRODUCT_ORDER_MEASUREMENT_FIXTURE_CLEANUP_SHA256:'wrong'}])assert.throws(()=>fixtureConfig(true,patch));
 assert.throws(()=>config(false,{PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:undefined,PRODUCT_ORDER_MEASUREMENT_FIXTURE_SETUP_CONFIRMED:'true'}));
});
test('measurement fixture preflight verifies two empty target histories without writes or touching protected Client history or Orders',async()=>{
 const f=fake(false,{fixtureSetup:true}),r=await f.run();assert.equal(r.status,'measurement_fixture_preflight_passed',JSON.stringify(r));assert.equal(r.measurementWrites,0);assert.equal(f.receipts.length,0);assert.deepEqual([...f.measurements.values()],f.initial.measurements);assert.deepEqual(f.orders,f.initial.orders);assert.deepEqual(f.items,f.initial.items);assert.equal(f.http.some(h=>h.init.body&&JSON.parse(h.init.body).operation==='create'),false);
 const nonempty=fake(true,{fixtureSetup:true,nonempty:true}),refused=await nonempty.run();assert.equal(refused.status,'failed');assert.equal(refused.stage,'fixture_setup_history_a');assert.equal(nonempty.receipts.length,0);
});
test('measurement fixture creation commits only two inventoried versions with one exact entry each and protects original Version 1',async()=>{
 const f=fake(true,{fixtureSetup:true}),r=await f.run();assert.equal(r.status,'measurement_fixtures_created',JSON.stringify(r));assert.equal(r.committedSyntheticVersions,2);assert.equal(r.committedSyntheticEntries,2);assert.equal(f.receipts.length,2);assert.equal(f.receipts[0].value.kind,'order_measurement_fixtures');assert.equal(f.receipts[1].value.kind,'order_measurement_fixture_result');assert.deepEqual(f.receipts[1].value.versions.map(v=>v.clientId),[ids.a2,ids.b]);assert.ok(f.receipts[1].value.versions.every(v=>v.versionNumber===1&&v.entries.length===1&&v.entries[0].value==='1.25'));
 assert.deepEqual(f.measurements.get(ids.excluded),f.initial.measurements[0]);assert.deepEqual(f.orders,f.initial.orders);assert.deepEqual(f.items,f.initial.items);assert.equal(f.http.filter(h=>h.init.body&&JSON.parse(h.init.body).operation==='create').length,2);assert.equal(f.waits.reduce((a,b)=>a+b,0),f.c.refillWait);assert.ok(f.http.every(h=>h.url.endsWith('/session')||h.url.endsWith('/tailor-measurements')));assert.doesNotMatch(JSON.stringify(f.reports),/11111111|77777777|synthetic-a|cookie|postgresql:/u);
});
test('lost fixture acknowledgement or second creation failure preserves exact IDs and never retries or generates replacements',async()=>{
 for(const [options,stage,attempts]of [[{ambiguous:true},'fixture_setup_create_a',1],[{secondFailure:true},'fixture_setup_create_b',2]]){const f=fake(true,{fixtureSetup:true,...options}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(r.possibleCommittedVersions,attempts);assert.equal(f.receipts.length,1);assert.equal(f.http.filter(h=>h.init.body&&JSON.parse(h.init.body).operation==='create').length,attempts);assert.equal(f.measurements.size-f.initial.measurements.length,1);assert.ok(f.receipts[0].value.plan.some(p=>p.body.id===[...f.measurements.keys()].at(-1)));assert.equal(r.noAutomaticRetry,true);}
});
test('measurement fixture inventory, snapshot and result failures cannot report complete creation or allow untracked writes',async()=>{
 for(const [options,stage]of [[{inventory:true},'inventory'],[{changedSnapshot:true},'unrelated_snapshot'],[{finish:true},'finish_receipt']]){const f=fake(true,{fixtureSetup:true,...options}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));if(options.inventory)assert.equal(f.measurements.size,f.initial.measurements.length);else assert.equal(f.receipts.length,1);}
});

test('two-fixture receipts use the existing private writer/reader and cleanup is scoped after zero references',async()=>{
 const f=fake(true,{fixtureSetup:true});assert.equal((await f.run()).status,'measurement_fixtures_created');const dir=mkdtempSync(join(tmpdir(),'order-measurement-fixtures-'));chmodSync(dir,0o700);const path=join(dir,'inventory.json');
 saveMeasurementApiInventory(path,f.receipts[0].value);saveMeasurementApiInventory(path+'.result.json',f.receipts[1].value);assert.deepEqual(privateReceipt.read(path),f.receipts[0].value);assert.deepEqual(privateReceipt.read(path+'.result.json'),f.receipts[1].value);assert.ok(statSync(path).size<=65536&&statSync(path+'.result.json').size<=65536);
 const docs=readFileSync(new URL('../../prisma/product/setup/order-api-verification.md',import.meta.url),'utf8');for(const text of ['referencing_items=0','WHERE "measurementVersionId" = ANY($1::uuid[])','exactly TWO entry deletions and TWO version deletions','historical','Do not clear or rewrite','exact setup run/inventory/result digest'])assert.ok(docs.includes(text),text);
 assert.ok(docs.lastIndexOf('DELETE FROM product."MeasurementEntry"')<docs.lastIndexOf('DELETE FROM product."MeasurementVersion"'));
});

test('late conflict diagnostics distinguish transport, headers, status, content type, JSON and body without exposing responses',async()=>{
 for(const [kind,want]of [["transport","transport"],["headers","headers"],["status","status"],["content_type","content_type"],["json","json"]]){
  let stage;const request=async()=>{
   if(kind==="transport")throw fault("PRIVATE");
   if(kind==="headers")return {redirected:true};
   if(kind==="status")return Response.json({PRIVATE:"secret"},{status:503});
   if(kind==="content_type")return new Response("PRIVATE",{status:409});
   return new Response("PRIVATE malformed JSON",{status:409,headers:{"content-type":"application/json"}});
  };
  await assert.rejects(orderApiProofRequest("PRIVATE cookie",{operation:"create"},{request,expectedStatus:409,stage:value=>{stage=value;}}),e=>{
   const safe=orderApiProofFailure("late_item_conflict_"+stage,true,{orders:new Set(),items:new Set()},e);
   assert.equal(safe.stage,"late_item_conflict_"+want);assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|secret/u);
   if(kind==="status"){assert.equal(safe.actualHttpStatus,503);assert.equal(safe.expectedHttpStatus,409);}return true;
  });
 }
 let stage;assert.deepEqual(await orderApiProofRequest("PRIVATE",{operation:"create"},{expectedStatus:409,request:async()=>Response.json({error:"order_conflict"},{status:409}),stage:v=>{stage=v;}}),{error:"order_conflict"});assert.equal(stage,"json");
 assert.match(source,/phase="late_item_conflict_body";assert.deepEqual\(value/u);
});

test('response stream cancellation failure cannot mask the known unexpected HTTP status',async()=>{
 await assert.rejects(orderApiProofRequest("PRIVATE",{operation:"create"},{expectedStatus:409,request:async()=>({redirected:false,headers:new Headers(),status:503,body:{async cancel(){throw fault("PRIVATE");}}})}),error=>{
  const safe=orderApiProofFailure("late_item_conflict_status",true,{orders:new Set(),items:new Set()},error);
  assert.equal(safe.actualHttpStatus,503);assert.equal(safe.expectedHttpStatus,409);assert.doesNotMatch(JSON.stringify(safe),/PRIVATE/u);return true;
 });
});

test('item-edit modes require independent approval and cleanup digest; original modes cannot bypass their prerequisites',()=>{
 assert.equal(editConfig().editSetup,true);assert.equal(editConfig(true).write,true);assert.equal(editConfig().duplicateProbe,false);
 for(const patch of [{PRODUCT_ORDER_ITEM_EDIT_PROOF_CONFIRMED:undefined},{PRODUCT_ORDER_API_EXCLUDED_MEASUREMENT_ID:undefined},{PRODUCT_ORDER_API_OTHER_CLIENT_A_ID:ids.a},{PRODUCT_ORDER_ITEM_EDIT_DUPLICATE_PROBE_CONFIRMED:'yes'}])assert.throws(()=>editConfig(false,patch));
 for(const patch of [{PRODUCT_ORDER_ITEM_EDIT_WRITES_CONFIRMED:undefined,PRODUCT_ORDER_API_WRITES_CONFIRMED:'true'},{PRODUCT_ORDER_ITEM_EDIT_CLEANUP_CONFIRMED:undefined},{PRODUCT_ORDER_ITEM_EDIT_CLEANUP_SHA256:'wrong'},{PRODUCT_ORDER_ITEM_EDIT_INVENTORY:'relative'}])assert.throws(()=>editConfig(true,patch));
 assert.throws(()=>config(false,{PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID:undefined,PRODUCT_ORDER_ITEM_EDIT_PROOF_CONFIRMED:'true'}));
 const plan=orderItemEditPlan(editConfig());assert.equal(plan.length,2);assert.equal(plan[0].body.clientId,ids.a2);assert.equal(plan[0].body.items.length,1);assert.equal(plan[1].body.clientId,ids.a2);assert.notEqual(plan[1].body.id,ids.excluded);
 const optional=orderItemEditPlan(editConfig(false,{PRODUCT_ORDER_ITEM_EDIT_DUPLICATE_PROBE_CONFIRMED:'true'}));assert.equal(optional.length,3);assert.equal(optional[2].body.items[1].id,optional[0].body.items[0].id);
});
test('item-edit preflight uses five HTTP reads/rejections and rollback-only SQL, with no inventory or durable records',async()=>{
 const f=fake(false,{editSetup:true}),r=await f.run();assert.equal(r.status,'item_edit_preflight_passed',JSON.stringify(r));assert.equal(r.orderWrites,0);assert.equal(r.measurementWrites,0);assert.equal(f.http.length,5);assert.equal(f.receipts.length,0);assert.deepEqual(f.orders,f.initial.orders);assert.deepEqual([...f.measurements.values()],f.initial.measurements);assert.ok(f.sql.every(q=>/^(SELECT|BEGIN|SET LOCAL|ROLLBACK)/u.test(q)));
 const occupied=fake(true,{editSetup:true,nonempty:true});assert.equal((await occupied.run()).stage,'fixture_setup_history_a');assert.equal(occupied.receipts.length,0);
});
test('edit proof verifies one Order/item, one new measurement, no-op/stale/competing edits, selection and clearing with fifteen requests',async()=>{
 const f=fake(true,{editSetup:true}),r=await f.run();assert.equal(r.status,'item_edit_write_proof_passed',JSON.stringify(r));assert.equal(r.duplicateProbe,'not_requested');assert.equal(f.http.length,15);assert.equal(f.orders.length-f.initial.orders.length,1);assert.equal(f.items.length-f.initial.items.length,1);assert.equal(f.measurements.size-f.initial.measurements.length,1);assert.equal(f.measurementEntries.length-f.initial.entries.length,1);assert.equal(f.receipts.length,2);
 const inv=f.receipts[0].value,result=f.receipts[1].value;assert.equal(inv.kind,'order_item_edit_proof');assert.equal(result.kind,'order_item_edit_result');assert.equal(result.inventoryCreatedAt,inv.createdAt);assert.equal(result.runId,inv.runId);assert.equal(result.cleanupPerformed,false);assert.equal(result.orders[0].items[0].measurementVersionId,null);assert.equal(result.orders[0].updatedAt,result.orders[0].createdAt);assert.equal(result.orders[0].items[0].createdAt,result.orders[0].createdAt);
 assert.equal(result.editTrace.length,7);const race=result.editTrace.filter(r=>r.stage==='edit_competing');assert.equal(race.length,2);assert.equal(race[0].body.expectedUpdatedAt,race[1].body.expectedUpdatedAt);assert.equal(f.waits.reduce((a,b)=>a+b,0),3*f.c.refillWait);assert.ok(f.waits.every(ms=>ms<=30000));
 assert.deepEqual(f.orders.slice(0,f.initial.orders.length),f.initial.orders);assert.deepEqual(f.measurements.get(ids.excluded),f.initial.measurements[0]);assert.deepEqual(f.measurementEntries.slice(0,f.initial.entries.length),f.initial.entries);assert.doesNotMatch(JSON.stringify(f.reports),/11111111|77777777|synthetic-a|cookie|postgresql:/u);
});
test('optional isolated duplicate-item probe adds one request and no rows; partial parent leaks fail independently',async()=>{
 const f=fake(true,{editSetup:true,duplicateProbe:true}),r=await f.run();assert.equal(r.status,'item_edit_write_proof_passed',JSON.stringify(r));assert.equal(r.duplicateProbe,'passed');assert.equal(f.http.length,16);assert.equal(f.orders.length-f.initial.orders.length,1);assert.equal(f.items.length-f.initial.items.length,1);
 const leaked=fake(true,{editSetup:true,duplicateProbe:true,partialOrder:true}),failed=await leaked.run();assert.equal(failed.status,'failed');assert.equal(failed.stage,'edit_database');assert.equal(leaked.receipts.length,1);assert.equal(failed.possibleCommittedOrders,2);
});
test('wrong edit statuses, mutated no-ops/parents/history, stale acceptance and two winning edits cannot pass',async()=>{
 for(const [options,stage]of [[{updateUnavailable:true},'edit_description'],[{noopMutates:true},'edit_noop'],[{corruptParent:true},'edit_description'],[{corruptMeasurement:true},'edit_history'],[{staleAccepted:true},'edit_stale'],[{raceBoth:true},'edit_competing']]){const f=fake(true,{editSetup:true,...options}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(f.receipts.length,1);assert.equal(r.noAutomaticRetry,true);assert.equal(r.possibleCommittedOrders,1);assert.equal(r.possibleCommittedVersions,1);}
});
test('ambiguous edit/measurement outcomes preserve IDs and stop without retry; both competing requests settle before failure',async()=>{
 for(const [options,stage]of [[{ambiguous:true},'edit_measurement'],[{ambiguousEdit:true},'edit_description'],[{ambiguousRace:true},'edit_competing']]){const f=fake(true,{editSetup:true,...options}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(f.receipts.length,1);assert.equal(r.possibleCommittedVersions,1);assert.equal(r.editsMayHaveCommitted,!options.ambiguous);if(options.ambiguousRace)assert.equal(f.http.filter(h=>h.init.body&&JSON.parse(h.init.body).description?.includes('competing')).length,2);}
});
test('edit inventory, baseline, observer and result failures cannot report success or create untracked replacements',async()=>{
 for(const [options,stage]of [[{inventory:true},'inventory'],[{changedSnapshot:true},'edit_history'],[{rollback:true},'observer_rollback'],[{finish:true},'finish_receipt']]){const f=fake(true,{editSetup:true,...options}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(r.noAutomaticRetry,true);if(options.inventory)assert.equal(f.orders.length,f.initial.orders.length);}
});
test('edit receipts fit secure existing files and conflict-aware requests still reject unexpected statuses',async()=>{
 const f=fake(true,{editSetup:true});assert.equal((await f.run()).status,'item_edit_write_proof_passed');const dir=mkdtempSync(join(tmpdir(),'order-edit-private-'));chmodSync(dir,0o700);const path=join(dir,'inventory.json');
 saveMeasurementApiInventory(path,f.receipts[0].value);saveMeasurementApiInventory(path+'.result.json',f.receipts[1].value);assert.deepEqual(privateReceipt.read(path),f.receipts[0].value);assert.deepEqual(privateReceipt.read(path+'.result.json'),f.receipts[1].value);assert.throws(()=>editConfig(true,{PRODUCT_ORDER_ITEM_EDIT_INVENTORY:path}));assert.ok(statSync(path).size<=65536&&statSync(path+'.result.json').size<=65536);
 for(const status of [200,409])assert.equal((await orderApiProofRequest('synthetic',{operation:'update_item'},{includeConflict:true,request:async()=>Response.json({safe:true},{status})})).status,status);
 await assert.rejects(orderApiProofRequest('synthetic',{operation:'update_item'},{includeConflict:true,request:async()=>Response.json({error:'order_unavailable'},{status:503})}));
});

test('unexpected measurement HTTP status remains numeric and sanitized in the edit proof',async()=>{
 const f=fake(true,{editSetup:true,measurementUnavailable:true}),r=await f.run();assert.equal(r.status,'failed');assert.equal(r.stage,'edit_measurement');assert.equal(r.actualHttpStatus,503);assert.equal(r.expectedHttpStatus,200);assert.equal(f.receipts.length,1);assert.equal(r.possibleCommittedOrders,0);assert.equal(r.possibleCommittedVersions,1);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|cookie|postgresql:/u);
});
