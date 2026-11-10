// OWNER ONLY. Exact Orders measurement-fixture run. Inert import; no automatic retries.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {orderMeasurementFixturePlan,orderMeasurementFixtureCleanupDigest,orderApiSnapshot} from "./order-api.integration.mjs";
import {validateFailedOrderInventory,failedOrderRun} from "./order-failed-run-cleanup.mjs";
import {orderSchemaMetadata,orderApplicationPrivileges} from "./order-constraints.integration.mjs";
import {schemaMetadata as measurementMetadata} from "./measurement-constraints.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
import {measurementVersionSchema} from "../../lib/measurement-contract.ts";
export const orderFixtureRun="eb7425db-b245-4dae-aff5-d4ba3e8fa024";
const tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort(),allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const stages=new Set(["authorization","receipts","connection","begin","identity","fixtures","row_locks","table_locks","schema","migration_history","metadata","protected_version","orders_absent","unreferenced","baseline","versions","entries","history","delete_entries","delete_versions","verify_absence","snapshot_after","commit","rollback","connection_cleanup","internal"]);
const codes=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),expected.split(" ").sort());
const timestamp=value=>assert.ok(typeof value==="string"&&new Date(value).toISOString()===value);
const uuid=value=>assert.equal(clientIdSchema.parse(value),value);
const inspectMetadata=async db=>{await orderSchemaMetadata(db);await measurementMetadata(db);await orderApplicationPrivileges(db);};
export function authorizeOrderFixtureCleanup(args,env){
 assert.equal(process.platform,"linux");assert.equal(args.length,1);assert.ok(["--owner-order-fixture-cleanup-preflight","--owner-order-fixture-cleanup-execute"].includes(args[0]));
 assert.equal(env.NODE_ENV,"test");assert.equal(env.PRODUCT_DATABASE_MODE,"test");assert.equal(env.PRODUCT_ORDER_FIXTURE_CLEANUP_CONFIRMED,"true");assert.equal(env.PRODUCT_ORDER_FIXTURE_CLEANUP_RUN_ID,orderFixtureRun);
 assert.ok(!["NODE_OPTIONS","NODE_DEBUG","NODE_USE_ENV_PROXY","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]));
 const target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");
 const inventoryPath=env.PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY,resultPath=env.PRODUCT_ORDER_FIXTURE_CLEANUP_RESULT,ordersInventoryPath=env.PRODUCT_ORDER_FIXTURE_CLEANUP_ORDERS_INVENTORY;
 for(const path of [inventoryPath,resultPath,ordersInventoryPath])assert.ok(typeof path==="string"&&isAbsolute(path)&&resolve(path)===path);
 assert.equal(resultPath,inventoryPath+".result.json");assert.equal(new Set([inventoryPath,resultPath,ordersInventoryPath]).size,3);
 const execute=args[0]==="--owner-order-fixture-cleanup-execute";
 if(execute){assert.equal(env.PRODUCT_ORDER_FIXTURE_CLEANUP_EXECUTE_CONFIRMED,"true");for(const key of ["INVENTORY_DIGEST","RESULT_DIGEST","ORDERS_INVENTORY_DIGEST"])assert.match(env["PRODUCT_ORDER_FIXTURE_CLEANUP_"+key]??"",/^[0-9a-f]{64}$/u);}
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),"20261109_order_items");
 return {target,inventoryPath,resultPath,ordersInventoryPath,execute,inventoryDigest:env.PRODUCT_ORDER_FIXTURE_CLEANUP_INVENTORY_DIGEST,resultDigest:env.PRODUCT_ORDER_FIXTURE_CLEANUP_RESULT_DIGEST,ordersInventoryDigest:env.PRODUCT_ORDER_FIXTURE_CLEANUP_ORDERS_INVENTORY_DIGEST};
}
export function validateOrderFixtureReceipts(inventory,result,ordersInventory,config){
 keys(inventory,"format kind runId createdAt database role businesses clients references migrationChecksums migrationVerification cleanupProposalDigest baseline plan protectedMeasurementId state");
 assert.equal(inventory.format,1);assert.equal(inventory.kind,"order_measurement_fixtures");assert.equal(inventory.runId,orderFixtureRun);timestamp(inventory.createdAt);
 assert.equal(inventory.database,"stitchtrack_product_test");assert.equal(inventory.role,"stitchtrack_product_test_app");assert.deepEqual(inventory.migrationChecksums,PRODUCT_MIGRATIONS);
 assert.equal(inventory.migrationVerification,"local_manifest_and_prior_owner_tenth_integrity_proof");assert.equal(inventory.cleanupProposalDigest,orderMeasurementFixtureCleanupDigest());
 assert.equal(inventory.state,"independent API commits; preserve all IDs and reconcile before any retry or cleanup");assert.deepEqual(inventory.references,[]);
 assert.equal(inventory.businesses.length,2);assert.ok(inventory.businesses.every(id=>typeof id==="string"&&id.length>0&&id.length<=200&&id===id.trim()&&!/[\x00-\x1f\x7f]/u.test(id)));assert.notEqual(...inventory.businesses);
 assert.equal(inventory.clients.length,3);inventory.clients.forEach(uuid);assert.equal(new Set(inventory.clients).size,3);uuid(inventory.protectedMeasurementId);
 assert.deepEqual(inventory.baseline.map(row=>row.table),tables);for(const row of inventory.baseline){keys(row,"table count digest");assert.ok(Number.isInteger(row.count)&&row.count>=0&&row.count<=10000);assert.match(row.digest,/^[0-9a-f]{32}$/u);}
 assert.equal(inventory.plan.length,2);const template=orderMeasurementFixturePlan(inventory),ids=[];
 for(const [i,p]of inventory.plan.entries()){uuid(p.body.id);assert.notEqual(p.body.id,inventory.protectedMeasurementId);ids.push(p.body.id);template[i].body.id=p.body.id;assert.deepEqual(p,template[i]);}assert.equal(new Set(ids).size,2);
 keys(result,"format kind runId inventoryCreatedAt inventoryDigest versions cleanupPerformed");assert.equal(result.format,1);assert.equal(result.kind,"order_measurement_fixture_result");assert.equal(result.runId,orderFixtureRun);
 assert.equal(result.inventoryCreatedAt,inventory.createdAt);assert.equal(result.inventoryDigest,hash(inventory));assert.equal(result.cleanupPerformed,false);assert.equal(result.versions.length,2);assert.deepEqual(result.versions.map(v=>v.id).sort(),[...ids].sort());
 for(const v of result.versions){assert.deepEqual(measurementVersionSchema.parse(v),v);const p=inventory.plan.find(p=>p.body.id===v.id);assert.ok(p);timestamp(v.recordedAt);assert.ok(v.recordedAt>=inventory.createdAt&&Date.parse(v.recordedAt)<=Date.now());
  assert.equal(v.clientId,p.body.clientId);assert.equal(v.versionNumber,1);assert.equal(v.unit,"cm");assert.deepEqual(v.entries,p.body.entries);}
 const orders=validateFailedOrderInventory(ordersInventory,{execute:false});assert.equal(orders.inventory.runId,failedOrderRun);assert.deepEqual(orders.inventory.businesses,inventory.businesses);assert.deepEqual(orders.inventory.clients,inventory.clients);assert.ok(orders.inventory.createdAt>=inventory.createdAt);
 for(const [purpose,actor]of [["wrongClient",0],["wrongBusiness",1]]){const r=orders.inventory.references.find(r=>r.purpose===purpose);assert.deepEqual(r,{purpose,id:ids[actor],businessId:inventory.businesses[actor],clientId:inventory.clients[actor+1],versionNumber:1});}
 const inventoryDigest=hash(inventory),resultDigest=hash(result);if(config.execute){assert.equal(config.inventoryDigest,inventoryDigest);assert.equal(config.resultDigest,resultDigest);assert.equal(config.ordersInventoryDigest,orders.inventoryDigest);}
 return {inventory,result,ids,orders,inventoryDigest,resultDigest};
}
async function fullSnapshot(db){
 const rows=await orderApiSnapshot(db,[],[]);
 for(const table of ["AuthRateBucket","_prisma_migrations"]){const count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"')).rows[0].count;assert.ok(Number.isInteger(count)&&count>=0&&count<=10000);
  const digest=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t')).rows[0].digest;assert.match(digest,/^[0-9a-f]{32}$/u);rows.push({table,count,digest});}
 return rows.sort((a,b)=>a.table<b.table?-1:a.table>b.table?1:0);
}
function failure(status,stage,error,attempted,commitConfirmed=false){return {status,runId:orderFixtureRun,stage:stages.has(stage)?stage:"internal",noAutomaticRetry:true,commitConfirmed,
 deletedVersions:commitConfirmed?2:status==="unconfirmed"?null:0,deletedEntries:commitConfirmed?2:status==="unconfirmed"?null:0,attemptedDeletions:attempted,...(codes.has(error?.code)?{sqlstate:error.code}:{})};}
export async function runOrderFixtureCleanup(config,{db,read=path=>privateReceipt.read(path),inspect=inspectMetadata,report=()=>{}}={}){
 let stage="receipts",tx=false,commitAttempted=false,commitConfirmed=false,rollbackAttempted=false,outcome,data;
 const attempted={versions:0,entries:0};
 try{
  // Owner-only files are read once, validated and digest-bound before any connection.
  data=validateOrderFixtureReceipts(read(config.inventoryPath),read(config.resultPath),read(config.ordersInventoryPath),config);
  const {inventory,result,ids,orders}=data;
  stage="connection";if(!db){const {Client}=await import("pg");db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}
  db.on?.("error",()=>{});await db.connect();report({status:"started",runId:orderFixtureRun,mode:config.execute?"execute":"preflight"});
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
     AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[inventory.businesses[i],inventory.clients[i+1]]);
    assert.ok(row&&typeof row.owner==="string"&&row.owner);owners.push(row.owner);
   }assert.notEqual(...owners);return owners;
  };
  stage="fixtures";const owners=await fixtures();
  if(config.execute){stage="row_locks";
   const users=(await db.query('SELECT "id" FROM product."User" WHERE "id"=ANY($1::text[]) ORDER BY "id" COLLATE "C" FOR UPDATE',[owners])).rows;
   assert.deepEqual(users.map(r=>r.id).sort(),[...owners].sort());
   const clients=(await db.query('SELECT "id" FROM product."Client" WHERE "id"=ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',[inventory.clients.slice(1)])).rows;
   assert.deepEqual(clients.map(r=>r.id).sort(),[...inventory.clients.slice(1)].sort());
  }
  stage="table_locks";await db.query('LOCK TABLE '+allTables.map(t=>'product."'+t+'"').join(',')+(config.execute?' IN SHARE ROW EXCLUSIVE MODE':' IN ACCESS SHARE MODE'));
  stage="schema";const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
  assert.deepEqual(actual.map(r=>r.name),allTables);assert.ok(actual.every(r=>r.kind==="r"&&r.owner===config.target.user));
  const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated
   FROM pg_namespace WHERE nspname='product'`);assert.deepEqual(schema,{owner:config.target.user,isolated:true});
  stage="migration_history";const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations');
  assert.equal(history.length,10);assert.deepEqual(history.map(h=>h.migration_name).sort(),Object.keys(PRODUCT_MIGRATIONS).sort());
  assert.ok(history.every(h=>h.checksum===PRODUCT_MIGRATIONS[h.migration_name]&&h.finished_at instanceof Date&&Number.isFinite(h.finished_at.getTime())&&h.rolled_back_at===null&&h.logs===null&&h.applied_steps_count===1));
  stage="metadata";await inspect(db);
  stage="fixtures";assert.deepEqual(await fixtures(),owners);
  stage="protected_version";assert.deepEqual((await db.query('SELECT "id","businessId","clientId","versionNumber" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[inventory.protectedMeasurementId])).rows,
   [{id:inventory.protectedMeasurementId,businessId:inventory.businesses[0],clientId:inventory.clients[0],versionNumber:1}]);
  const ordersAbsent=async()=>{
   assert.equal((await db.query('SELECT 1 FROM product."Order" WHERE "id"=ANY($1::uuid[])',[orders.ids])).rowCount,0);
   assert.equal((await db.query('SELECT 1 FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) OR "orderId"=ANY($2::uuid[])',[orders.itemIds,orders.ids])).rowCount,0);
  };
  stage="orders_absent";await ordersAbsent();
  stage="unreferenced";assert.deepEqual((await db.query('SELECT count(*)::int AS referencing_items FROM product."OrderItem" WHERE "measurementVersionId"=ANY($1::uuid[])',[ids])).rows,[{referencing_items:0}]);
  stage="baseline";assert.deepEqual(await orderApiSnapshot(db,[],[],ids),inventory.baseline);
  assert.deepEqual(await orderApiSnapshot(db,orders.ids,orders.itemIds),orders.inventory.baseline);const before=await fullSnapshot(db);
  stage="versions";const {rows:versions}=await db.query('SELECT "id","businessId","clientId","versionNumber","unit","recordedAt" FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[ids]);assert.equal(versions.length,2);
  for(const v of versions){const p=inventory.plan.find(p=>p.body.id===v.id),wanted=result.versions.find(r=>r.id===v.id);assert.ok(p&&wanted);
   assert.deepEqual({...v,recordedAt:v.recordedAt.toISOString()},{id:wanted.id,businessId:inventory.businesses[p.actor],clientId:wanted.clientId,versionNumber:wanted.versionNumber,unit:wanted.unit,recordedAt:wanted.recordedAt});}
  stage="entries";const {rows:entries}=await db.query(`SELECT "measurementVersionId",encode(convert_to("name",'UTF8'),'hex') AS bytes,"value"::text AS value FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[]) LIMIT 3`,[ids]);assert.equal(entries.length,2);
  const ordered=rows=>rows.toSorted((a,b)=>a.measurementVersionId<b.measurementVersionId?-1:a.measurementVersionId>b.measurementVersionId?1:0);
  assert.deepEqual(ordered(entries),ordered(result.versions.flatMap(v=>v.entries.map(e=>({measurementVersionId:v.id,bytes:Buffer.from(e.name,"utf8").toString("hex"),value:e.value})))));
  stage="history";for(const p of inventory.plan){const {rows}=await db.query('SELECT "id" FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid ORDER BY "id"',[inventory.businesses[p.actor],p.body.clientId]);assert.deepEqual(rows,[{id:p.body.id}]);}
  if(config.execute){
   const params=inventory.plan.flatMap(p=>[p.body.id,inventory.businesses[p.actor],p.body.clientId]);
   const approved='WITH approved(id,business_id,client_id) AS (VALUES ($1::uuid,$2::text,$3::uuid),($4::uuid,$5::text,$6::uuid)) ';
   stage="delete_entries";const deletedEntries=await db.query(approved+`DELETE FROM product."MeasurementEntry" AS e USING product."MeasurementVersion" AS v,approved AS a
    WHERE e."measurementVersionId"=v."id" AND v."id"=a.id AND v."businessId"=a.business_id AND v."clientId"=a.client_id`,params);
   attempted.entries=deletedEntries.rowCount;assert.equal(attempted.entries,2);
   stage="delete_versions";const deletedVersions=await db.query(approved+`DELETE FROM product."MeasurementVersion" AS v USING approved AS a
    WHERE v."id"=a.id AND v."businessId"=a.business_id AND v."clientId"=a.client_id`,params);
   attempted.versions=deletedVersions.rowCount;assert.equal(attempted.versions,2);
   stage="verify_absence";for(const [table,key]of [["MeasurementVersion","id"],["MeasurementEntry","measurementVersionId"]])assert.equal((await db.query('SELECT 1 FROM product."'+table+'" WHERE "'+key+'"=ANY($1::uuid[])',[ids])).rowCount,0);
   await ordersAbsent();
   stage="snapshot_after";assert.deepEqual(await orderApiSnapshot(db,[],[],ids),inventory.baseline);
   const after=await fullSnapshot(db);assert.deepEqual(after.filter(s=>!["MeasurementVersion","MeasurementEntry"].includes(s.table)),before.filter(s=>!["MeasurementVersion","MeasurementEntry"].includes(s.table)));
   for(const table of ["MeasurementVersion","MeasurementEntry"])assert.equal(after.find(r=>r.table===table).count,before.find(r=>r.table===table).count-2);
   stage="commit";commitAttempted=true;const committed=await db.query("COMMIT");assert.equal(committed.command,"COMMIT");commitConfirmed=true;tx=false;
   outcome={status:"cleaned",runId:orderFixtureRun,commitConfirmed:true,deletedVersions:2,deletedEntries:2,noAutomaticRetry:true};
  }else{
   stage="rollback";rollbackAttempted=true;const rolled=await db.query("ROLLBACK");assert.equal(rolled.command,"ROLLBACK");tx=false;
   outcome={status:"preflight_passed",runId:orderFixtureRun,inventoryDigest:data.inventoryDigest,resultDigest:data.resultDigest,ordersInventoryDigest:orders.inventoryDigest,expectedDeletions:{versions:2,entries:2},deletedVersions:0,deletedEntries:0,noAutomaticRetry:true};
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
 let result;try{result=await runOrderFixtureCleanup(authorizeOrderFixtureCleanup(process.argv.slice(2),process.env),{report:value=>console.log(JSON.stringify(value))});}
 catch(error){result=failure("refused","authorization",error,{versions:0,entries:0});}
 console.log(JSON.stringify(result));if(!["preflight_passed","cleaned"].includes(result.status))process.exitCode=1;
}
