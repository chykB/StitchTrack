// Offline state-machine doubles only. No owner files, PostgreSQL or HTTP.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,mkdtempSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {orderApiPlan,orderCleanupProposalDigest} from "./order-api.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {failedOrderRun,authorizeFailedOrderCleanup,validateFailedOrderInventory,runFailedOrderCleanup} from "./order-failed-run-cleanup.mjs";
const source=readFileSync(new URL("./order-failed-run-cleanup.mjs",import.meta.url),"utf8");
const digest=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex"),md5=v=>createHash("md5").update(JSON.stringify(v)).digest("hex");
const tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort(),allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const clients=[randomUUID(),randomUUID(),randomUUID()],businesses=["synthetic-a","synthetic-b"],versions={valid:null,wrongClient:randomUUID(),wrongBusiness:randomUUID()};
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_FAILED_ORDER_CLEANUP_CONFIRMED:"true",PRODUCT_FAILED_ORDER_CLEANUP_RUN_ID:failedOrderRun,
 PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY:"/private-offline/original.json",PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION:"/private-offline/cleanup-review.json",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const fault=code=>Object.assign(Error("PRIVATE password URL cookie UUID SQL record"),{code,stack:"PRIVATE"});
function inventory(){return {format:1,kind:"order_api_write_proof",runId:failedOrderRun,createdAt:"2026-11-09T10:00:00.000Z",database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",businesses,clients,
 references:[{purpose:"wrongClient",id:versions.wrongClient,businessId:businesses[0],clientId:clients[1],versionNumber:1},{purpose:"wrongBusiness",id:versions.wrongBusiness,businessId:businesses[1],clientId:clients[2],versionNumber:1}],
 migrationChecksums:PRODUCT_MIGRATIONS,migrationVerification:"local_manifest_and_prior_owner_tenth_integrity_proof",cleanupProposalDigest:orderCleanupProposalDigest(),baseline:tables.map(table=>({table,count:1,digest:md5([{stable:table}])})),
 plan:orderApiPlan({clients,versions}),state:"independent API commits; preserve all IDs and reconcile before any retry or cleanup"};}
function config(inv,record,patch={}){const execute=!!record;return authorizeFailedOrderCleanup([execute?"--owner-failed-order-cleanup-execute":"--owner-failed-order-cleanup-preflight"],{...env,...(execute?{PRODUCT_FAILED_ORDER_CLEANUP_EXECUTE_CONFIRMED:"true",PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY_DIGEST:digest(inv),PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION_DIGEST:digest(record)}:{}),...patch});}
function fake(inv,record=null,options={}){
 const c=config(inv,record),calls=[],saved=[],reports=[],stamp=new Date("2026-11-09T10:00:05.000Z");let active=false,connected=false,before,committed=false;
 const orders=inv.plan.slice(0,2).map(p=>({id:p.body.id,businessId:businesses[0],clientId:clients[0],createdAt:new Date(stamp),updatedAt:new Date(stamp)}));
 const items=inv.plan.slice(0,2).flatMap(p=>p.body.items.map(i=>({id:i.id,orderId:p.body.id,clientId:clients[0],description_hex:Buffer.from(i.description,"utf8").toString("hex"),measurementVersionId:i.measurementVersionId,createdAt:new Date(stamp),updatedAt:new Date(stamp)})));
 if(options.orderChange)Object.assign(orders[0],options.orderChange);if(options.itemChange)Object.assign(items[0],options.itemChange);
 if(options.extraOrder)orders.push({...orders[0],id:inv.plan[2].body.id});if(options.extraItem)items.push({...items[0],id:inv.plan[2].body.items[0].id});
 if(options.missingItem)items.pop();if(options.unplannedItem)items.push({...items[0],id:randomUUID()});
 const initial=structuredClone({orders,items}),rows=v=>({rows:v,rowCount:v.length});
 const restore=()=>{orders.splice(0,orders.length,...structuredClone(before.orders));items.splice(0,items.length,...structuredClone(before.items));};
 const db={on(){},async connect(){calls.push("connect");if(options.connection)throw fault("08006");connected=true;},async end(){calls.push("end");connected=false;if(active){restore();active=false;}if(options.end)throw fault("08003");},async query(q,p=[]){
  assert.ok(connected);calls.push(q);if(q.startsWith("BEGIN")){assert.equal(active,false);assert.equal(q,c.execute?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");active=true;before=structuredClone({orders,items});return {command:"BEGIN"};}
  if(q==="ROLLBACK"){if(options.rollback)throw fault("08006");if(active)restore();active=false;return {command:"ROLLBACK"};}
  if(q==="COMMIT"){assert.ok(c.execute);if(options.commit)throw fault("40001");active=false;committed=true;if(options.lostCommit)throw fault("08006");return {command:"COMMIT"};}
  assert.ok(active);if(q.startsWith("SET LOCAL"))return rows([]);
  if(q.startsWith("SELECT current_database()"))return rows([{database:options.target?"stitchtrack_product_dev":"stitchtrack_product_test",role:c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:options.timezone?"Africa/Lagos":"UTC",encoding:"UTF8",version:160015,safe:true}]);
  if(q.startsWith('SELECT b."primaryOwnerUserId"'))return rows(options.fixture?[]:[{owner:p[0]===businesses[0]?"owner-a":"owner-b"}]);
  if(q.startsWith('SELECT "id"')&&q.endsWith('FOR UPDATE')){assert.ok(c.execute);return rows([...p[0]].sort().map(id=>({id})));}
  if(q.startsWith("LOCK TABLE")){assert.ok(q.endsWith(c.execute?" IN SHARE ROW EXCLUSIVE MODE":" IN ACCESS SHARE MODE"));if(options.lock)throw fault("55P03");return rows([]);}
  if(q.startsWith("SELECT c.relname AS name"))return rows(allTables.map(name=>({name,kind:"r",owner:c.target.user})));
  if(q.startsWith("SELECT pg_get_userbyid(nspowner)"))return rows([{owner:c.target.user,isolated:!options.publicHistory}]);
  if(q.startsWith("SELECT migration_name"))return rows(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum:options.history?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1})));
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber"')){const ref=inv.references.find(r=>r.id===p[0]),{purpose,...expected}=ref;return rows(options.reference?[]:[expected]);}
  if(q.startsWith("SELECT count(")||q.startsWith("SELECT md5(")){
   const table=q.match(/FROM product\."(\w+)"/u)[1],data=table==="Order"?orders:table==="OrderItem"?items:[];
   const filtered=q.includes('<>ALL')?data.filter(r=>!p[0].includes(r.id)):data;
   const stable={stable:options.baseline&&table==="MeasurementVersion"?"changed":options.counter&&table==="AuthRateBucket"?"changed":table};
   const all=[stable,...filtered];return rows(q.startsWith("SELECT count(")?[{count:all.length}]:[{digest:md5(all)}]);
  }
  if(q.startsWith('SELECT "id","businessId","clientId","createdAt"')){assert.equal(p[0].length,11);return rows(orders.filter(r=>p[0].includes(r.id)).toSorted((a,b)=>a.id<b.id?-1:1));}
  if(q.startsWith('SELECT "id","orderId","clientId",encode')){assert.equal(p[0].length,69);assert.equal(p[1].length,11);return rows(items.filter(r=>p[0].includes(r.id)||p[1].includes(r.orderId)).toSorted((a,b)=>a.id<b.id?-1:1));}
  if(q.startsWith('DELETE FROM product."OrderItem"')){assert.ok(c.execute);assert.equal(p[0].length,11);assert.equal(p[1].length,2);assert.equal(p[2],clients[0]);const n=items.length;items.splice(0,items.length,...items.filter(r=>!(p[0].includes(r.id)&&p[1].includes(r.orderId)&&r.clientId===p[2])));return {rowCount:options.deleteCount?10:n-items.length};}
  if(q.startsWith('DELETE FROM product."Order"')){assert.ok(c.execute);assert.equal(items.length,0);assert.equal(p[0].length,2);assert.equal(p[1],businesses[0]);assert.equal(p[2],clients[0]);const n=orders.length;orders.splice(0,orders.length,...orders.filter(r=>!(p[0].includes(r.id)&&r.businessId===p[1]&&r.clientId===p[2])));return {rowCount:n-orders.length};}
  if(q.startsWith('SELECT 1 FROM product."Order"'))return rows(orders.filter(r=>p[0].includes(r.id)));
  if(q.startsWith('SELECT 1 FROM product."OrderItem"'))return rows(items.filter(r=>p[0].includes(r.id)||p[1].includes(r.orderId)));
  assert.fail("Unexpected SQL in offline double");
 }};
 return {orders,items,initial,calls,saved,reports,get committed(){return committed;},async run(){return runFailedOrderCleanup(c,{db,read:path=>structuredClone(path===c.inventoryPath?inv:record),save:(path,value)=>{assert.equal(path,c.reconciliationPath);if(options.save)throw fault("PRIVATE");saved.push(structuredClone(value));},inspect:async()=>{if(options.metadata)throw fault("PRIVATE");},report:r=>reports.push(r)});}};
}
async function preflight(inv=inventory()){const f=fake(inv),r=await f.run();assert.equal(r.status,"preflight_passed",JSON.stringify(r));return {inv,record:f.saved[0],f,r};}
test("exact run, test migrator, separate paths and independent execution confirmations are mandatory",()=>{
 const inv=inventory();for(const patch of [{PRODUCT_FAILED_ORDER_CLEANUP_CONFIRMED:undefined},{PRODUCT_FAILED_ORDER_CLEANUP_RUN_ID:randomUUID()},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_MIGRATION_CONFIRMED:undefined},{PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY:"relative"},{PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION:env.PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY},{PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION:env.PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY+".result.json"},{NODE_OPTIONS:"unsafe"},{PGOPTIONS:"unsafe"},{PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("_migrator:","_app:")}])assert.throws(()=>config(inv,null,patch));
 assert.throws(()=>config(inv,{},{PRODUCT_FAILED_ORDER_CLEANUP_EXECUTE_CONFIRMED:undefined}));assert.throws(()=>config(inv,{},{PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION_DIGEST:"wrong"}));
});
test("original inventory structure, exact plan and all 11/69 IDs are validated without a success receipt",()=>{
 const inv=inventory(),data=validateFailedOrderInventory(inv,config(inv));assert.equal(data.ids.length,11);assert.equal(data.itemIds.length,69);assert.equal(data.validItemIds.length,11);
 for(const change of [x=>{x.runId=randomUUID();},x=>{x.kind="order_api_write_result";},x=>{x.plan[1].body.items[0].description="changed";},x=>{x.plan[9].body.items[1].id=randomUUID();},x=>{x.migrationChecksums={};},x=>{x.references[0].clientId=clients[0];},x=>{x.baseline[0].digest="wrong";}]){const bad=structuredClone(inv);change(bad);assert.throws(()=>validateFailedOrderInventory(bad,config(inv)));}
});
test("preflight reconciles every planned ID, rolls back, then writes only a separately named cleanup snapshot",async()=>{
 const {f,record,r}=await preflight();assert.deepEqual(f.orders,f.initial.orders);assert.deepEqual(f.items,f.initial.items);assert.ok(f.calls.every(q=>q==="connect"||q==="end"||/^(BEGIN|SET LOCAL|SELECT|LOCK TABLE|ROLLBACK)/u.test(q)));assert.equal(f.calls.filter(q=>q==="ROLLBACK").length,1);
 assert.equal(record.kind,"failed_order_cleanup_reconciliation");assert.equal(record.records.orders.length,2);assert.equal(record.records.items.length,11);assert.equal(record.snapshot.length,17);assert.equal(r.reconciliationDigest,digest(record));assert.equal(record.inventoryDigest,r.inventoryDigest);
});
test("exact separately authorized deletion commits eleven items before two Orders and never touches measurements",async()=>{
 const {inv,record}=await preflight(),f=fake(inv,record),r=await f.run();assert.equal(r.status,"cleaned",JSON.stringify(r));assert.equal(r.commitConfirmed,true);assert.equal(r.deletedOrders,2);assert.equal(r.deletedItems,11);assert.equal(f.orders.length,0);assert.equal(f.items.length,0);
 const deletes=f.calls.filter(q=>q.startsWith("DELETE"));assert.equal(deletes.length,2);assert.match(deletes[0],/OrderItem/u);assert.match(deletes[1],/Order"/u);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);assert.equal(f.saved.length,0);
 const locks=f.calls.filter(q=>q.endsWith("FOR UPDATE"));assert.equal(locks.length,4);for(const [i,table]of ["User","Client","Order","OrderItem"].entries())assert.ok(locks[i].includes('product."'+table+'"'));
});
test("target, timezone, fixtures, locks, history, metadata and measurement baseline failures refuse deletion",async()=>{
 for(const [option,stage]of [["target","identity"],["timezone","identity"],["fixture","fixtures"],["lock","table_locks"],["publicHistory","schema"],["history","migration_history"],["metadata","metadata"],["reference","references"],["baseline","baseline"]]){const f=fake(inventory(),null,{[option]:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(r.stage,stage);assert.equal(f.saved.length,0);assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|password|postgresql:|cookie/u);}
});
test("persisted rejected IDs, unplanned children, missing rows and byte/ownership/reference changes are rejected",async()=>{
 for(const options of [{extraOrder:true},{extraItem:true},{unplannedItem:true},{missingItem:true},{orderChange:{businessId:businesses[1]}},{itemChange:{description_hex:"00"}},{itemChange:{measurementVersionId:versions.wrongClient}},{itemChange:{clientId:clients[1]}},{itemChange:{updatedAt:new Date("2026-11-09T10:00:06.000Z")}}]){const f=fake(inventory(),null,options),r=await f.run();assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(r.stage,options.unplannedItem?"baseline":"contents");assert.equal(f.saved.length,0);}
});
test("changed timestamps and any full-snapshot drift after owner review prevent execution",async()=>{
 const {inv,record}=await preflight();for(const options of [{orderChange:{createdAt:new Date("2026-11-09T10:00:06.000Z"),updatedAt:new Date("2026-11-09T10:00:06.000Z")}},{counter:true}]){const f=fake(inv,record,options),r=await f.run();assert.equal(r.status,"failed_rolled_back");assert.ok(["contents","reconciliation_match"].includes(r.stage));assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);}
 const altered=structuredClone(record);altered.inventoryDigest="0".repeat(64);const f=fake(inv,altered),r=await f.run();assert.equal(r.status,"refused");assert.equal(f.calls.includes("connect"),false);
});
test("mismatched inventory approval digest refuses before connecting",async()=>{
 const {inv,record}=await preflight(),c=config(inv,record);c.inventoryDigest="0".repeat(64);let connected=false;const r=await runFailedOrderCleanup(c,{read:path=>path===c.inventoryPath?inv:record,db:{async connect(){connected=true;},async end(){}}});assert.equal(r.status,"refused");assert.equal(connected,false);
});
test("wrong delete counts roll back and preserve all rows",async()=>{
 const {inv,record}=await preflight(),f=fake(inv,record,{deleteCount:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back");assert.equal(r.stage,"delete_items");assert.deepEqual(f.orders,f.initial.orders);assert.deepEqual(f.items,f.initial.items);assert.equal(f.calls.includes("COMMIT"),false);
});
test("failed or lost COMMIT remains unconfirmed with no retry and no false zero-deletion claim",async()=>{
 for(const option of ["commit","lostCommit"]){const {inv,record}=await preflight(),f=fake(inv,record,{[option]:true}),r=await f.run();assert.equal(r.status,"unconfirmed");assert.equal(r.deletedOrders,null);assert.equal(r.deletedItems,null);assert.equal(r.noAutomaticRetry,true);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);assert.equal(f.calls.filter(q=>q.startsWith('DELETE FROM product."OrderItem"')).length,1);assert.equal(f.committed,option==="lostCommit");}
});
test("rollback, connection cleanup and reconciliation-save failures cannot authorize execution",async()=>{
 for(const option of ["rollback","end","save","connection"]){const f=fake(inventory(),null,{[option]:true}),r=await f.run();assert.notEqual(r.status,"preflight_passed");assert.equal(f.saved.length,0);assert.equal(r.noAutomaticRetry,true);}
});
test("private reconciliation fits the existing secure file reader and cannot overwrite owner evidence",async()=>{
 const {record}=await preflight(),dir=mkdtempSync(join(tmpdir(),"failed-order-cleanup-offline-"));chmodSync(dir,0o700);const path=join(dir,"cleanup-review.json");privateReceipt.write(path,record);assert.deepEqual(privateReceipt.read(path),record);assert.throws(()=>privateReceipt.write(path,record));assert.ok(Buffer.byteLength(JSON.stringify(record))<=65536);
});
test("default inspectors preserve exact dependencies, runtime permissions, UTC options and bounded deletion scope",()=>{
 for(const call of ["await orderSchemaMetadata(db)","await measurementMetadata(db)","await orderApplicationPrivileges(db)"])assert.ok(source.includes(call));
 assert.match(source,/options:PRODUCT_PRISMA_CONNECTION_OPTIONS/u);assert.match(source,/history.length,10/u);assert.match(source,/privateReceipt.write/u);assert.doesNotMatch(source,/CASCADE|GRANT |UPDATE product|DELETE FROM product\."Measurement|fetch\(/u);
 assert.ok(source.includes('inventoryPath+".result.json"'));assert.ok(source.includes('const snapshot')===false);
});
