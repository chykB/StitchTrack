// Offline only. Injected database/HTTP/receipt/wait doubles; no real endpoints or private inputs.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,chmodSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {measurementRequestSchema} from "../../lib/measurement-contract.ts";
import {authorizeMeasurementApiProof,measurementApiPlan,measurementApiProofRequest,measurementApiProofFailure,runMeasurementApiProof,saveMeasurementApiInventory} from "./measurement-api.integration.mjs";
const source=readFileSync(new URL("./measurement-api.integration.mjs",import.meta.url),"utf8");
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MEASUREMENT_API_PROOF_CONFIRMED:"true",PRODUCT_MEASUREMENT_API_FIXTURES_CONFIRMED:"true",
 PRODUCT_MEASUREMENT_API_BUSINESS_A_ID:"synthetic-a",PRODUCT_MEASUREMENT_API_BUSINESS_B_ID:"synthetic-b",PRODUCT_MEASUREMENT_API_CLIENT_A_ID:"11111111-1111-4111-8111-111111111111",PRODUCT_MEASUREMENT_API_CLIENT_B_ID:"22222222-2222-4222-8222-222222222222",
 PRODUCT_MEASUREMENT_API_COOKIE_A:"better-auth.session_token=synthetic-a.signature",PRODUCT_MEASUREMENT_API_COOKIE_B:"better-auth.session_token=synthetic-b.signature",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:3000",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const config=(write=false,patch={})=>authorizeMeasurementApiProof([write?"--owner-measurement-api-write-proof":"--owner-measurement-api-preflight"],{...env,...(write?{PRODUCT_MEASUREMENT_API_WRITES_CONFIRMED:"true",PRODUCT_MEASUREMENT_API_INVENTORY:"/private-offline-test/inventory.json"}:{}),...patch});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No live requests in offline tests");test.after(()=>{globalThis.fetch=originalFetch;});
const privateError=code=>Object.assign(Error("PRIVATE URL cookie Client ID SQL payload"),{code,stack:"PRIVATE"});
function fake(write=false,options={}){
 const c=config(write),sql=[],http=[],receipts=[],waits=[],reports=[],versions=[],entries=[];let alive=false,readonly=false,maximumActive=0,active=0,ambiguous=false,observerError;
 const collator=new Intl.Collator("und",{sensitivity:"accent"}),response=rows=>({rows,rowCount:rows.length});
 for(const i of [0,1])for(let n=1;n<=(options.initialCount??1);n++){
  const id=(i===0?"aaaaaaaa":"bbbbbbbb")+"-0000-4000-8000-"+String(n).padStart(12,"0");
  versions.push({id,businessId:c.businesses[i],clientId:c.clients[i],versionNumber:n,unit:"cm",recordedAt:new Date("2026-11-08T00:00:00.000Z")});entries.push({measurementVersionId:id,name:"Existing",value:"1"});
 }
 const initial={versions:structuredClone(versions),entries:structuredClone(entries)};
 const db={on(_event,callback){observerError=callback;},async connect(){if(options.connect)throw privateError("08006");alive=true;},async end(){alive=false;if(options.cleanup)throw privateError("08003");},
  async query(query,params=[]){
   assert.ok(alive);sql.push(query);options.inject?.(query,params);
   if(query.startsWith("BEGIN")){assert.equal(query,"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");assert.equal(readonly,false);readonly=true;return response([]);}
   if(query==="ROLLBACK"){readonly=false;if(options.rollback)throw privateError("08006");return response([]);}
   assert.ok(readonly,"Observer queries cannot escape read-only transactions");
   if(query.startsWith("SET LOCAL"))return response([]);assert.ok(query.startsWith("SELECT "));
   if(query.startsWith("SELECT current_database()"))return response([{database:options.wrongTarget?"stitchtrack_product_dev":"stitchtrack_product_test",role:c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",encoding:"UTF8",version:160015,safe:true}]);
   if(query.startsWith("SELECT c.relname"))return response(["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort().map(name=>({name,kind:"r",owner:"stitchtrack_product_test_migrator"})));
   if(query.startsWith("SELECT pg_get_userbyid(nspowner)"))return response([{owner:"stitchtrack_product_test_migrator",isolated_history:!options.publicHistory}]);
   if(query.startsWith("SELECT NOT (rolsuper"))return response([{safe:true,restricted_schema:true}]);
   if(query.startsWith("SELECT has_table_privilege"))return response([{readable:true,insertable:true,forbidden:!!options.grants}]);
   if(query.startsWith("SELECT pg_get_userbyid(c.collowner)"))return response([{owner:"stitchtrack_product_test_migrator",provider:"i",deterministic:false,locale:options.locale??"und-u-kk-ks-level2",recorded:"same",actual:"same",indexed:true}]);
   if(query.startsWith('SELECT b."primaryOwnerUserId"'))return response([{id:params[0]===c.businesses[0]?"owner-a":"owner-b"}]);
   if(query.startsWith('SELECT "id","businessId" FROM product."Client"'))return response(options.badClient?[]:[{id:params[0],businessId:params[1]}]);
   if(query.startsWith('SELECT "userId"'))return response([{userId:params[0]==="digest:synthetic-a"?"owner-a":"owner-b",sufficient:!options.expired}]);
   if(query.startsWith('SELECT count(*)::int AS count,COALESCE(max')){const rows=versions.filter(v=>v.businessId===params[0]&&v.clientId===params[1]);return response([{count:options.tooMany?21:rows.length,maximum:Math.max(0,...rows.map(v=>v.versionNumber))}]);}
   if(query.startsWith("SELECT 1 FROM product.")){const data=query.includes('"MeasurementVersion"')?versions:entries,key=query.includes('"MeasurementVersion"')?"id":"measurementVersionId";return response(options.freshCollision?[{}]:data.filter(v=>params[0].includes(v[key])).map(()=>({})));}
   if(query.startsWith("SELECT md5(")||query.startsWith("SELECT count(*)::int AS count FROM")){
    const table=query.match(/FROM product\."(\w+)"/u)[1],data=table==="MeasurementVersion"?versions.filter(v=>!params[0].includes(v.id)):table==="MeasurementEntry"?entries.filter(v=>!params[0].includes(v.measurementVersionId)):[{stable:options.changedSnapshot&&versions.length>initial.versions.length?"changed":"unchanged"}];
    return response(query.startsWith("SELECT md5(")?[{digest:JSON.stringify(data)}]:[{count:data.length}]);
   }
   if(query.startsWith('SELECT "id","versionNumber"'))return response(versions.filter(v=>v.businessId===params[0]&&v.clientId===params[1]).toSorted((a,b)=>b.versionNumber-a.versionNumber).map(v=>({id:v.id,versionNumber:v.versionNumber})));
   if(query.startsWith('SELECT "id","businessId","clientId"'))return response(versions.filter(v=>params[0].includes(v.id)));
   if(query.startsWith('SELECT "measurementVersionId","name"'))return response(entries.filter(v=>params[0].includes(v.measurementVersionId)));
   throw Error("Unexpected offline observer SQL");
  }};
 const saved=v=>({id:v.id,clientId:v.clientId,versionNumber:v.versionNumber,unit:v.unit,recordedAt:v.recordedAt.toISOString(),entries:entries.filter(e=>e.measurementVersionId===v.id).map(e=>({name:e.name,value:e.value}))});
 const request=async(url,init)=>{
  assert.equal(readonly,false,"Do not hold an observer transaction open across API calls");
  http.push({url,init});const cookie=init.headers.cookie,i=cookie===c.cookies[0]?0:cookie===c.cookies[1]?1:-1;
  if(url.endsWith("/session"))return Response.json({user:{id:options.wrongHttpUser?"wrong":i===0?"owner-a":"owner-b"}});
  assert.equal(url,c.origin+"/api/internal/tailor-measurements");assert.equal(init.method,"POST");assert.equal(init.redirect,"error");assert.equal(init.headers.origin,c.origin);
  if(i<0)return Response.json({error:"unauthenticated"},{status:401});
  const body=JSON.parse(init.body);
  if(body.operation==="create"){
   assert.equal(write,true);assert.ok(receipts.length>=1,"Inventory precedes even invalid mutations");assert.ok(receipts[0].value.plan.some(p=>p.body.id===body.id));
   active++;maximumActive=Math.max(active,maximumActive);await new Promise(r=>setImmediate(r));
   try{
    if(options.rateDenied)return Response.json({error:"rate_limited"},{status:429,headers:{"retry-after":"1"}});
    const parsed=measurementRequestSchema.safeParse(body);
    const duplicates=parsed.success&&parsed.data.entries.some((a,n)=>parsed.data.entries.slice(n+1).some(b=>collator.compare(a.name,b.name)===0));
    if((!parsed.success||duplicates)&&!options.acceptInvalid)return Response.json({error:"validation_failed"},{status:422});
    const data=parsed.success?parsed.data:body,existing=versions.find(v=>v.id===data.id);
    if(existing){if(existing.unit!==data.unit||JSON.stringify(saved(existing).entries)!==JSON.stringify(data.entries))return Response.json({error:"measurement_conflict"},{status:409});return Response.json({version:saved(existing)});}
    const v={id:data.id,businessId:c.businesses[i],clientId:data.clientId,versionNumber:Math.max(0,...versions.filter(v=>v.clientId===data.clientId).map(v=>v.versionNumber))+1,unit:data.unit,recordedAt:new Date("2026-11-08T12:00:00.000Z")};versions.push(v);
    for(const e of data.entries)entries.push({measurementVersionId:v.id,...e});
    if(options.ambiguous&&!ambiguous){ambiguous=true;throw privateError("08006");}
    return Response.json({version:saved(v)});
   }finally{active--;}
  }
  if(body.clientId!==c.clients[i])return Response.json({error:"measurement_not_found"},{status:404});
  if(body.operation==="get"){const v=versions.find(v=>v.id===body.id&&v.clientId===body.clientId&&v.businessId===c.businesses[i]);return v?Response.json({version:saved(v)}):Response.json({error:"measurement_not_found"},{status:404});}
  const all=versions.filter(v=>v.clientId===body.clientId&&v.businessId===c.businesses[i]&&(!body.cursor||v.versionNumber<body.cursor.versionNumber)).toSorted((a,b)=>b.versionNumber-a.versionNumber),page=all.slice(0,body.limit);
  return Response.json({versions:page.map(saved),nextCursor:all.length>body.limit?{versionNumber:page.at(-1).versionNumber}:null});
 };
 const save=(path,value)=>{if(options.inventoryFailure||options.finishFailure&&receipts.length)throw privateError("42501");assert.equal(alive,receipts.length===0);receipts.push({path,value:structuredClone(value)});};
 const run=()=>runMeasurementApiProof(c,{db,request,save,tokenDigest:raw=>"digest:"+raw,wait:async ms=>{waits.push(ms);if(options.observerLost)observerError();},report:v=>reports.push(v)});
 return {run,c,db,sql,http,receipts,waits,reports,versions,entries,initial,maxActive:()=>maximumActive};
}
test("inert import and exact owner approvals restrict the observer and writes to approved product-test fixtures",()=>{
 assert.equal(config().write,false);assert.equal(config(true).write,true);
 for(const patch of [{PRODUCT_MEASUREMENT_API_PROOF_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_API_FIXTURES_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_API_CLIENT_A_ID:undefined},
  {PRODUCT_MEASUREMENT_API_CLIENT_B_ID:env.PRODUCT_MEASUREMENT_API_CLIENT_A_ID},{PRODUCT_MEASUREMENT_API_BUSINESS_A_ID:"other\n"},{NODE_ENV:"development"},
  {PRODUCT_DATABASE_MODE:"development"},{PGOPTIONS:"private"},{NODE_OPTIONS:"private"},{PRODUCT_SESSION_HTTP_ORIGIN:"https://outside.invalid"},
  {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("_app:","_migrator:")},{PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("product_test?","product_dev?")}])assert.throws(()=>config(false,patch));
 for(const patch of [{PRODUCT_MEASUREMENT_API_WRITES_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_API_INVENTORY:"relative.json"}])assert.throws(()=>config(true,patch));
 assert.throws(()=>authorizeMeasurementApiProof([],env));assert.throws(()=>authorizeMeasurementApiProof(["--cleanup"],env));
});
test("preflight performs only scoped reads and no inventory creation or create requests",async()=>{
 const f=fake(false,{initialCount:5}),result=await f.run();assert.equal(result.status,"preflight_passed",JSON.stringify(result));assert.equal(result.measurementWrites,0);
 assert.equal(f.receipts.length,0);assert.equal(f.waits.length,0);assert.equal(f.http.some(r=>r.init.body&&JSON.parse(r.init.body).operation==="create"),false);
 assert.deepEqual(f.versions,f.initial.versions);assert.deepEqual(f.entries,f.initial.entries);assert.ok(f.sql.filter(q=>q.startsWith("BEGIN")).length>=3);
});
test("complete write sequence verifies exact storage, retries/conflict, concurrent numbering and unchanged existing records",async()=>{
 const f=fake(true),result=await f.run();assert.equal(result.status,"write_proof_passed",JSON.stringify(result));assert.equal(result.committedSyntheticVersions,3);assert.equal(result.committedSyntheticEntries,7);assert.equal(result.cleanupPerformed,false);
 assert.equal(f.versions.length-f.initial.versions.length,3);assert.equal(f.entries.length-f.initial.entries.length,7);assert.equal(f.maxActive(),2);
 assert.equal(f.receipts.length,2);assert.equal(f.receipts[0].value.plan.length,8);assert.equal(f.receipts[1].value.versions.length,3);
 assert.ok(f.waits.every(ms=>ms<=30000));assert.equal(f.waits.reduce((a,b)=>a+b,0),3*f.c.refillWait);
 assert.equal(f.sql.some(q=>/^(?:INSERT|UPDATE|DELETE|COMMIT|GRANT|LOCK TABLE)\b/u.test(q)),false);
 assert.doesNotMatch(JSON.stringify(result),/synthetic-a|PRIVATE|postgresql:|11111111|cookie/u);
});
test("fixture, live target, schema/grants, collation and signed HTTP identity failures stop before writes",async()=>{
 for(const [options,stage]of [[{wrongTarget:true},"database_identity"],[{grants:true},"application_privileges"],[{publicHistory:true},"schema_tables"],[{locale:"und-u-ks-level2"},"icu_metadata"],
  [{badClient:true},"fixture_a_client"],[{expired:true},"fixture_a_session"],[{tooMany:true},"fixture_a_history"],[{freshCollision:true},"fresh_ids"],[{wrongHttpUser:true},"http_session_identity"]]){
  const f=fake(true,options),r=await f.run();assert.equal(r.status,"failed");assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(f.receipts.length,0);assert.equal(f.versions.length,f.initial.versions.length);assert.equal(r.possibleCommittedVersions,0);
 }
});
test("inventory creation must finish before any mutation; incomplete or uncertain outcomes never retry",async()=>{
 const noInventory=fake(true,{inventoryFailure:true}),r=await noInventory.run();assert.equal(r.stage,"inventory");assert.equal(r.possibleCommittedVersions,0);assert.equal(noInventory.http.filter(r=>r.init.body&&JSON.parse(r.init.body).operation==="create").length,0);
 const f=fake(true,{ambiguous:true}),out=await f.run();assert.equal(out.status,"failed");assert.equal(out.stage,"create");assert.equal(out.possibleCommittedVersions,8);assert.equal(out.noAutomaticRetry,true);assert.equal(f.receipts.length,1);
 const id=f.receipts[0].value.plan[0].body.id;assert.equal(f.http.filter(r=>r.init.body&&JSON.parse(r.init.body).operation==="create"&&JSON.parse(r.init.body).id===id).length,1);assert.equal(f.versions.length-f.initial.versions.length,1);
});
test("unexpected invalid-write acceptance remains inventoried and stops the proof before further creates",async()=>{
 const f=fake(true,{acceptInvalid:true}),r=await f.run();assert.equal(r.status,"failed");assert.equal(r.stage,"invalid_empty");assert.equal(r.actualHttpStatus,200);assert.equal(r.expectedHttpStatus,422);
 assert.equal(f.http.filter(r=>r.init.body&&JSON.parse(r.init.body).operation==="create").length,1);assert.ok(f.receipts[0].value.plan.some(p=>p.purpose==="invalid_empty"));
});
test("rate denial fails without serial retry; observer rollback, cleanup, receipt and snapshot errors cannot report success",async()=>{
 for(const [options,stage]of [[{observerLost:true},"refill_invalid"],[{rateDenied:true},"invalid_empty"],[{rollback:true},"observer_rollback"],[{cleanup:true},"connection_cleanup"],[{finishFailure:true},"finish_receipt"],[{changedSnapshot:true},"unrelated_snapshot"]]){
  const f=fake(true,options),r=await f.run();assert.equal(r.status,"failed");assert.equal(r.stage,stage,JSON.stringify(r));assert.equal(r.noAutomaticRetry,true);
  if(options.rateDenied)assert.equal(f.http.filter(r=>r.init.body&&JSON.parse(r.init.body).operation==="create").length,1);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE|synthetic-a|postgresql:|stack|payload/u);
 }
});
test("HTTP helper reports only explicit numeric status and never retries timeout, 503 or 429",async()=>{
 for(const status of [503,429,403]){
  let calls=0,error;try{await measurementApiProofRequest(env.PRODUCT_MEASUREMENT_API_COOKIE_A,{operation:"create"},{request:async()=>{calls++;return new Response("PRIVATE",{status});}});}catch(e){error=e;}
  assert.equal(calls,1);const r=measurementApiProofFailure("create",true,true,error);assert.equal(r.actualHttpStatus,status);assert.equal(r.expectedHttpStatus,200);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|cookie|stack/u);
 }
 let calls=0;await assert.rejects(measurementApiProofRequest("synthetic",{}, {request:async()=>{calls++;throw privateError("08006");}}));assert.equal(calls,1);
 assert.deepEqual(measurementApiProofFailure("PRIVATE",false,false,privateError("PRIVATE")),{status:"failed",stage:"internal",inventorySaved:false,possibleCommittedVersions:0,noAutomaticRetry:true});
});
test("private inventory creation is exclusive, mode 0600, outside Git, and directory-synced",()=>{
 const dir=mkdtempSync(join(tmpdir(),"stitchtrack-measurement-api-receipt-"));chmodSync(dir,0o700);const path=join(dir,"proof.json");
 saveMeasurementApiInventory(path,{synthetic:true});assert.equal(statSync(path).mode&0o777,0o600);assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),{synthetic:true});assert.throws(()=>saveMeasurementApiInventory(path,{}));
 chmodSync(dir,0o755);assert.throws(()=>saveMeasurementApiInventory(join(dir,"other.json"),{}));assert.throws(()=>saveMeasurementApiInventory("relative.json",{}));
});
test("all possible write UUIDs are inventoried, with exact scope, expected committed numbers and immutable payloads",()=>{
 const plan=measurementApiPlan(env.PRODUCT_MEASUREMENT_API_CLIENT_A_ID,7);assert.equal(plan.length,8);assert.equal(new Set(plan.map(p=>p.body.id)).size,8);
 assert.deepEqual(plan[0].expectedVersionNumbers,[8]);assert.deepEqual(plan[1].expectedVersionNumbers,[9,10]);assert.deepEqual(plan[2].expectedVersionNumbers,[9,10]);
 for(const p of plan)assert.equal(p.body.clientId,env.PRODUCT_MEASUREMENT_API_CLIENT_A_ID);
 for(const p of plan.slice(0,3))assert.equal(measurementRequestSchema.safeParse(p.body).success,true);
 assert.equal(measurementRequestSchema.safeParse(plan[6].body).success,true,"Unicode duplicates are decided by the real service/database, not JS validation");
 assert.ok(source.includes('save(config.inventory,inventory);inventorySaved=true;'));assert.doesNotMatch(source,/query\(["'`]COMMIT|DELETE FROM|INSERT INTO|UPDATE product\.|migrate deploy|\.login\(|signUpEmail/u);
 assert.ok(source.includes('finally{if(db)try{await db.end();}'));assert.ok(source.includes('Promise.allSettled'));
});
