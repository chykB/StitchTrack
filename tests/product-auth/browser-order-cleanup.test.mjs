// Offline synthetic fixtures and injected PostgreSQL doubles only; never real connections.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdtempSync,chmodSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {authorizeBrowserOrder,runBrowserOrder} from "./browser-order-cleanup.mjs";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex"),md5=v=>createHash("md5").update(JSON.stringify(v)).digest("hex");
const tables=[...measurementApiSnapshotTables,"Order","OrderItem","AuthRateBucket","_prisma_migrations"].sort();
const clientId=randomUUID(),versionId=randomUUID(),orderId=randomUUID(),itemId=randomUUID();
const plan={businessId:"synthetic-studio",clientId,protectedMeasurementId:versionId,creation:{description:"Browser synthetic initial clothing item",measurementVersionId:versionId},final:{description:"Browser synthetic edited clothing item",measurementVersionId:null}};
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_BROWSER_ORDER_CONFIRMED:"true",PRODUCT_BROWSER_ORDER_FIXTURES_CONFIRMED:"true",PRODUCT_BROWSER_ORDER_RATE_TRACKING_CONFIRMED:"true",PRODUCT_BROWSER_ORDER_PLAN:"/private-offline-browser/plan.json",PRODUCT_BROWSER_ORDER_BASELINE:"/private-offline-browser/baseline.json",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const fault=code=>Object.assign(Error("PRIVATE credential URL ID description stack"),{code});
function fixture(){
 const baseTime=Date.now()-60000,at=n=>new Date(baseTime+n*1000),files=new Map([[env.PRODUCT_BROWSER_ORDER_PLAN,structuredClone(plan)]]),calls=[],saved=[];
 const data=Object.fromEntries(tables.map(t=>[t,[{stable:t}]]));
 data.MeasurementVersion=[{id:versionId,businessId:plan.businessId,clientId,versionNumber:1,unit:"cm",recordedAt:at(0)}];data.MeasurementEntry=[{measurementVersionId:versionId,name:"Protected width",value:"12.50"}];
 const existingId=randomUUID();data.Order=[{id:existingId,businessId:"other-synthetic",clientId:randomUUID(),createdAt:at(0),updatedAt:at(0)}];data.OrderItem=[{id:randomUUID(),orderId:existingId,clientId:data.Order[0].clientId,description:"Unrelated",measurementVersionId:null,createdAt:at(0),updatedAt:at(0)}];
 const initial=structuredClone(data);let active=false,before,connected=false,committed=false,phase="baseline",options={};
 const rows=v=>({rows:structuredClone(v),rowCount:v.length});
 const db={on(){},async connect(){calls.push("connect");if(options.connection)throw fault("08006");connected=true;},async end(){calls.push("end");if(active){Object.assign(data,structuredClone(before));active=false;}connected=false;if(options.end)throw fault("08003");},async query(q,p=[]){
  assert.ok(connected);calls.push(q);
  if(q.startsWith("BEGIN")){assert.equal(active,false);assert.equal(q,phase==="execute"?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");before=structuredClone(data);active=true;return {command:"BEGIN"};}
  if(q==="ROLLBACK"){if(options.rollback)throw fault("08006");if(active)Object.assign(data,structuredClone(before));active=false;return {command:options.rollbackCommand?"UNKNOWN":"ROLLBACK"};}
  if(q==="COMMIT"){assert.equal(phase,"execute");if(options.commit)throw fault("40001");active=false;committed=true;if(options.lostCommit)throw fault("08006");return {command:options.commitCommand?"UNKNOWN":"COMMIT"};}
  assert.ok(active);if(q.startsWith("SET LOCAL"))return rows([]);
  if(q.startsWith("SELECT current_database()"))return rows([{database:options.target?"stitchtrack_product_dev":"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:options.timezone?"Africa/Lagos":"UTC",encoding:"UTF8",version:160015,safe:true}]);
  if(q.startsWith('SELECT b."primaryOwnerUserId"')){assert.deepEqual(p,[plan.businessId,clientId]);return rows(options.owner?[]:[{owner:"synthetic-owner"}]);}
  if(q.endsWith("FOR UPDATE")){assert.equal(phase,"execute");return rows(options.rowLock?[]:[{id:p[0]}]);}
  if(q.startsWith("LOCK TABLE")){assert.ok(q.endsWith(phase==="execute"?" IN SHARE ROW EXCLUSIVE MODE":" IN ACCESS SHARE MODE"));if(options.lock)throw fault("55P03");return rows([]);}
  if(q.startsWith("SELECT c.relname AS name"))return rows([...tables,...(options.extraTable?["unexpected"]:[])].map(name=>({name,kind:"r",owner:"stitchtrack_product_test_migrator"})));
  if(q.startsWith("SELECT pg_get_userbyid(nspowner)"))return rows([{owner:"stitchtrack_product_test_migrator",isolated:!options.publicHistory}]);
  if(q.startsWith("SELECT migration_name"))return rows(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum:options.history?"wrong":checksum,finished_at:at(0),rolled_back_at:null,logs:null,applied_steps_count:1})));
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber"'))return rows(options.protected?[]:data.MeasurementVersion.filter(v=>v.id===p[0]).map(({id,businessId,clientId,versionNumber})=>({id,businessId,clientId,versionNumber})));
  if(q.startsWith("SELECT transaction_timestamp()"))return rows([{time:at(phase==="baseline"?1:phase==="reconcile"?4:5)}]);
  if(q.startsWith('SELECT "id" FROM')){const table=q.match(/product\."(\w+)"/u)[1];return rows(data[table].map(({id})=>({id})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,202));}
  if(q.startsWith("SELECT count(")||q.startsWith("SELECT md5(")){
   const table=q.match(/FROM product\."(\w+)"/u)[1],filtered=q.includes('<>ALL')?data[table].filter(r=>!p[0].includes(r.id)):data[table];return rows(q.startsWith("SELECT count(")?[{count:filtered.length}]:[{digest:md5(filtered)}]);
  }
  if(q.startsWith('SELECT "id","businessId","clientId","createdAt"'))return rows(data.Order.filter(o=>o.id===p[0]));
  if(q.startsWith('SELECT "id","orderId","clientId",encode'))return rows(data.OrderItem.filter(i=>i.id===p[0]||i.orderId===p[1]).sort((a,b)=>a.id<b.id?-1:1).slice(0,2).map(({description,...i})=>({...i,description_hex:Buffer.from(description,"utf8").toString("hex")})));
  if(q.startsWith('DELETE FROM product."OrderItem"')){assert.equal(phase,"execute");assert.deepEqual(p,[itemId,orderId,clientId]);const n=data.OrderItem.length;data.OrderItem=data.OrderItem.filter(i=>!(i.id===p[0]&&i.orderId===p[1]&&i.clientId===p[2]));return {rowCount:options.deleteCount?0:n-data.OrderItem.length};}
  if(q.startsWith('DELETE FROM product."Order"')){assert.equal(phase,"execute");assert.deepEqual(p,[orderId,plan.businessId,clientId]);assert.ok(!data.OrderItem.some(i=>i.orderId===orderId));const n=data.Order.length;data.Order=data.Order.filter(o=>!(o.id===p[0]&&o.businessId===p[1]&&o.clientId===p[2]));if(options.afterDrift)data.Client.push({changed:true});if(options.afterRateDrift)data.AuthRateBucket.push({changed:true});return {rowCount:n-data.Order.length};}
  assert.fail("Unexpected offline SQL");
 }};
 const config=(mode,patch={})=>{const b=files.get(env.PRODUCT_BROWSER_ORDER_BASELINE),r=files.get(env.PRODUCT_BROWSER_ORDER_BASELINE+".reconciled.json"),p=files.get(env.PRODUCT_BROWSER_ORDER_BASELINE+".cleanup.json");return authorizeBrowserOrder(["--owner-browser-order-"+({baseline:"baseline",reconcile:"reconcile",preflight:"cleanup-preflight",execute:"cleanup-execute"}[mode])],{...env,...(b?{PRODUCT_BROWSER_ORDER_RUN_ID:b.runId,PRODUCT_BROWSER_ORDER_BASELINE_SHA256:hash(b)}:{}),...(r?{PRODUCT_BROWSER_ORDER_RECONCILIATION_SHA256:hash(r)}:{}),...(p?{PRODUCT_BROWSER_ORDER_PREFLIGHT_SHA256:hash(p)}:{}),...(mode==="execute"?{PRODUCT_BROWSER_ORDER_EXECUTE_CONFIRMED:"true"}:{}),...patch});};
 const run=async(mode,changes={},patch={})=>{phase=mode;options=changes;return runBrowserOrder(config(mode,patch),{db,read:path=>structuredClone(files.get(path)),save:(path,value)=>{assert.ok(!files.has(path));files.set(path,structuredClone(value));saved.push(path);},inspectMetadata:async()=>{calls.push("inspectMetadata");if(options.metadata)throw fault("42501");}});};
 const create=()=>{data.Order.push({id:orderId,businessId:plan.businessId,clientId,createdAt:at(2),updatedAt:at(2)});data.OrderItem.push({id:itemId,orderId,clientId,...plan.creation,createdAt:at(2),updatedAt:at(2)});data.AuthRateBucket.push({browserCounters:1});};
 const edit=()=>{Object.assign(data.OrderItem.find(i=>i.id===itemId),plan.final,{updatedAt:at(3)});data.AuthRateBucket.push({browserCounters:2});};
 return {run,config,create,edit,files,calls,saved,data,initial,get committed(){return committed;}};
}
async function prepared(){const f=fixture();assert.equal((await f.run("baseline")).status,"baseline_passed");f.create();assert.equal((await f.run("reconcile")).status,"reconcile_passed");f.edit();assert.equal((await f.run("preflight")).status,"preflight_passed");return f;}
test("authorization requires test migrator, fixture/rate approval, explicit mode, and all execution digests",async()=>{
 const f=await prepared();for(const patch of [{PRODUCT_BROWSER_ORDER_CONFIRMED:undefined},{PRODUCT_BROWSER_ORDER_FIXTURES_CONFIRMED:undefined},{PRODUCT_BROWSER_ORDER_RATE_TRACKING_CONFIRMED:undefined},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_BROWSER_ORDER_BASELINE:"relative"},{NODE_OPTIONS:"unsafe"},{PGOPTIONS:"unsafe"},{PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('_migrator:','_app:')}])assert.throws(()=>f.config("baseline",patch));
 for(const patch of [{PRODUCT_BROWSER_ORDER_EXECUTE_CONFIRMED:undefined},{PRODUCT_BROWSER_ORDER_RUN_ID:"invalid"},{PRODUCT_BROWSER_ORDER_BASELINE_SHA256:undefined},{PRODUCT_BROWSER_ORDER_RECONCILIATION_SHA256:undefined},{PRODUCT_BROWSER_ORDER_PREFLIGHT_SHA256:"wrong"}])assert.throws(()=>f.config("execute",patch));
 assert.throws(()=>authorizeBrowserOrder(["--unknown"],env));assert.throws(()=>authorizeBrowserOrder([],env));
});
test("baseline, reconciliation and cleanup preflight acknowledge read-only rollback and preserve original evidence",async()=>{
 const f=await prepared();assert.equal(f.saved.length,3);assert.equal(f.calls.filter(q=>q==="ROLLBACK").length,3);assert.equal(f.calls.some(q=>q.startsWith("DELETE")||q==="COMMIT"),false);
 const b=f.files.get(env.PRODUCT_BROWSER_ORDER_BASELINE),r=f.files.get(env.PRODUCT_BROWSER_ORDER_BASELINE+".reconciled.json"),p=f.files.get(env.PRODUCT_BROWSER_ORDER_BASELINE+".cleanup.json");assert.deepEqual(b.plan,plan);assert.equal(r.records.item.measurementVersionId,versionId);assert.equal(p.records.item.measurementVersionId,null);assert.equal(p.records.item.id,itemId);assert.equal(p.records.order.id,orderId);assert.notDeepEqual(b.rates,r.rates);assert.notDeepEqual(r.rates,p.rates);assert.equal(r.baselineDigest,hash(b));assert.equal(p.reconciliationDigest,hash(r));
 const originals=structuredClone([...f.files]);const out=await f.run("execute");assert.equal(out.status,"cleaned",JSON.stringify(out));assert.equal(out.commitConfirmed,true);assert.deepEqual([...f.files],originals);
 assert.deepEqual(f.data.Order,f.initial.Order);assert.deepEqual(f.data.OrderItem,f.initial.OrderItem);for(const t of tables.filter(t=>t!=="AuthRateBucket"))assert.deepEqual(f.data[t],f.initial[t]);assert.equal(f.data.AuthRateBucket.length,3);assert.equal(f.calls.filter(q=>q.startsWith("DELETE")).length,2);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);
});
test("wrong evidence digests, run, plan or incomplete evidence refuse before connecting",async()=>{
 for(const field of ["baseline","reconciliation","preflight"]){const f=await prepared(),c=f.config("execute");c.digests[field]="0".repeat(64);let connected=false;const r=await runBrowserOrder(c,{db:{async connect(){connected=true;},async end(){}},read:p=>structuredClone(f.files.get(p))});assert.equal(r.status,"refused");assert.equal(r.stage,"evidence");assert.equal(connected,false);}
 const f=await prepared(),c=f.config("execute");c.runId=randomUUID();assert.equal((await runBrowserOrder(c,{read:p=>f.files.get(p)})).status,"refused");
 const bad=fixture();bad.files.get(env.PRODUCT_BROWSER_ORDER_PLAN).creation.description=" ";assert.equal((await bad.run("baseline")).status,"refused");assert.equal(bad.calls.includes("connect"),false);
});
test("reconciliation rejects zero or multiple additions, deleted originals, wrong ownership, contents and measurement references",async()=>{
 for(const change of [f=>{f.data.Order.pop();},f=>{f.data.Order.push({...f.data.Order.at(-1),id:randomUUID()});},f=>{f.data.OrderItem.push({...f.data.OrderItem.at(-1),id:randomUUID()});},f=>{f.data.Order.shift();},f=>{f.data.Order.at(-1).businessId="wrong";},f=>{f.data.OrderItem.at(-1).description="changed";},f=>{f.data.OrderItem.at(-1).measurementVersionId=randomUUID();},f=>{f.data.OrderItem.at(-1).clientId=randomUUID();}]){
  const f=fixture();await f.run("baseline");f.create();change(f);const r=await f.run("reconcile");assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);assert.equal(f.saved.length,1);
 }
});
test("all unrelated records and protected measurement history must match the original baseline",async()=>{
 for(const table of ["User","Client","Session","MeasurementVersion","MeasurementEntry","_prisma_migrations"]){const f=fixture();await f.run("baseline");f.create();f.data[table].push({unexpected:true});const r=await f.run("reconcile");assert.equal(r.status,"failed_rolled_back");assert.equal(r.stage,"snapshot");}
});
test("cleanup rejects changed exact contents/timestamps, rate drift, metadata, fixture and schema differences",async()=>{
 for(const [changes,mutate]of [[{},f=>{f.data.OrderItem.at(-1).description="changed";}],[{},f=>{f.data.Order.at(-1).updatedAt=new Date();}],[{},f=>{f.data.OrderItem.at(-1).updatedAt=new Date();}],[{},f=>{f.data.AuthRateBucket.push({unexpected:true});}],[{metadata:true},()=>{}],[{owner:true},()=>{}],[{extraTable:true},()=>{}],[{publicHistory:true},()=>{}],[{history:true},()=>{}],[{protected:true},()=>{}],[{target:true},()=>{}],[{timezone:true},()=>{}],[{lock:true},()=>{}]]){
  const f=await prepared();mutate(f);const r=await f.run("execute",changes);assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|credential|postgresql:|description/u);
 }
});
test("wrong deletion counts and restoration drift roll back both records before COMMIT",async()=>{
 for(const option of ["deleteCount","afterDrift","afterRateDrift"]){const f=await prepared(),before=structuredClone(f.data);const r=await f.run("execute",{[option]:true});assert.equal(r.status,"failed_rolled_back");assert.deepEqual(f.data,before);assert.equal(f.calls.includes("COMMIT"),false);}
});
test("failed, lost or unacknowledged COMMIT stays uncertain with no automatic retry",async()=>{
 for(const option of ["commit","lostCommit","commitCommand"]){const f=await prepared();const r=await f.run("execute",{[option]:true});assert.equal(r.status,"unconfirmed");assert.equal(r.deletedOrders,null);assert.equal(r.deletedItems,null);assert.equal(r.noAutomaticRetry,true);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);assert.equal(f.calls.filter(q=>q.startsWith("DELETE")).length,2);}
});
test("rollback and connection-close failures cannot create successful read-only evidence",async()=>{
 for(const option of ["rollback","rollbackCommand","connection","end"]){const f=fixture(),r=await f.run("baseline",{[option]:true});assert.notEqual(r.status,"baseline_passed");assert.equal(f.saved.length,0);assert.equal(r.noAutomaticRetry,true);}
 const f=await prepared();const r=await f.run("execute",{end:true});assert.equal(r.status,"failed_after_commit");assert.equal(r.commitConfirmed,true);
});
test("private evidence helper is create-only and rejects public permissions and repository paths",()=>{
 const dir=mkdtempSync(join(tmpdir(),"browser-order-offline-"));chmodSync(dir,0o700);const path=join(dir,"baseline.json");privateReceipt.write(path,{synthetic:true});assert.deepEqual(privateReceipt.read(path),{synthetic:true});assert.throws(()=>privateReceipt.write(path,{overwrite:true}));chmodSync(path,0o644);assert.throws(()=>privateReceipt.read(path));assert.throws(()=>privateReceipt.write(join(process.cwd(),"browser-proof-should-not-exist.json"),{}));
});
test("runner reuses existing safeguards and contains no HTTP, measurement deletion, grants or schema mutation",()=>{
 const s=readFileSync(new URL("./browser-order-cleanup.mjs",import.meta.url),"utf8");for(const part of ["orderApiSnapshot(db","await orderSchemaMetadata(db)","await measurementMetadata(db)","await orderApplicationPrivileges(db)","options:PRODUCT_PRISMA_CONNECTION_OPTIONS","privateReceipt.read","privateReceipt.write"])assert.ok(s.includes(part));assert.doesNotMatch(s,/fetch\(|CASCADE|GRANT |UPDATE product|DELETE FROM product\."(?:MeasurementVersion|MeasurementEntry|User|Client|Business)/u);
});

test("changed protected entry bytes and wrong initial timestamps cannot authorize reconciliation",async()=>{
 for(const mutate of [f=>{f.data.MeasurementEntry[0].name="Changed protected label";},f=>{f.data.MeasurementEntry[0].value="99";},f=>{f.data.OrderItem.at(-1).updatedAt=new Date();},f=>{f.data.OrderItem.at(-1).createdAt=new Date(0);}]){
  const f=fixture();await f.run("baseline");f.create();mutate(f);const out=await f.run("reconcile");assert.equal(out.status,"failed_rolled_back");assert.equal(f.saved.length,1);assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);
 }
});
test("execution rollback uncertainty reports unknown deletion counts and never retries",async()=>{
 const f=await prepared(),out=await f.run("execute",{deleteCount:true,rollback:true});assert.equal(out.status,"unconfirmed");assert.equal(out.rollbackFailed,true);assert.equal(out.deletedOrders,null);assert.equal(out.deletedItems,null);assert.equal(f.calls.filter(q=>q==="ROLLBACK").length,4);assert.equal(f.calls.filter(q=>q.startsWith("DELETE")).length,1);assert.equal(f.calls.includes("COMMIT"),false);
});
