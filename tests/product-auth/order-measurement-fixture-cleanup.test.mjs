// Offline only: synthetic receipts and an injected SQL state machine. No owner files or network.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,mkdtempSync,chmodSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {orderMeasurementFixturePlan,orderMeasurementFixtureCleanupDigest,orderApiPlan,orderCleanupProposalDigest} from "./order-api.integration.mjs";
import {failedOrderRun} from "./order-failed-run-cleanup.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {orderFixtureRun,authorizeOrderFixtureCleanup,validateOrderFixtureReceipts,runOrderFixtureCleanup} from "./order-measurement-fixture-cleanup.mjs";
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex"),md5=v=>createHash("md5").update(JSON.stringify(v)).digest("hex");
const source=readFileSync(new URL("./order-measurement-fixture-cleanup.mjs",import.meta.url),"utf8");
const tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort(),allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const clients=[randomUUID(),randomUUID(),randomUUID()],businesses=["synthetic-a","synthetic-b"],protectedId=randomUUID(),stamp="2026-11-09T09:00:05.000Z";
const protectedVersion={id:protectedId,businessId:businesses[0],clientId:clients[0],versionNumber:1,unit:"cm",recordedAt:new Date("2026-11-09T08:00:00.000Z")};
const protectedEntry={measurementVersionId:protectedId,name:"Preserved browser record",value:"12.50"};
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_ORDER_FIXTURE_CLEANUP_CONFIRMED:"true",PRODUCT_ORDER_FIXTURE_CLEANUP_RUN_ID:orderFixtureRun,
 PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY:"/private-offline-fixtures/original.json",PRODUCT_ORDER_FIXTURE_CLEANUP_RESULT:"/private-offline-fixtures/original.json.result.json",PRODUCT_ORDER_FIXTURE_CLEANUP_ORDERS_INVENTORY:"/private-offline-fixtures/orders.json",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const fault=code=>Object.assign(Error("PRIVATE URL password UUID cookie SQL data"),{code,stack:"PRIVATE"});
function receipts(){
 const plan=orderMeasurementFixturePlan({clients}),baseline=tables.map(table=>({table,count:1,digest:md5(table==="MeasurementVersion"?[protectedVersion]:table==="MeasurementEntry"?[protectedEntry]:[{stable:table}])}));
 const inventory={format:1,kind:"order_measurement_fixtures",runId:orderFixtureRun,createdAt:"2026-11-09T09:00:00.000Z",database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",businesses,clients,references:[],migrationChecksums:PRODUCT_MIGRATIONS,migrationVerification:"local_manifest_and_prior_owner_tenth_integrity_proof",cleanupProposalDigest:orderMeasurementFixtureCleanupDigest(),baseline,plan,protectedMeasurementId:protectedId,state:"independent API commits; preserve all IDs and reconcile before any retry or cleanup"};
 const result={format:1,kind:"order_measurement_fixture_result",runId:orderFixtureRun,inventoryCreatedAt:inventory.createdAt,inventoryDigest:hash(inventory),versions:plan.map(p=>({id:p.body.id,clientId:p.body.clientId,versionNumber:1,unit:"cm",recordedAt:stamp,entries:p.body.entries})),cleanupPerformed:false};
 const versions=result.versions.map(v=>({id:v.id,businessId:businesses[plan.find(p=>p.body.id===v.id).actor],clientId:v.clientId,versionNumber:1,unit:"cm",recordedAt:new Date(stamp)})),entries=result.versions.map(v=>({measurementVersionId:v.id,...v.entries[0]}));
 const orders={format:1,kind:"order_api_write_proof",runId:failedOrderRun,createdAt:"2026-11-09T10:00:00.000Z",database:inventory.database,role:inventory.role,businesses,clients,
 references:plan.map((p,i)=>({purpose:i===0?"wrongClient":"wrongBusiness",id:p.body.id,businessId:businesses[i],clientId:clients[i+1],versionNumber:1})),migrationChecksums:PRODUCT_MIGRATIONS,migrationVerification:inventory.migrationVerification,cleanupProposalDigest:orderCleanupProposalDigest(),
 baseline:baseline.map(row=>row.table==="MeasurementVersion"?{table:row.table,count:3,digest:md5([protectedVersion,...versions])}:row.table==="MeasurementEntry"?{table:row.table,count:3,digest:md5([protectedEntry,...entries])}:row),plan:orderApiPlan({clients,versions:{valid:null,wrongClient:plan[0].body.id,wrongBusiness:plan[1].body.id}}),state:inventory.state};
 return structuredClone({inventory,result,orders});
}
function config(r,execute=false,patch={}){return authorizeOrderFixtureCleanup([execute?"--owner-order-fixture-cleanup-execute":"--owner-order-fixture-cleanup-preflight"],{...env,...(execute?{PRODUCT_ORDER_FIXTURE_CLEANUP_EXECUTE_CONFIRMED:"true",PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY_DIGEST:hash(r.inventory),PRODUCT_ORDER_FIXTURE_CLEANUP_RESULT_DIGEST:hash(r.result),PRODUCT_ORDER_FIXTURE_CLEANUP_ORDERS_INVENTORY_DIGEST:hash(r.orders)}:{}),...patch});}
function fake(r=receipts(),execute=false,options={}){
 const c=config(r,execute),calls=[],reports=[],p=r.inventory.plan,versions=[structuredClone(protectedVersion),...r.result.versions.map(v=>({id:v.id,businessId:businesses[p.find(p=>p.body.id===v.id).actor],clientId:v.clientId,versionNumber:v.versionNumber,unit:v.unit,recordedAt:new Date(v.recordedAt)}))],entries=[structuredClone(protectedEntry),...r.result.versions.map(v=>({measurementVersionId:v.id,...v.entries[0]}))];
 let active=false,connected=false,before,committed=false;
 if(options.version)Object.assign(versions[1],options.version);if(options.entry)Object.assign(entries[1],options.entry);if(options.missing)versions.pop();if(options.extraEntry)entries.push({...entries[1],name:"Unexpected label"});
 if(options.extraHistory)versions.push({...versions[1],id:randomUUID(),versionNumber:2});if(options.protectedChange)entries[0].value="13";
 const initial=structuredClone({versions,entries}),rows=data=>({rows:data,rowCount:data.length}),restore=()=>{versions.splice(0,versions.length,...structuredClone(before.versions));entries.splice(0,entries.length,...structuredClone(before.entries));};
 const db={on(){},async connect(){calls.push("connect");if(options.connection)throw fault("08006");connected=true;},async end(){calls.push("end");if(active){restore();active=false;}connected=false;if(options.end)throw fault("08003");},async query(q,params=[]){
  assert.ok(connected);calls.push(q);
  if(q.startsWith("BEGIN")){assert.equal(active,false);assert.equal(q,execute?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");active=true;before=structuredClone({versions,entries});return {command:"BEGIN"};}
  if(q==="ROLLBACK"){if(options.rollback)throw fault("08006");if(active)restore();active=false;return {command:"ROLLBACK"};}
  if(q==="COMMIT"){assert.ok(execute);if(options.commit)throw fault("40001");active=false;committed=true;if(options.lostCommit)throw fault("08006");return {command:"COMMIT"};}
  assert.ok(active);if(q.startsWith("SET LOCAL"))return rows([]);
  if(q.startsWith("SELECT current_database()"))return rows([{database:options.target?"stitchtrack_product_dev":"stitchtrack_product_test",role:c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:options.timezone?"Africa/Lagos":"UTC",encoding:"UTF8",version:160015,safe:true}]);
  if(q.startsWith('SELECT b."primaryOwnerUserId"')){assert.ok([clients[1],clients[2]].includes(params[1]));return rows(options.fixture?[]:[{owner:params[0]===businesses[0]?"owner-a":"owner-b"}]);}
  if(q.endsWith("FOR UPDATE")){assert.ok(execute);assert.ok(q.includes('product."User"')||q.includes('product."Client"'));if(q.includes('product."Client"'))assert.deepEqual(params[0],clients.slice(1));return rows([...params[0]].sort().map(id=>({id})));}
  if(q.startsWith("LOCK TABLE")){assert.ok(q.endsWith(execute?" IN SHARE ROW EXCLUSIVE MODE":" IN ACCESS SHARE MODE"));if(options.lock)throw fault("55P03");return rows([]);}
  if(q.startsWith("SELECT c.relname AS name"))return rows(allTables.map(name=>({name,kind:"r",owner:c.target.user})));
  if(q.startsWith("SELECT pg_get_userbyid(nspowner)"))return rows([{owner:c.target.user,isolated:!options.publicHistory}]);
  if(q.startsWith("SELECT migration_name"))return rows(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum:options.history?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1})));
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber" FROM')){const v=versions.find(v=>v.id===params[0]);return rows(options.protectedMissing||!v?[]:[{id:v.id,businessId:v.businessId,clientId:v.clientId,versionNumber:v.versionNumber}]);}
  if(q.startsWith('SELECT 1 FROM product."Order"')){assert.equal(params[0].length,11);return rows(options.remainingOrder?[{}]:[]);}
  if(q.startsWith('SELECT 1 FROM product."OrderItem"')){assert.equal(params[0].length,69);assert.equal(params[1].length,11);return rows(options.remainingItem?[{}]:[]);}
  if(q.startsWith("SELECT count(*)::int AS referencing_items")){assert.deepEqual(params[0],p.map(p=>p.body.id));return rows([{referencing_items:options.referenced?1:0}]);}
  if(q.startsWith("SELECT count(")||q.startsWith("SELECT md5(")){
   const table=q.match(/FROM product\."(\w+)"/u)[1],data=table==="MeasurementVersion"?versions:table==="MeasurementEntry"?entries:[{stable:options.baseline&&table==="Client"?"changed":options.afterChange&&versions.length===1&&table==="AuthRateBucket"?"changed":table}];
   const key=table==="MeasurementEntry"?"measurementVersionId":"id",filtered=q.includes('<>ALL')?data.filter(v=>!params[0].includes(v[key])):data;
   return rows(q.startsWith("SELECT count(")?[{count:filtered.length}]:[{digest:md5(filtered)}]);
  }
  if(q.startsWith('SELECT "id","businessId","clientId","versionNumber","unit"'))return rows(versions.filter(v=>params[0].includes(v.id)));
  if(q.startsWith('SELECT "measurementVersionId",encode'))return rows(entries.filter(e=>params[0].includes(e.measurementVersionId)).slice(0,3).map(e=>({measurementVersionId:e.measurementVersionId,bytes:Buffer.from(e.name,"utf8").toString("hex"),value:e.value})));
  if(q.startsWith('SELECT "id" FROM product."MeasurementVersion"'))return rows(versions.filter(v=>v.businessId===params[0]&&v.clientId===params[1]).map(v=>({id:v.id})).concat(options.historyMismatch?[{id:randomUUID()}]:[]));
  if(q.startsWith("WITH approved")){
   assert.ok(execute);assert.deepEqual(params,p.flatMap(p=>[p.body.id,businesses[p.actor],p.body.clientId]));
   if(q.includes('DELETE FROM product."MeasurementEntry"')){const n=entries.length;entries.splice(0,entries.length,...entries.filter(e=>!p.some(p=>p.body.id===e.measurementVersionId&&versions.some(v=>v.id===p.body.id&&v.businessId===businesses[p.actor]&&v.clientId===p.body.clientId))));return {rowCount:options.deleteCount?1:n-entries.length};}
   assert.ok(q.includes('DELETE FROM product."MeasurementVersion"'));assert.equal(entries.length,1);const n=versions.length;versions.splice(0,versions.length,...versions.filter(v=>!p.some(p=>p.body.id===v.id&&v.businessId===businesses[p.actor]&&v.clientId===p.body.clientId)));return {rowCount:n-versions.length};
  }
  if(q.startsWith('SELECT 1 FROM product."MeasurementVersion"'))return rows(versions.filter(v=>params[0].includes(v.id)));
  if(q.startsWith('SELECT 1 FROM product."MeasurementEntry"'))return rows(entries.filter(e=>params[0].includes(e.measurementVersionId)));
  assert.fail("Unexpected SQL in offline double");
 }};
 return {r,versions,entries,initial,calls,reports,get committed(){return committed;},async run(){return runOrderFixtureCleanup(c,{db,read:path=>structuredClone(path===c.inventoryPath?r.inventory:path===c.resultPath?r.result:r.orders),inspect:async()=>{if(options.metadata)throw fault("PRIVATE");},report:value=>reports.push(value)});}};
}
test("exact run, private paths, test migrator and independent execution digests are required",()=>{
 const r=receipts();for(const patch of [{PRODUCT_ORDER_FIXTURE_CLEANUP_CONFIRMED:undefined},{PRODUCT_ORDER_FIXTURE_CLEANUP_RUN_ID:randomUUID()},{PRODUCT_MIGRATION_CONFIRMED:undefined},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY:"relative"},{PRODUCT_ORDER_FIXTURE_CLEANUP_RESULT:"/different/result.json"},{PRODUCT_ORDER_FIXTURE_CLEANUP_ORDERS_INVENTORY:env.PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY},{NODE_OPTIONS:"unsafe"},{PGOPTIONS:"unsafe"},{PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('_migrator:','_app:')}])assert.throws(()=>config(r,false,patch));
 for(const patch of [{PRODUCT_ORDER_FIXTURE_CLEANUP_EXECUTE_CONFIRMED:undefined},{PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY_DIGEST:"wrong"},{PRODUCT_ORDER_FIXTURE_CLEANUP_RESULT_DIGEST:"wrong"},{PRODUCT_ORDER_FIXTURE_CLEANUP_ORDERS_INVENTORY_DIGEST:"wrong"}])assert.throws(()=>config(r,true,patch));
});
test("both receipt identities, original plan, protected exclusion, digest and Orders fixture relationships are exact",()=>{
 const r=receipts();assert.equal(validateOrderFixtureReceipts(r.inventory,r.result,r.orders,config(r)).ids.length,2);
 for(const change of [x=>{x.inventory.runId=randomUUID();},x=>{x.inventory.plan[0].body.id=protectedId;},x=>{x.inventory.cleanupProposalDigest="0".repeat(64);},x=>{x.result.runId=randomUUID();},x=>{x.result.inventoryDigest="0".repeat(64);},x=>{x.result.versions[0].versionNumber=2;},x=>{x.result.versions[0].entries[0].name="Changed";},x=>{x.result.versions[0].entries[0].value="1.26";},x=>{x.orders.runId=randomUUID();},x=>{x.orders.references[0].id=randomUUID();}]){const bad=structuredClone(r);change(bad);assert.throws(()=>validateOrderFixtureReceipts(bad.inventory,bad.result,bad.orders,config(r)));}
});
test("preflight uses only read-only SQL and an acknowledged rollback, returns three review digests, and writes no files",async()=>{
 const f=fake(),r=await f.run();assert.equal(r.status,"preflight_passed",JSON.stringify(r));assert.deepEqual(r.expectedDeletions,{versions:2,entries:2});assert.equal(r.inventoryDigest,hash(f.r.inventory));assert.equal(r.resultDigest,hash(f.r.result));assert.equal(r.ordersInventoryDigest,hash(f.r.orders));assert.deepEqual(f.versions,f.initial.versions);assert.deepEqual(f.entries,f.initial.entries);assert.equal(f.calls.filter(q=>q==="ROLLBACK").length,1);assert.ok(f.calls.every(q=>q==="connect"||q==="end"||/^(BEGIN|SET LOCAL|SELECT|LOCK TABLE|ROLLBACK)/u.test(q)));
});
test("execution deletes exactly two entries before two versions, preserving browser history and every unrelated table",async()=>{
 const f=fake(receipts(),true),r=await f.run();assert.equal(r.status,"cleaned",JSON.stringify(r));assert.equal(r.commitConfirmed,true);assert.equal(r.deletedVersions,2);assert.equal(r.deletedEntries,2);assert.deepEqual(f.versions,[protectedVersion]);assert.deepEqual(f.entries,[protectedEntry]);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);
 const deletions=f.calls.filter(q=>q.startsWith("WITH approved"));assert.equal(deletions.length,2);assert.ok(deletions[0].includes('DELETE FROM product."MeasurementEntry"'));assert.ok(deletions[1].includes('DELETE FROM product."MeasurementVersion"'));
 const locks=f.calls.filter(q=>q.endsWith("FOR UPDATE"));assert.equal(locks.length,2);assert.ok(locks[0].includes('product."User"'));assert.ok(locks[1].includes('product."Client"'));
});
test("remaining planned Orders/items and ANY referencing OrderItem block cleanup",async()=>{
 for(const [option,stage]of [["remainingOrder","orders_absent"],["remainingItem","orders_absent"],["referenced","unreferenced"]]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back");assert.equal(r.stage,stage);assert.equal(f.calls.some(q=>q.startsWith("WITH approved")),false);assert.deepEqual(f.versions,f.initial.versions);}
});
test("wrong target, timezone, schema, history, privileges/dependencies and protected version fail closed",async()=>{
 for(const [option,stage]of [["target","identity"],["timezone","identity"],["publicHistory","schema"],["history","migration_history"],["metadata","metadata"],["fixture","fixtures"],["protectedMissing","protected_version"],["lock","table_locks"]]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(r.stage,stage);assert.equal(f.calls.some(q=>q.startsWith("WITH approved")),false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|password|postgresql:|cookie/u);}
});
test("changed timestamps, ownership, unit, version, label bytes, decimals, missing/extra records and new history refuse",async()=>{
 for(const [options,stage]of [[{version:{recordedAt:new Date("2026-11-09T09:00:06.000Z")}},"baseline"],[{version:{businessId:businesses[1]}},"baseline"],[{version:{unit:"in"}},"baseline"],[{version:{versionNumber:2}},"baseline"],[{entry:{name:"Changed"}},"baseline"],[{entry:{value:"1.26"}},"baseline"],[{missing:true},"baseline"],[{extraEntry:true},"baseline"],[{extraHistory:true},"baseline"],[{protectedChange:true},"baseline"],[{historyMismatch:true},"history"],[{baseline:true},"baseline"]]){const f=fake(receipts(),true,options),r=await f.run();assert.equal(r.status,"failed_rolled_back",JSON.stringify(r));assert.equal(r.stage,stage);assert.equal(f.calls.some(q=>q.startsWith("WITH approved")),false);}
});
test("each reviewed digest is checked before any connection",async()=>{
 for(const key of ["inventoryDigest","resultDigest","ordersInventoryDigest"]){const r=receipts(),c=config(r,true);c[key]="0".repeat(64);let connected=false;const result=await runOrderFixtureCleanup(c,{read:path=>path===c.inventoryPath?r.inventory:path===c.resultPath?r.result:r.orders,db:{async connect(){connected=true;},async end(){}}});assert.equal(result.status,"refused");assert.equal(connected,false);}
});
test("unexpected deletion counts and unrelated post-delete drift roll back every synthetic row",async()=>{
 for(const [option,stage]of [["deleteCount","delete_entries"],["afterChange","snapshot_after"]]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"failed_rolled_back");assert.equal(r.stage,stage);assert.deepEqual(f.versions,f.initial.versions);assert.deepEqual(f.entries,f.initial.entries);assert.equal(f.calls.includes("COMMIT"),false);}
});
test("failed/lost COMMIT is unconfirmed, preserves conservative counts and never repeats deletion",async()=>{
 for(const option of ["commit","lostCommit"]){const f=fake(receipts(),true,{[option]:true}),r=await f.run();assert.equal(r.status,"unconfirmed");assert.equal(r.deletedVersions,null);assert.equal(r.deletedEntries,null);assert.equal(r.noAutomaticRetry,true);assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);assert.equal(f.calls.filter(q=>q.startsWith("WITH approved")).length,2);assert.equal(f.committed,option==="lostCommit");}
});
test("rollback/connection failures never report successful preflight and close failure after COMMIT retains confirmed counts",async()=>{
 for(const option of ["rollback","connection","end"]){const f=fake(receipts(),false,{[option]:true}),r=await f.run();assert.notEqual(r.status,"preflight_passed");assert.equal(r.noAutomaticRetry,true);}
 const f=fake(receipts(),true,{end:true}),r=await f.run();assert.equal(r.status,"failed_after_commit");assert.equal(r.commitConfirmed,true);assert.equal(r.deletedVersions,2);assert.equal(r.deletedEntries,2);
});
test("existing secure receipt reader accepts synthetic inputs without modifying them; missing receipts refuse before connection",async()=>{
 const r=receipts(),dir=mkdtempSync(join(tmpdir(),"order-fixture-cleanup-offline-"));chmodSync(dir,0o700);
 for(const [name,value]of Object.entries(r)){const path=join(dir,name+".json");privateReceipt.write(path,value);assert.deepEqual(privateReceipt.read(path),value);assert.throws(()=>privateReceipt.write(path,value));}
 let connected=false;const result=await runOrderFixtureCleanup(config(r),{read(){throw fault("ENOENT");},db:{async connect(){connected=true;},async end(){}}});assert.equal(result.status,"refused");assert.equal(connected,false);
});
test("source reuses exact metadata/privilege/receipt guards and has no network, receipt-writing or permission-change path",()=>{
 for(const call of ["await orderSchemaMetadata(db)","await measurementMetadata(db)","await orderApplicationPrivileges(db)","validateFailedOrderInventory(ordersInventory", "options:PRODUCT_PRISMA_CONNECTION_OPTIONS"])assert.ok(source.includes(call));
 assert.doesNotMatch(source,/fetch\(|privateReceipt\.write|CASCADE|GRANT |UPDATE product|DELETE FROM product\."(?:Order|Client|Business)/u);assert.match(source,/history.length,10/u);
});
