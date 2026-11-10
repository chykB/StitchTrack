// OWNER ONLY. Inert on import. Exact synthetic proof run only; no automatic retry or receipt modification.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {schemaMetadata,applicationPrivileges,snapshot} from "./measurement-constraints.integration.mjs";
import {measurementApiPlan,measurementApiSnapshot,measurementApiSnapshotTables as tables} from "./measurement-api.integration.mjs";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
import {measurementVersionSchema} from "../../lib/measurement-contract.ts";
export const measurementCleanupRun="250c74a3-678c-4fd2-944e-a6dd0c62b0a6";
const allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const stages=new Set(["authorization","receipts","connection","begin","identity","schema","row_locks","table_locks","migration_history","metadata","dependencies",
 "fixtures","baseline","versions","entries","tail","delete_entries","delete_versions","verify_absence","snapshot_after","commit","rollback","connection_cleanup","internal"]);
const codes=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),expected.split(" ").sort());
const timestamp=value=>assert.ok(typeof value==="string"&&new Date(value).toISOString()===value);
export function authorizeMeasurementCleanup(args,env){
 assert.equal(process.platform,"linux");assert.equal(args.length,1);assert.ok(["--owner-measurement-cleanup-preflight","--owner-measurement-cleanup-execute"].includes(args[0]));
 assert.equal(env.NODE_ENV,"test");assert.equal(env.PRODUCT_DATABASE_MODE,"test");assert.equal(env.PRODUCT_MEASUREMENT_CLEANUP_CONFIRMED,"true");
 assert.equal(env.PRODUCT_MEASUREMENT_CLEANUP_RUN_ID,measurementCleanupRun);
 assert.ok(!["NODE_OPTIONS","NODE_DEBUG","NODE_USE_ENV_PROXY","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]));
 const target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");
 const inventoryPath=env.PRODUCT_MEASUREMENT_CLEANUP_INVENTORY,resultPath=env.PRODUCT_MEASUREMENT_CLEANUP_RESULT;
 assert.ok(typeof inventoryPath==="string"&&isAbsolute(inventoryPath)&&resolve(inventoryPath)===inventoryPath);
 assert.equal(resultPath,inventoryPath+".result.json");
 const execute=args[0]==="--owner-measurement-cleanup-execute";
 if(execute){assert.equal(env.PRODUCT_MEASUREMENT_CLEANUP_EXECUTE_CONFIRMED,"true");
  for(const key of ["PRODUCT_MEASUREMENT_CLEANUP_INVENTORY_DIGEST","PRODUCT_MEASUREMENT_CLEANUP_RESULT_DIGEST"])assert.match(env[key]??"",/^[0-9a-f]{64}$/u);}
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);
 return {target,inventoryPath,resultPath,execute,inventoryDigest:env.PRODUCT_MEASUREMENT_CLEANUP_INVENTORY_DIGEST,resultDigest:env.PRODUCT_MEASUREMENT_CLEANUP_RESULT_DIGEST};
}
export function validateMeasurementCleanupReceipts(inventory,result,config){
 keys(inventory,"format kind runId createdAt database role businesses clients migrationChecksums baselineMaximum baseline plan state");
 assert.equal(inventory.format,1);assert.equal(inventory.kind,"measurement_api_write_proof");assert.equal(inventory.runId,measurementCleanupRun);timestamp(inventory.createdAt);
 assert.equal(inventory.database,"stitchtrack_product_test");assert.equal(inventory.role,"stitchtrack_product_test_app");assert.deepEqual(inventory.migrationChecksums,PRODUCT_MIGRATIONS);
 assert.equal(inventory.state,"planned; API transactions commit independently; reconcile every inventoried ID before any rerun or cleanup");
 assert.equal(inventory.businesses.length,2);assert.ok(inventory.businesses.every(id=>typeof id==="string"&&id.length>0&&id.length<=200&&id===id.trim()&&!/[\x00-\x1f\x7f]/u.test(id)));assert.notEqual(...inventory.businesses);
 assert.equal(inventory.clients.length,2);for(const id of inventory.clients)assert.equal(clientIdSchema.parse(id),id);assert.notEqual(...inventory.clients);
 assert.deepEqual(inventory.baseline.map(row=>row.table),tables);
 for(const row of inventory.baseline){keys(row,"table count digest");assert.ok(Number.isInteger(row.count)&&row.count>=0&&row.count<=10000);assert.match(row.digest,/^[0-9a-f]{32}$/u);}
 assert.equal(inventory.plan.length,8);const template=measurementApiPlan(inventory.clients[0],inventory.baselineMaximum);
 const ids=inventory.plan.map((p,i)=>{const id=clientIdSchema.parse(p.body.id);assert.equal(id,p.body.id);template[i].body.id=id;assert.deepEqual(p,template[i]);return id;});assert.equal(new Set(ids).size,8);
 keys(result,"format kind runId inventoryCreatedAt versions cleanupPerformed");assert.equal(result.format,1);assert.equal(result.kind,"measurement_api_write_result");assert.equal(result.runId,inventory.runId);
 assert.equal(result.inventoryCreatedAt,inventory.createdAt);assert.equal(result.cleanupPerformed,false);assert.equal(result.versions.length,3);
 assert.equal(new Set(result.versions.map(v=>v.id)).size,3);
 for(const version of result.versions){
  assert.deepEqual(measurementVersionSchema.parse(version),version);const plan=inventory.plan.slice(0,3).find(p=>p.body.id===version.id);assert.ok(plan);
  assert.equal(version.clientId,inventory.clients[0]);assert.equal(version.unit,plan.body.unit);assert.ok(plan.expectedVersionNumbers.includes(version.versionNumber));
  const ordered=entries=>[...entries].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  assert.deepEqual(ordered(version.entries),ordered(plan.body.entries));
 }
 assert.deepEqual(result.versions.map(v=>v.versionNumber).sort((a,b)=>a-b),[1,2,3].map(n=>inventory.baselineMaximum+n));
 const inventoryDigest=hash(inventory),resultDigest=hash(result);
 if(config.execute){assert.equal(config.inventoryDigest,inventoryDigest);assert.equal(config.resultDigest,resultDigest);}
 return {inventory,result,ids,validIds:inventory.plan.slice(0,3).map(p=>p.body.id),inventoryDigest,resultDigest};
}
function failure(status,stage,error,attempted,commitConfirmed=false){return {status,runId:measurementCleanupRun,stage:stages.has(stage)?stage:"internal",noAutomaticRetry:true,commitConfirmed,
 deletedVersions:commitConfirmed?3:status==="unconfirmed"?null:0,deletedEntries:commitConfirmed?7:status==="unconfirmed"?null:0,
 attemptedDeletions:attempted,...(codes.has(error?.code)?{sqlstate:error.code}:{})};}
export async function runMeasurementCleanup(config,{db,read=path=>privateReceipt.read(path),report=()=>{}}={}){
 let stage="receipts",tx=false,commitAttempted=false,commitConfirmed=false,rollbackAttempted=false,outcome,data;
 const attempted={versions:0,entries:0};
 try{
  // Owner-only files are read once, validated and digest-bound before any connection.
  data=validateMeasurementCleanupReceipts(read(config.inventoryPath),read(config.resultPath),config);
  const {inventory,result,ids,validIds}=data;
  stage="connection";if(!db){const {Client}=await import("pg");db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}
  db.on?.("error",()=>{});await db.connect();report({status:"started",runId:measurementCleanupRun,mode:config.execute?"execute":"preflight"});
  stage="begin";tx=true;await db.query(config.execute?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='7s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS host,
   host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  assert.ok(identity.version>=160000&&identity.version<170000);delete identity.version;
  assert.deepEqual(identity,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",safe:true});
  const fixtures=async()=>{
   const owners=[];for(const i of [0,1]){
    const {rows:[row]}=await db.query(`SELECT b."primaryOwnerUserId" AS owner FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
     JOIN product."User" u ON u."id"=b."primaryOwnerUserId" JOIN product."Client" c ON c."businessId"=b."id" WHERE b."id"=$1 AND c."id"=$2::uuid
     AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
     AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[inventory.businesses[i],inventory.clients[i]]);
    assert.ok(row&&typeof row.owner==="string"&&row.owner);owners.push(row.owner);
   }assert.notEqual(...owners);return owners;
  };
  stage="fixtures";const owners=await fixtures();
  if(config.execute){stage="row_locks";
   const users=(await db.query('SELECT "id" FROM product."User" WHERE "id"=ANY($1::text[]) ORDER BY "id" COLLATE "C" FOR UPDATE',[owners])).rows;
   assert.deepEqual(users.map(r=>r.id).sort(),[...owners].sort());
   const clients=(await db.query('SELECT "id" FROM product."Client" WHERE "id"=ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',[inventory.clients])).rows;
   assert.deepEqual(clients.map(r=>r.id).sort(),[...inventory.clients].sort());
  }
  stage="table_locks";await db.query('LOCK TABLE '+allTables.map(t=>'product."'+t+'"').join(',')+(config.execute?' IN SHARE ROW EXCLUSIVE MODE':' IN ACCESS SHARE MODE'));
  stage="schema";const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
  assert.deepEqual(actual.map(r=>r.name),allTables);assert.ok(actual.every(r=>r.kind==="r"&&r.owner===config.target.user));
  const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated
   FROM pg_namespace WHERE nspname='product'`);assert.deepEqual(schema,{owner:config.target.user,isolated:true});
  stage="migration_history";const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations');
  assert.equal(history.length,9);assert.deepEqual(history.map(h=>h.migration_name).sort(),Object.keys(PRODUCT_MIGRATIONS).sort());
  assert.ok(history.every(h=>h.checksum===PRODUCT_MIGRATIONS[h.migration_name]&&h.finished_at instanceof Date&&Number.isFinite(h.finished_at.getTime())&&h.rolled_back_at===null&&h.logs===null&&h.applied_steps_count===1));
  stage="metadata";await schemaMetadata(db);await applicationPrivileges(db);
  stage="dependencies";const {rows:dependencies}=await db.query(`SELECT child_ns.nspname AS child_schema,child.relname AS child,conname AS name,parent_ns.nspname AS parent_schema,parent.relname AS parent,
   convalidated AS valid,condeferrable AS deferred,confdeltype AS deletion,confupdtype AS update,conkey AS child_keys,confkey AS parent_keys
   FROM pg_constraint k JOIN pg_class child ON child.oid=k.conrelid JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
   JOIN pg_class parent ON parent.oid=k.confrelid JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
   WHERE contype='f' AND (conrelid=ANY($1::regclass[]) OR confrelid=ANY($1::regclass[])) ORDER BY conname COLLATE "C"`,[['product."MeasurementVersion"','product."MeasurementEntry"']]);
  assert.deepEqual(dependencies,[{child_schema:"product",child:"MeasurementEntry",name:"MeasurementEntry_measurementVersionId_fkey",parent_schema:"product",parent:"MeasurementVersion",valid:true,deferred:false,deletion:"r",update:"r",child_keys:[1],parent_keys:[1]},
   {child_schema:"product",child:"MeasurementVersion",name:"MeasurementVersion_businessId_clientId_fkey",parent_schema:"product",parent:"Client",valid:true,deferred:false,deletion:"r",update:"r",child_keys:[2,3],parent_keys:[2,1]}]);
  const {rows:[rules]}=await db.query('SELECT count(*)::int AS count FROM pg_rewrite WHERE ev_class=ANY($1::regclass[])',[['product."MeasurementVersion"','product."MeasurementEntry"']]);assert.equal(rules.count,0);
  stage="fixtures";assert.deepEqual(await fixtures(),owners);
  stage="baseline";assert.deepEqual(await measurementApiSnapshot(db,ids),inventory.baseline);const before=await snapshot(db);
  stage="versions";const {rows:versions}=await db.query('SELECT "id","businessId","clientId","versionNumber","unit","recordedAt" FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[ids]);assert.equal(versions.length,3);
  for(const v of versions){const expected=result.versions.find(r=>r.id===v.id);assert.ok(expected);assert.equal(v.businessId,inventory.businesses[0]);assert.deepEqual({id:v.id,clientId:v.clientId,versionNumber:v.versionNumber,unit:v.unit,recordedAt:v.recordedAt.toISOString()},
   {id:expected.id,clientId:expected.clientId,versionNumber:expected.versionNumber,unit:expected.unit,recordedAt:expected.recordedAt});}
  stage="entries";const {rows:entries}=await db.query(`SELECT "measurementVersionId",encode(convert_to("name",'UTF8'),'hex') AS bytes,"value"::text AS value FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[]) LIMIT 8`,[ids]);assert.equal(entries.length,7);
  const ordered=rows=>rows.sort((a,b)=>a.measurementVersionId.localeCompare(b.measurementVersionId)||a.bytes.localeCompare(b.bytes));
  assert.deepEqual(ordered(entries),ordered(result.versions.flatMap(v=>v.entries.map(e=>({measurementVersionId:v.id,bytes:Buffer.from(e.name,"utf8").toString("hex"),value:e.value})))));
  stage="tail";const {rows:tail}=await db.query('SELECT "id" FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid AND "versionNumber">$3 ORDER BY "versionNumber"',[inventory.businesses[0],inventory.clients[0],inventory.baselineMaximum]);
  assert.deepEqual(tail.map(v=>v.id).sort(),[...validIds].sort());
  if(config.execute){
   stage="delete_entries";const deletedEntries=await db.query(`DELETE FROM product."MeasurementEntry" AS e USING product."MeasurementVersion" AS v
    WHERE e."measurementVersionId"=v."id" AND v."id"=ANY($1::uuid[]) AND v."businessId"=$2 AND v."clientId"=$3::uuid`,[validIds,inventory.businesses[0],inventory.clients[0]]);
   attempted.entries=deletedEntries.rowCount;assert.equal(attempted.entries,7);
   stage="delete_versions";const deletedVersions=await db.query('DELETE FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[]) AND "businessId"=$2 AND "clientId"=$3::uuid',[validIds,inventory.businesses[0],inventory.clients[0]]);
   attempted.versions=deletedVersions.rowCount;assert.equal(attempted.versions,3);
   stage="verify_absence";for(const [table,key]of [["MeasurementVersion","id"],["MeasurementEntry","measurementVersionId"]])assert.equal((await db.query('SELECT 1 FROM product."'+table+'" WHERE "'+key+'"=ANY($1::uuid[])',[ids])).rowCount,0);
   stage="snapshot_after";assert.deepEqual(await measurementApiSnapshot(db,ids),inventory.baseline);
   const after=await snapshot(db);assert.deepEqual(after.filter(s=>!s.table.startsWith("Measurement")),before.filter(s=>!s.table.startsWith("Measurement")));
   for(const [table,count]of [["MeasurementVersion",3],["MeasurementEntry",7]])assert.equal(after.find(r=>r.table===table).count,before.find(r=>r.table===table).count-count);
   stage="commit";commitAttempted=true;const committed=await db.query("COMMIT");assert.equal(committed.command,"COMMIT");commitConfirmed=true;tx=false;
   outcome={status:"cleaned",runId:measurementCleanupRun,commitConfirmed:true,deletedVersions:3,deletedEntries:7,noAutomaticRetry:true};
  }else{
   stage="rollback";rollbackAttempted=true;const rolled=await db.query("ROLLBACK");assert.equal(rolled.command,"ROLLBACK");tx=false;
   outcome={status:"preflight_passed",runId:measurementCleanupRun,inventoryDigest:data.inventoryDigest,resultDigest:data.resultDigest,expectedDeletions:{versions:3,entries:7},deletedVersions:0,deletedEntries:0};
  }
 }catch(error){
  let rolledBack=false,rollbackFailed=false;
  if(tx&&!rollbackAttempted)try{rollbackAttempted=true;const rolled=await db.query("ROLLBACK");rolledBack=rolled.command==="ROLLBACK";if(!rolledBack)rollbackFailed=true;}catch{rollbackFailed=true;}
  else if(tx)rollbackFailed=true;
  const status=commitAttempted||rollbackFailed?"unconfirmed":rolledBack?"failed_rolled_back":"refused";
  outcome=failure(status,stage,error,attempted,commitConfirmed);if(rollbackFailed)outcome.rollbackFailed=true;
 }finally{if(db)try{await db.end();}catch(error){if(outcome?.status==="preflight_passed"||outcome?.status==="cleaned")outcome=failure(commitConfirmed?"failed_after_commit":"refused","connection_cleanup",error,attempted,commitConfirmed);else outcome.connectionCleanupFailed=true;}}
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runMeasurementCleanup(authorizeMeasurementCleanup(process.argv.slice(2),process.env),{report:value=>console.log(JSON.stringify(value))});}
 catch(error){result=failure("refused","authorization",error,{versions:0,entries:0});}
 console.log(JSON.stringify(result));if(!["preflight_passed","cleaned"].includes(result.status))process.exitCode=1;
}
