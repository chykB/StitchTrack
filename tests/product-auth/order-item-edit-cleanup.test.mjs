// Offline only. Synthetic future-run receipts and injected transaction doubles; no live I/O.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,mkdtempSync,chmodSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {orderItemEditPlan} from "./order-api.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {authorizeOrderEditCleanup,validateOrderEditCleanupReceipts,runOrderEditCleanup,reviewedOrderEditCleanupProposal} from "./order-item-edit-cleanup.mjs";
const source=readFileSync(new URL("./order-item-edit-cleanup.mjs",import.meta.url),"utf8"),hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex"),md5=v=>createHash("md5").update(JSON.stringify(v)).digest("hex");
const tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort(),allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const clients=[randomUUID(),randomUUID(),randomUUID()],businesses=["synthetic-a","synthetic-b"],protectedId=randomUUID();
const protectedVersion={id:protectedId,businessId:businesses[0],clientId:clients[0],versionNumber:1,unit:"cm",recordedAt:new Date(0)},protectedEntry={measurementVersionId:protectedId,name:"Preserved browser record",value:"12.50"};
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_ORDER_EDIT_CLEANUP_CONFIRMED:"true",PRODUCT_ORDER_EDIT_CLEANUP_DATABASE:"stitchtrack_product_test",
 PRODUCT_ORDER_EDIT_CLEANUP_INVENTORY:"/private-offline-edit/inventory.json",PRODUCT_ORDER_EDIT_CLEANUP_RESULT:"/private-offline-edit/inventory.json.result.json",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const fault=code=>Object.assign(Error("PRIVATE SQL password URL UUID cookie data"),{code,stack:"PRIVATE"});
function receipts(winner="A"){
 const runId=randomUUID(),base=Date.now()-10000,time=n=>new Date(base+n*100).toISOString(),plan=orderItemEditPlan({clients,duplicateProbe:false});
 const baseline=tables.map(table=>({table,count:1,digest:md5(table==="MeasurementVersion"?[protectedVersion]:table==="MeasurementEntry"?[protectedEntry]:[{stable:table}])}));
 const inventory={format:1,kind:"order_item_edit_proof",runId,createdAt:time(0),database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",businesses,clients,references:[],migrationChecksums:PRODUCT_MIGRATIONS,migrationVerification:"local_manifest_and_prior_owner_tenth_integrity_proof",cleanupProposalDigest:reviewedOrderEditCleanupProposal,baseline,plan,protectedMeasurementId:protectedId,duplicateProbe:false,state:"independent API commits; preserve all IDs and reconcile before any retry or cleanup"};
 const orderId=plan[0].body.id,itemId=plan[0].body.items[0].id,versionId=plan[1].body.id;
 const edit=(stage,n,patch)=>({stage,body:{operation:"update_item",id:orderId,itemId,expectedUpdatedAt:time(n),...patch}});
 const result={format:1,kind:"order_item_edit_result",runId,inventoryCreatedAt:inventory.createdAt,inventoryDigest:hash(inventory),cleanupPerformed:false,
  orders:[{id:orderId,clientId:clients[1],createdAt:time(2),updatedAt:time(2),items:[{id:itemId,description:"Synthetic competing choice "+winner,measurementVersionId:null,createdAt:time(2),updatedAt:time(6)}]}],
  versions:[{id:versionId,clientId:clients[1],versionNumber:1,unit:"cm",recordedAt:time(1),entries:[{name:"Edit proof width",value:"1.25"}]}],
  editTrace:[edit("edit_description",2,{description:"Synthetic edited lining"}),edit("edit_noop",3,{description:"Synthetic edited lining"}),edit("edit_stale",2,{description:"Stale edit must not persist"}),edit("edit_competing",3,{description:"Synthetic competing choice A"}),edit("edit_competing",3,{description:"Synthetic competing choice B"}),edit("edit_selection",4,{measurementVersionId:versionId}),edit("edit_clear",5,{measurementVersionId:null})]};
 return structuredClone({inventory,result});
}
function config(r,execute=false,patch={}){return authorizeOrderEditCleanup([execute?"--owner-order-edit-cleanup-execute":"--owner-order-edit-cleanup-preflight"],{...env,PRODUCT_ORDER_EDIT_CLEANUP_RUN_ID:r.inventory.runId,...(execute?{PRODUCT_ORDER_EDIT_CLEANUP_EXECUTE_CONFIRMED:"true",PRODUCT_ORDER_EDIT_CLEANUP_INVENTORY_DIGEST:hash(r.inventory),PRODUCT_ORDER_EDIT_CLEANUP_RESULT_DIGEST:hash(r.result)}:{}),...patch});}
function fake(r=receipts(),execute=false,options={}){
 const c=config(r,execute),calls=[],reports=[],o=r.result.orders[0],item=o.items[0],v=r.result.versions[0];let active=false,connected=false,before,committed=false;
 const orders=[{id:o.id,businessId:businesses[0],clientId:clients[1],createdAt:new Date(o.createdAt),updatedAt:new Date(o.updatedAt)}],items=[{id:item.id,orderId:o.id,clientId:clients[1],description:item.description,measurementVersionId:item.measurementVersionId,createdAt:new Date(item.createdAt),updatedAt:new Date(item.updatedAt)}];
 const versions=[structuredClone(protectedVersion),{id:v.id,businessId:businesses[0],clientId:clients[1],versionNumber:1,unit:"cm",recordedAt:new Date(v.recordedAt)}],entries=[structuredClone(protectedEntry),{measurementVersionId:v.id,...v.entries[0]}];
 if(options.order)Object.assign(orders[0],options.order);if(options.item)Object.assign(items[0],options.item);if(options.version)Object.assign(versions[1],options.version);if(options.entry)Object.assign(entries[1],options.entry);
 if(options.extraItem)items.push({...items[0],id:randomUUID()});if(options.extraEntry)entries.push({...entries[1],name:"Extra"});if(options.extraHistory)versions.push({...versions[1],id:randomUUID(),versionNumber:2});if(options.protectedChange)entries[0].value="13";if(options.missingItem)items.pop();
 const initial=structuredClone({orders,items,versions,entries}),rows=data=>({rows:data,rowCount:data.length});
 const restore=()=>{for(const [key,array]of Object.entries({orders,items,versions,entries}))array.splice(0,array.length,...structuredClone(before[key]));};
 const db={on(){},async connect(){calls.push("connect");if(options.connection)throw fault("08006");connected=true;},async end(){calls.push("end");if(active){restore();active=false;}connected=false;if(options.end)throw fault("08003");},async query(q,p=[]){
  assert.ok(connected);calls.push(q);
  if(q.startsWith("BEGIN")){assert.equal(active,false);assert.equal(q,execute?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");active=true;before=structuredClone({orders,items,versions,entries});return {command:"BEGIN"};}
  if(q==="ROLLBACK"){if(options.rollback)throw fault("08006");if(active)restore();active=false;return {command:options.rollbackCommand?"UNKNOWN":"ROLLBACK"};}
  if(q==="COMMIT"){assert.ok(execute);if(options.commit)throw fault("40001");active=false;committed=true;if(options.lostCommit)throw fault("08006");return {command:options.commitCommand?"UNKNOWN":"COMMIT"};}
  assert.ok(active);if(q.startsWith("SET LOCAL"))return rows([]);
  if(q.startsWith("SELECT current_database()"))return rows([{database:options.target?"stitchtrack_product_dev":"stitchtrack_product_test",role:c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:options.timezone?"Africa/Lagos":"UTC",encoding:"UTF8",version:160015,safe:true}]);
  if(q.startsWith('SELECT b."primaryOwnerUserId"'))return rows(options.fixture?[]:[{owner:p[0]===businesses[0]?"owner-a":"owner-b"}]);
  if(q.endsWith("FOR UPDATE")){
   assert.ok(execute);if(q.includes('product."User"'))return rows([...p[0]].sort().map(id=>({id})));
   if(q.includes('product."Client"')){assert.deepEqual(p,[clients[1],businesses[0]]);return rows([{id:clients[1]}]);}
   if(q.includes('product."OrderItem"')){assert.deepEqual(p,[item.id,o.id,clients[1]]);return rows([{id:item.id}]);}
   assert.deepEqual(p,[o.id,clients[1],businesses[0]]);return rows([{id:o.id}]);
  }
  if(q.startsWith("LOCK TABLE")){assert.ok(q.endsWith(execute?" IN SHARE ROW EXCLUSIVE MODE":" IN ACCESS SHARE MODE"));if(options.lock)throw fault("55P03");return rows([]);}
  if(q.startsWith("SELECT c.relname AS name"))return rows(allTables.map(name=>({name,kind:"r",owner:c.target.user})));
  if(q.startsWith("SELECT pg_get_userbyid(nspowner)"))return rows([{owner:c.target.user,isolated:!options.publicHistory}]);
  if(q.startsWith("SELECT migration_name"))return rows(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum:options.history?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1})));
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber" FROM'))return rows(options.protectedMissing?[]:[{id:protectedId,businessId:businesses[0],clientId:clients[0],versionNumber:1}]);
  if(q.startsWith("SELECT count(*)::int AS referencing_items")){assert.equal(p[0],v.id);return rows([{referencing_items:options.referenced||items.some(i=>i.measurementVersionId===v.id)?1:0}]);}
  if(q.startsWith("SELECT count(")||q.startsWith("SELECT md5(")){
   const table=q.match(/FROM product\."(\w+)"/u)[1],data=({Order:orders,OrderItem:items,MeasurementVersion:versions,MeasurementEntry:entries})[table]??[];
   const key=table==="MeasurementEntry"?"measurementVersionId":"id",filtered=q.includes('<>ALL')?data.filter(row=>!p[0].includes(row[key])):data;
   const values=table==="MeasurementVersion"||table==="MeasurementEntry"?filtered:[{stable:options.baseline&&table==="Client"?"changed":options.afterChange&&orders.length===0&&table==="AuthRateBucket"?"changed":table},...filtered];
   return rows(q.startsWith("SELECT count(")?[{count:values.length}]:[{digest:md5(values)}]);
  }
  if(q.startsWith('SELECT "id","businessId","clientId","createdAt"'))return rows(orders.filter(row=>row.id===p[0]));
  if(q.startsWith('SELECT "id","orderId","clientId",encode'))return rows(items.filter(row=>row.id===p[0]||row.orderId===p[1]).slice(0,2).map(({description,...row})=>({...row,description_hex:Buffer.from(description,"utf8").toString("hex")})));
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber","unit"'))return rows(versions.filter(row=>row.id===p[0]));
  if(q.startsWith('SELECT "measurementVersionId",encode'))return rows(entries.filter(row=>row.measurementVersionId===p[0]).slice(0,2).map(({name,...row})=>({...row,bytes:Buffer.from(name,"utf8").toString("hex")})));
  if(q.startsWith('SELECT "id" FROM product."MeasurementVersion"'))return rows(versions.filter(row=>row.businessId===p[0]&&row.clientId===p[1]).slice(0,2).map(row=>({id:row.id})));
  if(q.startsWith('DELETE FROM product."OrderItem"')){assert.ok(execute);assert.deepEqual(p,[item.id,o.id,clients[1],businesses[0]]);const n=items.length;items.splice(0,items.length,...items.filter(i=>!(i.id===p[0]&&i.orderId===p[1]&&i.clientId===p[2]&&orders.some(o=>o.id===i.orderId&&o.businessId===p[3]))));return {rowCount:options.deleteCount?0:n-items.length};}
  if(q.startsWith('DELETE FROM product."Order"')){assert.ok(execute);assert.equal(items.length,0);assert.deepEqual(p,[o.id,clients[1],businesses[0]]);const n=orders.length;orders.splice(0,orders.length,...orders.filter(row=>!(row.id===p[0]&&row.clientId===p[1]&&row.businessId===p[2])));return {rowCount:n-orders.length};}
  if(q.startsWith('DELETE FROM product."MeasurementEntry"')){assert.ok(execute);assert.equal(orders.length,0);assert.deepEqual(p,[v.id,clients[1],businesses[0]]);const n=entries.length;entries.splice(0,entries.length,...entries.filter(e=>!(e.measurementVersionId===p[0]&&versions.some(v=>v.id===e.measurementVersionId&&v.clientId===p[1]&&v.businessId===p[2]))));return {rowCount:n-entries.length};}
  if(q.startsWith('DELETE FROM product."MeasurementVersion"')){assert.ok(execute);assert.equal(entries.length,1);assert.deepEqual(p,[v.id,clients[1],businesses[0]]);const n=versions.length;versions.splice(0,versions.length,...versions.filter(row=>!(row.id===p[0]&&row.clientId===p[1]&&row.businessId===p[2])));return {rowCount:n-versions.length};}
  if(q.startsWith('SELECT 1 FROM product."Order"'))return rows(orders.filter(row=>row.id===p[0]));
  if(q.startsWith('SELECT 1 FROM product."OrderItem"'))return rows(items.filter(row=>row.id===p[0]||row.orderId===p[1]));
  if(q.startsWith('SELECT 1 FROM product."MeasurementVersion"'))return rows(versions.filter(row=>row.id===p[0]));
  if(q.startsWith('SELECT 1 FROM product."MeasurementEntry"'))return rows(entries.filter(row=>row.measurementVersionId===p[0]));
  assert.fail("Unexpected offline cleanup SQL");
 }};
 return {r,calls,reports,orders,items,versions,entries,initial,get committed(){return committed;},run:()=>runOrderEditCleanup(c,{db,read:path=>structuredClone(path===c.inventoryPath?r.inventory:r.result),inspect:async()=>{if(options.metadata)throw fault("PRIVATE");},report:value=>reports.push(value)})};
}
test("future actual run ID, database, migrator, private paths and separate execution digests are required",()=>{
 const r=receipts();for(const patch of [{PRODUCT_ORDER_EDIT_CLEANUP_CONFIRMED:undefined},{PRODUCT_ORDER_EDIT_CLEANUP_RUN_ID:undefined},{PRODUCT_ORDER_EDIT_CLEANUP_RUN_ID:"not-uuid"},{PRODUCT_ORDER_EDIT_CLEANUP_DATABASE:"stitchtrack_product_dev"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_MIGRATION_CONFIRMED:undefined},{PRODUCT_ORDER_EDIT_CLEANUP_RESULT:"/different.json"},{PRODUCT_ORDER_EDIT_CLEANUP_INVENTORY:"relative"},{NODE_OPTIONS:"unsafe"},{PGOPTIONS:"unsafe"},{PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('_migrator:','_app:')}])assert.throws(()=>config(r,false,patch));
 for(const patch of [{PRODUCT_ORDER_EDIT_CLEANUP_EXECUTE_CONFIRMED:undefined},{PRODUCT_ORDER_EDIT_CLEANUP_INVENTORY_DIGEST:"wrong"},{PRODUCT_ORDER_EDIT_CLEANUP_RESULT_DIGEST:"wrong"}])assert.throws(()=>config(r,true,patch));
 assert.notEqual(config(receipts()).runId,config(r).runId);
});
test("only the exact successful disabled-probe plan and complete monotonic edit trace are accepted",()=>{
 for(const winner of ["A","B"]){const r=receipts(winner);assert.equal(validateOrderEditCleanupReceipts(r.inventory,r.result,config(r)).result.orders[0].items[0].description,"Synthetic competing choice "+winner);}
 const original=receipts();for(const change of [x=>{x.inventory.kind="order_api_write_proof";},x=>{x.inventory.runId=randomUUID();},x=>{x.inventory.duplicateProbe=true;},x=>{x.inventory.cleanupProposalDigest="0".repeat(64);},x=>{x.inventory.plan.push(x.inventory.plan[0]);},x=>{x.inventory.plan[1].body.id=protectedId;},x=>{x.result.kind="failed";},x=>{x.result.runId=randomUUID();},x=>{x.result.inventoryDigest="0".repeat(64);},x=>{x.result.cleanupPerformed=true;},x=>{x.result.orders.push(x.result.orders[0]);},x=>{x.result.orders[0].items[0].description="Unapproved";},x=>{x.result.orders[0].items[0].measurementVersionId=x.inventory.plan[1].body.id;},x=>{x.result.orders[0].updatedAt=x.result.orders[0].items[0].updatedAt;},x=>{x.result.versions[0].unit="in";},x=>{x.result.editTrace.pop();},x=>{x.result.editTrace[4].body.expectedUpdatedAt=x.result.editTrace[0].body.expectedUpdatedAt;},x=>{x.result.editTrace[5].body.measurementVersionId=protectedId;},x=>{x.result.editTrace[6].body.measurementVersionId=x.inventory.plan[1].body.id;},x=>{x.result.orders[0].items[0].updatedAt=x.result.editTrace[6].body.expectedUpdatedAt;}]){const bad=structuredClone(original);change(bad);assert.throws(()=>validateOrderEditCleanupReceipts(bad.inventory,bad.result,config(original)));}
});
test("reviewed run mismatch or either approval-digest mismatch refuses before connecting",async()=>{
 for(const key of ["runId","inventoryDigest","resultDigest"]){const r=receipts(),c=config(r,true);c[key]=key==="runId"?randomUUID():"0".repeat(64);let connected=false;const result=await runOrderEditCleanup(c,{read:path=>path===c.inventoryPath?r.inventory:r.result,db:{async connect(){connected=true;},async end(){}}});assert.equal(result.status,"refused");assert.equal(result.stage,"receipts");assert.equal(connected,false);}
});
test("preflight is read-only, acknowledges rollback, returns exact four-row counts and digests, and preserves data",async()=>{
 const f=fake(),r=await f.run();assert.equal(r.status,"preflight_passed",JSON.stringify(r));assert.equal(r.runId,f.r.inventory.runId);assert.deepEqual(r.expectedDeletions,{orders:1,items:1,versions:1,entries:1});assert.equal(r.inventoryDigest,hash(f.r.inventory));assert.equal(r.resultDigest,hash(f.r.result));assert.deepEqual({orders:f.orders,items:f.items,versions:f.versions,entries:f.entries},f.initial);assert.equal(f.calls.filter(q=>q==="ROLLBACK").length,1);assert.ok(f.calls.every(q=>q==="connect"||q==="end"||/^(BEGIN|SET LOCAL|SELECT|LOCK TABLE|ROLLBACK)/u.test(q)));
});
test("approved execution deletes item, Order, entry, version exactly once in dependency order and preserves browser history",async()=>{
 const f=fake(receipts(),true),r=await f.run();assert.equal(r.status,"cleaned",JSON.stringify(r));assert.equal(r.commitConfirmed,true);for(const key of ["deletedOrders","deletedItems","deletedVersions","deletedEntries"])assert.equal(r[key],1);
 assert.deepEqual(f.orders,[]);assert.deepEqual(f.items,[]);assert.deepEqual(f.versions,[protectedVersion]);assert.deepEqual(f.entries,[protectedEntry]);
 const deletes=f.calls.filter(q=>q.startsWith("DELETE"));assert.equal(deletes.length,4);for(const [i,table]of ["OrderItem","Order","MeasurementEntry","MeasurementVersion"].entries())assert.ok(deletes[i].startsWith('DELETE FROM product."'+table+'"'));
 const locks=f.calls.filter(q=>q.endsWith("FOR UPDATE"));assert.equal(locks.length,4);for(const [i,table]of ["User","Client","Order","OrderItem"].entries())assert.ok(locks[i].includes('product."'+table+'"'));assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);
});
test("wrong target/timezone/schema/history/metadata/ownership/protected history or references block all deletion",async()=>{
 for(const [option,stage]of [["target","identity"],["timezone","identity"],["publicHistory","schema"],["history","migration_history"],["metadata","metadata"],["fixture","fixtures"],["protectedMissing","protected_version"],["lock","table_locks"],["referenced","unreferenced"],["protectedChange","baseline"],["baseline","baseline"]]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(r.stage,stage);assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|password|postgresql:|cookie/u);}
});
test("changed scoped contents/timestamps, missing/extra items or entries and new history refuse cleanup",async()=>{
 const r=receipts(),later=new Date(Date.parse(r.result.orders[0].items[0].updatedAt)+1);
 for(const [options,stage]of [[{order:{businessId:businesses[1]}},"orders"],[{order:{updatedAt:later}},"orders"],[{item:{description:"Changed"}},"items"],[{item:{updatedAt:later}},"items"],[{item:{createdAt:later}},"items"],[{item:{clientId:clients[0]}},"items"],[{item:{measurementVersionId:r.inventory.plan[1].body.id}},"unreferenced"],[{version:{unit:"in"}},"versions"],[{version:{recordedAt:later}},"versions"],[{entry:{name:"Changed"}},"entries"],[{entry:{value:"1.26"}},"entries"],[{extraItem:true},"baseline"],[{extraEntry:true},"entries"],[{extraHistory:true},"baseline"],[{missingItem:true},"items"]]){const f=fake(r,true,options),result=await f.run();assert.equal(result.status,"failed_rolled_back",JSON.stringify(result));assert.equal(result.stage,stage);assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);}
});
test("wrong deletion counts or post-delete unrelated drift roll back all four records",async()=>{
 for(const [option,stage]of [["deleteCount","delete_item"],["afterChange","snapshot_after"]]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back");assert.equal(r.stage,stage);assert.deepEqual({orders:f.orders,items:f.items,versions:f.versions,entries:f.entries},f.initial);assert.equal(f.calls.includes("COMMIT"),false);}
});
test("failed/lost/unacknowledged COMMIT remains unconfirmed even after rollback, with no automatic repetition",async()=>{
 for(const option of ["commit","lostCommit","commitCommand"]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"unconfirmed");assert.equal(r.noAutomaticRetry,true);for(const key of ["deletedOrders","deletedItems","deletedVersions","deletedEntries"])assert.equal(r[key],null);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);assert.equal(f.calls.filter(q=>q.startsWith("DELETE")).length,4);}
});
test("failed or unacknowledged rollback and connection failures never report preflight success",async()=>{
 for(const option of ["rollback","rollbackCommand","connection","end"]){const f=fake(receipts(),false,{[option]:true}),r=await f.run();assert.notEqual(r.status,"preflight_passed");assert.equal(r.noAutomaticRetry,true);}
 const f=fake(receipts(),true,{end:true}),r=await f.run();assert.equal(r.status,"failed_after_commit");assert.equal(r.commitConfirmed,true);assert.equal(r.deletedOrders,1);
});
test("missing or incomplete future receipts fail before connecting; original private inputs are never written",async()=>{
 const r=receipts();let connected=false;const result=await runOrderEditCleanup(config(r),{read(){throw fault("ENOENT");},db:{async connect(){connected=true;},async end(){}}});assert.equal(result.status,"refused");assert.equal(connected,false);
 const dir=mkdtempSync(join(tmpdir(),"order-edit-cleanup-offline-"));chmodSync(dir,0o700);for(const [name,value]of Object.entries(r)){const path=join(dir,name+".json");privateReceipt.write(path,value);assert.deepEqual(privateReceipt.read(path),value);assert.throws(()=>privateReceipt.write(path,value));}
});
test("source preserves reviewed proposal, UTC/metadata checks, fixed count scope and absence of retries/grants/receipt writes",()=>{
 assert.equal(createHash("sha256").update(readFileSync(new URL('../../prisma/product/setup/order-item-edit-verification.md',import.meta.url))).digest('hex'),reviewedOrderEditCleanupProposal);
 for(const call of ["await orderSchemaMetadata(db)","await measurementMetadata(db)","await orderApplicationPrivileges(db)","options:PRODUCT_PRISMA_CONNECTION_OPTIONS"])assert.ok(source.includes(call));
 assert.doesNotMatch(source,/fetch\(|privateReceipt\.write|CASCADE|GRANT |UPDATE product|DELETE FROM product\."(?:User|Client|Business)/u);assert.match(source,/history.length,10/u);
});
