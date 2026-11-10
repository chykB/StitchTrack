// Offline only: synthetic receipts and a SQL state-machine double. No PostgreSQL or HTTP.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,mkdtempSync,chmodSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {measurementApiPlan,measurementApiSnapshotTables as tables} from "./measurement-api.integration.mjs";
import {measurementCleanupRun,authorizeMeasurementCleanup,validateMeasurementCleanupReceipts,runMeasurementCleanup} from "./measurement-api-cleanup.mjs";
const source=readFileSync(new URL("./measurement-api-cleanup.mjs",import.meta.url),"utf8");
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const md5=value=>createHash("md5").update(JSON.stringify(value)).digest("hex");
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_MEASUREMENT_CLEANUP_CONFIRMED:"true",
 PRODUCT_MEASUREMENT_CLEANUP_RUN_ID:measurementCleanupRun,PRODUCT_MEASUREMENT_CLEANUP_INVENTORY:"/private-offline/inventory.json",PRODUCT_MEASUREMENT_CLEANUP_RESULT:"/private-offline/inventory.json.result.json",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const fault=code=>Object.assign(Error("PRIVATE password URL UUID label SQL receipt path"),{code,stack:"PRIVATE"});
const clients=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"],businesses=["synthetic-a","synthetic-b"];
const allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
function receipts(){
 const plan=measurementApiPlan(clients[0],0),createdAt="2026-11-08T12:00:00.000Z";
 const baseline=tables.map(table=>({table,count:table.startsWith("Measurement")?0:1,digest:md5(table.startsWith("Measurement")?[]:[{table,stable:true}])}));
 const inventory={format:1,kind:"measurement_api_write_proof",runId:measurementCleanupRun,createdAt,database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",
  businesses,clients,migrationChecksums:PRODUCT_MIGRATIONS,baselineMaximum:0,baseline,plan,state:"planned; API transactions commit independently; reconcile every inventoried ID before any rerun or cleanup"};
 const result={format:1,kind:"measurement_api_write_result",runId:measurementCleanupRun,inventoryCreatedAt:createdAt,
  versions:plan.slice(0,3).map((p,i)=>({id:p.body.id,clientId:clients[0],versionNumber:i+1,unit:p.body.unit,recordedAt:createdAt,entries:p.body.entries})),cleanupPerformed:false};
 return {inventory:structuredClone(inventory),result:structuredClone(result)};
}
function config(r,execute=false,patch={}){return authorizeMeasurementCleanup([execute?"--owner-measurement-cleanup-execute":"--owner-measurement-cleanup-preflight"],{...env,...(execute?{
 PRODUCT_MEASUREMENT_CLEANUP_EXECUTE_CONFIRMED:"true",PRODUCT_MEASUREMENT_CLEANUP_INVENTORY_DIGEST:digest(r.inventory),PRODUCT_MEASUREMENT_CLEANUP_RESULT_DIGEST:digest(r.result)}:{}),...patch});}
function fake(r,execute=false,options={}){
 const c=config(r,execute),calls=[],paramsSeen=[],versions=r.result.versions.map(v=>({id:v.id,businessId:businesses[0],clientId:v.clientId,versionNumber:v.versionNumber,unit:v.unit,recordedAt:new Date(v.recordedAt)})),entries=r.result.versions.flatMap(v=>v.entries.map(e=>({measurementVersionId:v.id,...e})));
 const original={versions:structuredClone(versions),entries:structuredClone(entries)};let before,active=false,connected=false,committed=false,deleted=false;
 if(options.changedVersion)Object.assign(versions[0],options.changedVersion);
 if(options.changedEntry)Object.assign(entries.find(e=>e.name.includes("\u0301")),options.changedEntry);
 if(options.invalidPersisted)versions.push({id:r.inventory.plan[3].body.id,businessId:businesses[0],clientId:clients[0],versionNumber:4,unit:"cm",recordedAt:new Date()});
 if(options.newHistory)versions.push({id:randomUUID(),businessId:businesses[0],clientId:clients[0],versionNumber:4,unit:"cm",recordedAt:new Date()});
 const initial={versions:structuredClone(versions),entries:structuredClone(entries)};
 const rows=data=>({rows:data,rowCount:data.length});
 const restore=()=>{versions.splice(0,versions.length,...structuredClone(before.versions));entries.splice(0,entries.length,...structuredClone(before.entries));};
 const db={async connect(){calls.push("connect");connected=true;if(options.connect)throw fault("08006");},on(){},async end(){calls.push("end");if(active){restore();active=false;}connected=false;if(options.cleanup)throw fault("08003");},
  async query(sql,params=[]){
   assert.ok(connected);calls.push(sql);paramsSeen.push({sql,params:structuredClone(params)});
   if(sql.startsWith("BEGIN")){assert.equal(active,false);before={versions:structuredClone(versions),entries:structuredClone(entries)};active=true;return {command:"BEGIN"};}
   if(sql==="ROLLBACK"){if(options.rollback)throw fault("08006");if(active)restore();active=false;return {command:"ROLLBACK"};}
   if(sql==="COMMIT"){assert.equal(execute,true);if(options.commitFailure)throw fault("40001");active=false;committed=true;if(options.commitLost)throw fault("08006");return {command:"COMMIT"};}
   assert.ok(active);if(sql.startsWith("SET LOCAL"))return rows([]);
   if(sql.startsWith("LOCK TABLE")){if(options.lock)throw fault("55P03");assert.ok(sql.endsWith(execute?" IN SHARE ROW EXCLUSIVE MODE":" IN ACCESS SHARE MODE"));return rows([]);}
   if(sql.startsWith("SELECT current_database()"))return rows([{database:options.wrongTarget?"stitchtrack_product_dev":"stitchtrack_product_test",role:c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",version:160015,safe:true}]);
   if(sql.startsWith('SELECT b."primaryOwnerUserId"'))return rows(options.fixture?[]:[{owner:params[0]===businesses[0]?"owner-a":"owner-b"}]);
   if(sql.startsWith('SELECT "id" FROM product."User"')){assert.equal(execute,true);return rows(params[0].map(id=>({id})));}
   if(sql.startsWith('SELECT "id" FROM product."Client"')){assert.equal(execute,true);assert.ok(calls.some(q=>q.includes('FROM product."User"')&&q.includes("FOR UPDATE")));return rows(params[0].map(id=>({id})));}
   if(sql.startsWith("SELECT c.relname AS name,c.relkind"))return rows(allTables.map(name=>({name,kind:"r",owner:c.target.user})));
   if(sql.startsWith("SELECT pg_get_userbyid(nspowner)"))return rows([{owner:c.target.user,isolated:true}]);
   if(sql.startsWith("SELECT migration_name"))return rows(Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum:options.history?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1})));
   if(sql.startsWith("SELECT c.relname AS table_name"))return rows([
    ...[["measurementVersionId","uuid"],["name","text"],["value","numeric"]].map(([name,type])=>({table_name:"MeasurementEntry",name,type,required:true})),
    ...[["id","uuid"],["businessId","text"],["clientId","uuid"],["versionNumber","integer"],["unit","text"],["recordedAt","timestamp(3) with time zone"]].map(([name,type])=>({table_name:"MeasurementVersion",name,type,required:true}))]);
   if(sql.startsWith("SELECT a.attcollation"))return rows([{default_label_collation:true}]);
   if(sql.includes("FROM pg_trigger"))return rows([{count:options.trigger?1:0}]);
   if(sql.startsWith("SELECT convalidated"))return rows([{valid:true,deferred:false,deletion:"r",update:"r",parent:true,child_keys:params[1].startsWith("MeasurementVersion")?[2,3]:[1],parent_keys:params[1].startsWith("MeasurementVersion")?[2,1]:[1]}]);
   if(sql.startsWith("SELECT c.relname AS name,i.indisunique"))return rows(Object.entries({Client_businessId_id_key:["businessId","id"],MeasurementVersion_pkey:["id"],MeasurementVersion_clientId_versionNumber_key:["clientId","versionNumber"],MeasurementEntry_pkey:["measurementVersionId","name"],MeasurementEntry_version_label_key:["measurementVersionId","name"]}).map(([name,keys])=>({name,keys,unique:true,valid:true,ready:true,unconditional:true,label_collation:true,key_count:keys.length,total_count:keys.length,
    target:'product."'+(name.startsWith("Client_")?"Client":name.startsWith("MeasurementVersion_")?"MeasurementVersion":"MeasurementEntry")+'"',expression:null,
    definition:'CREATE UNIQUE INDEX "MeasurementEntry_version_label_key" ON product."MeasurementEntry" USING btree ("measurementVersionId", name COLLATE product.measurement_label_ci)'})));
   if(sql.startsWith("SELECT pg_get_userbyid(c.collowner)"))return rows([{owner:c.target.user,provider:"i",deterministic:false,no_rules:true,all_encodings:true,locale:"und-u-kk-ks-level2",recorded:"same",actual:options.stale?"other":"same"}]);
   if(sql.startsWith("SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_depend"))return rows([{linked:true}]);
   if(sql.startsWith("SELECT NOT (rolsuper"))return rows([{safe:true,restricted_schema:true}]);
   if(sql.startsWith("SELECT has_table_privilege"))return rows([{readable:true,insertable:true,forbidden:!!options.grants}]);
   if(sql.startsWith("SELECT child_ns")){
    const result=[{child_schema:"product",child:"MeasurementEntry",name:"MeasurementEntry_measurementVersionId_fkey",parent_schema:"product",parent:"MeasurementVersion",valid:true,deferred:false,deletion:"r",update:"r",child_keys:[1],parent_keys:[1]},
     {child_schema:"product",child:"MeasurementVersion",name:"MeasurementVersion_businessId_clientId_fkey",parent_schema:"product",parent:"Client",valid:true,deferred:false,deletion:"r",update:"r",child_keys:[2,3],parent_keys:[2,1]}];
    if(options.dependency)result.push({...result[0],child_schema:"other",child:"Agreement"});if(options.cascade)result[0].deletion="c";return rows(result);
   }
   if(sql.includes("FROM pg_rewrite"))return rows([{count:options.rule?1:0}]);
   if(sql.startsWith("SELECT count(*)")||sql.startsWith("SELECT md5(")){
    const table=sql.match(/FROM product\."(\w+)"/u)[1];let data=table==="MeasurementVersion"?versions:table==="MeasurementEntry"?entries:[{table,stable:true}];
    if(params.length)data=data.filter(row=>!params[0].includes(table==="MeasurementVersion"?row.id:row.measurementVersionId));
    if(options.baseline&&table==="Client"||options.afterChanged&&deleted&&table==="AuthRateBucket")data=[{changed:true}];
    return rows(sql.startsWith("SELECT count(*)")?[{count:data.length}]:[{digest:md5(data)}]);
   }
   if(sql.startsWith('SELECT "id","businessId","clientId"'))return rows(versions.filter(v=>params[0].includes(v.id)));
   if(sql.startsWith('SELECT "measurementVersionId",encode'))return rows(entries.filter(e=>params[0].includes(e.measurementVersionId)).slice(0,8).map(e=>({measurementVersionId:e.measurementVersionId,bytes:Buffer.from(e.name).toString("hex"),value:e.value})));
   if(sql.startsWith('SELECT "id" FROM product."MeasurementVersion"'))return rows(versions.filter(v=>v.businessId===params[0]&&v.clientId===params[1]&&v.versionNumber>params[2]).map(v=>({id:v.id})));
   if(sql.startsWith('SELECT 1 FROM product.'))return rows((sql.includes('"MeasurementVersion"')?versions:entries).filter(v=>params[0].includes(v.id??v.measurementVersionId)).map(()=>({})));
   if(sql.startsWith("DELETE FROM")){
    assert.equal(execute,true);assert.deepEqual(params,[r.inventory.plan.slice(0,3).map(p=>p.body.id),businesses[0],clients[0]]);assert.ok(calls.some(q=>q.endsWith(" IN SHARE ROW EXCLUSIVE MODE")));
    if(sql.startsWith('DELETE FROM product."MeasurementEntry"')){const prior=entries.length;for(let i=entries.length-1;i>=0;i--)if(params[0].includes(entries[i].measurementVersionId))entries.splice(i,1);deleted=true;return {rowCount:options.wrongCount?6:prior-entries.length};}
    if(options.deleteParent)throw fault("23503");const prior=versions.length;for(let i=versions.length-1;i>=0;i--)if(params[0].includes(versions[i].id))versions.splice(i,1);return {rowCount:prior-versions.length};
   }
   throw Error("Unexpected offline SQL");
  }};
 const run=()=>runMeasurementCleanup(c,{db,read:path=>structuredClone(path===c.inventoryPath?r.inventory:r.result)});
 return {run,c,db,calls,paramsSeen,versions,entries,initial,original,committed:()=>committed};
}
test("only the exact run, owner paths, test migrator and separate execution/digest confirmations authorize",()=>{
 const r=receipts();assert.equal(config(r).execute,false);assert.equal(config(r,true).execute,true);
 for(const patch of [{PRODUCT_MEASUREMENT_CLEANUP_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_CLEANUP_RUN_ID:randomUUID()},{PRODUCT_MEASUREMENT_CLEANUP_RESULT:"/other/result.json"},
  {PRODUCT_MEASUREMENT_CLEANUP_INVENTORY:"relative.json"},{NODE_ENV:"development"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_MIGRATION_CONFIRMED:undefined},{PGOPTIONS:"private"},{NODE_OPTIONS:"private"},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("_migrator:","_app:")},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("product_test?","product_dev?")}])assert.throws(()=>config(r,false,patch));
 for(const patch of [{PRODUCT_MEASUREMENT_CLEANUP_EXECUTE_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_CLEANUP_INVENTORY_DIGEST:undefined},{PRODUCT_MEASUREMENT_CLEANUP_RESULT_DIGEST:"invalid"}])assert.throws(()=>config(r,true,patch));
});
test("incorrect inventories, receipt mismatches and changed digests refuse before connecting",async()=>{
 for(const change of [r=>r.inventory.runId=randomUUID(),r=>r.result.runId=randomUUID(),r=>r.result.inventoryCreatedAt="2026-11-09T00:00:00.000Z",r=>r.result.cleanupPerformed=true,
  r=>r.inventory.role="stitchtrack_product_test_migrator",r=>r.inventory.migrationChecksums={},r=>r.inventory.plan[0].body.clientId=clients[1],r=>r.inventory.plan[1].body.id=r.inventory.plan[0].body.id,
  r=>r.inventory.baseline[0].digest="invalid",r=>r.result.versions[0].entries[0].name="Different",r=>r.result.versions[0].versionNumber=2]){
  const r=receipts(),f=fake(r,true);change(r);const out=await f.run();assert.equal(out.status,"refused");assert.equal(out.stage,"receipts");assert.equal(f.calls.includes("connect"),false);assert.equal(f.committed(),false);
 }
 const r=receipts(),c=config(r,true);c.inventoryDigest="0".repeat(64);assert.throws(()=>validateMeasurementCleanupReceipts(r.inventory,r.result,c));
});
test("read-only preflight validates exact rows and receipts, returns approval digests and makes no changes",async()=>{
 const r=receipts(),f=fake(r),out=await f.run();assert.equal(out.status,"preflight_passed",JSON.stringify(out));assert.equal(out.inventoryDigest,digest(r.inventory));assert.equal(out.resultDigest,digest(r.result));
 assert.equal(out.deletedVersions,0);assert.equal(out.deletedEntries,0);assert.ok(f.calls.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"));assert.ok(f.calls.includes("ROLLBACK"));
 assert.equal(f.calls.some(q=>q.startsWith("DELETE")||q==="COMMIT"||q.includes("FOR UPDATE")),false);assert.deepEqual(f.versions,f.initial.versions);assert.deepEqual(f.entries,f.initial.entries);
});
test("successful cleanup uses User then Client locks, child-first exact-ID deletes, snapshots and one confirmed COMMIT",async()=>{
 const f=fake(receipts(),true),out=await f.run();assert.equal(out.status,"cleaned",JSON.stringify(out));assert.equal(out.commitConfirmed,true);assert.equal(out.deletedVersions,3);assert.equal(out.deletedEntries,7);
 assert.equal(f.versions.length,0);assert.equal(f.entries.length,0);assert.equal(f.committed(),true);
 const q=f.calls;assert.ok(q.findIndex(s=>s.includes('FROM product."User"')&&s.includes("FOR UPDATE"))<q.findIndex(s=>s.includes('FROM product."Client"')&&s.includes("FOR UPDATE")));
 assert.ok(q.findIndex(s=>s.startsWith('DELETE FROM product."MeasurementEntry"'))<q.findIndex(s=>s.startsWith('DELETE FROM product."MeasurementVersion"')));
 assert.equal(q.filter(s=>s==="COMMIT").length,1);assert.equal(q.includes("ROLLBACK"),false);assert.equal(q.at(-1),"end");
});
test("modified versions, label bytes, decimal values, invalid-probe records and new/unrelated history block deletion",async()=>{
 for(const [options,stage]of [[{changedVersion:{unit:"in"}},"versions"],[{changedVersion:{recordedAt:new Date("2026-11-08T12:00:00.001Z")}},"versions"],
  [{changedEntry:{name:"\u00e9paule"}},"entries"],[{changedEntry:{value:"0.02"}},"entries"],[{invalidPersisted:true},"versions"],[{newHistory:true},"baseline"],[{baseline:true},"baseline"]]){
  const f=fake(receipts(),true,options),out=await f.run();assert.equal(out.status,"failed_rolled_back");assert.equal(out.stage,stage,JSON.stringify(out));assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);
  assert.deepEqual(f.versions,f.initial.versions);assert.deepEqual(f.entries,f.initial.entries);
 }
});
test("identity, history, schema, permissions, triggers, rules and unexpected FK dependencies fail closed",async()=>{
 for(const [options,stage]of [[{wrongTarget:true},"identity"],[{history:true},"migration_history"],[{fixture:true},"fixtures"],[{trigger:true},"metadata"],[{stale:true},"metadata"],
  [{grants:true},"metadata"],[{dependency:true},"dependencies"],[{cascade:true},"dependencies"],[{rule:true},"dependencies"],[{lock:true},"table_locks"]]){
  const f=fake(receipts(),true,options),out=await f.run();assert.equal(out.status,"failed_rolled_back");assert.equal(out.stage,stage);assert.equal(f.calls.some(q=>q.startsWith("DELETE")),false);assert.equal(out.noAutomaticRetry,true);
 }
});
test("delete failures, wrong counts and changed post-delete snapshots roll back both tables without success",async()=>{
 for(const [options,stage]of [[{deleteParent:true},"delete_versions"],[{wrongCount:true},"delete_entries"],[{afterChanged:true},"snapshot_after"]]){
  const f=fake(receipts(),true,options),out=await f.run();assert.equal(out.status,"failed_rolled_back");assert.equal(out.stage,stage);assert.equal(out.deletedVersions,0);assert.equal(out.deletedEntries,0);
  assert.deepEqual(f.versions,f.initial.versions);assert.deepEqual(f.entries,f.initial.entries);assert.equal(f.calls.includes("COMMIT"),false);
 }
});
test("failed and lost COMMIT acknowledgements remain unconfirmed even if a later ROLLBACK succeeds",async()=>{
 for(const options of [{commitFailure:true},{commitLost:true}]){
  const f=fake(receipts(),true,options),out=await f.run();assert.equal(out.status,"unconfirmed");assert.equal(out.stage,"commit");assert.equal(out.commitConfirmed,false);assert.equal(out.deletedVersions,null);assert.equal(out.deletedEntries,null);
  assert.equal(f.calls.filter(q=>q==="COMMIT").length,1);assert.equal(f.calls.filter(q=>q.startsWith("DELETE")).length,2);assert.equal(out.noAutomaticRetry,true);
  assert.equal(f.versions.length,options.commitLost?0:3);assert.doesNotMatch(JSON.stringify(out),/PRIVATE|synthetic-|postgresql:|label|stack/u);
 }
});
test("rollback and connection cleanup failures cannot be mistaken for confirmed success or authorize retries",async()=>{
 const f=fake(receipts(),true,{deleteParent:true,rollback:true}),r=await f.run();assert.equal(r.status,"unconfirmed");assert.equal(r.rollbackFailed,true);assert.equal(r.noAutomaticRetry,true);
 const preflight=fake(receipts(),false,{rollback:true}),preflightResult=await preflight.run();assert.equal(preflightResult.status,"unconfirmed");assert.equal(preflight.calls.filter(q=>q==="ROLLBACK").length,1);
 const ended=fake(receipts(),true,{cleanup:true}),out=await ended.run();assert.equal(out.status,"failed_after_commit");assert.equal(out.commitConfirmed,true);assert.equal(out.deletedVersions,3);assert.equal(out.noAutomaticRetry,true);
});
test("private file reader refuses public permissions, symlinks, wrong location and preserves receipt contents",()=>{
 const r=receipts(),dir=mkdtempSync(join(tmpdir(),"stitchtrack-measurement-cleanup-"));chmodSync(dir,0o700);const path=join(dir,"inventory.json");
 privateReceipt.write(path,r.inventory);privateReceipt.write(path+".result.json",r.result);assert.deepEqual(privateReceipt.read(path),r.inventory);
 const link=join(dir,"link.json");symlinkSync(path,link);assert.throws(()=>privateReceipt.read(link));chmodSync(path,0o644);assert.throws(()=>privateReceipt.read(path));
 assert.throws(()=>privateReceipt.read(new URL("./measurement-api-cleanup.test.mjs",import.meta.url).pathname));
});
test("source has only two bounded DELETEs and no HTTP, permission changes, automatic retries or receipt writes",()=>{
 assert.equal((source.match(/DELETE FROM product\./gu)||[]).length,2);
 assert.doesNotMatch(source,/fetch\(|GRANT |REVOKE |TRUNCATE |CASCADE|SET ROLE|\.write\(|writeFile|unlink|migrate deploy/u);
 for(const token of ["measurementApiSnapshot(db,ids)","schemaMetadata(db)","applicationPrivileges(db)","commitAttempted=true","attempted.entries,7","attempted.versions,3","expectedDeletions",'privateReceipt.read(path)'])assert.ok(source.includes(token),token);
});
