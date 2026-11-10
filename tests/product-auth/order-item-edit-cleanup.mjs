// OWNER ONLY. Successful Slice 2 receipts only; exact approved run/digests, four rows, no retries.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {orderItemEditPlan,orderItemEditCleanupDigest,orderApiSnapshot} from "./order-api.integration.mjs";
import {orderSchemaMetadata,orderApplicationPrivileges} from "./order-constraints.integration.mjs";
import {schemaMetadata as measurementMetadata} from "./measurement-constraints.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
import {orderSchema,orderRequestSchema} from "../../lib/order-contract.ts";
import {measurementVersionSchema} from "../../lib/measurement-contract.ts";
export const reviewedOrderEditCleanupProposal="1a44af737a24c1e423ce1bfdc0a7aa30d284f3c8270f07ba7807bdb187948102";
const tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort(),allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const stages=new Set(["authorization","receipts","connection","begin","identity","fixtures","row_locks","table_locks","schema","migration_history","metadata","protected_version","unreferenced","baseline","orders","items","versions","entries","history","delete_item","delete_order","delete_entry","delete_version","verify_absence","snapshot_after","commit","rollback","connection_cleanup","internal"]);
const codes=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),expected.split(" ").sort());
const timestamp=value=>assert.ok(typeof value==="string"&&new Date(value).toISOString()===value&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value));
const uuid=value=>assert.equal(clientIdSchema.parse(value),value);
const inspectMetadata=async db=>{await orderSchemaMetadata(db);await measurementMetadata(db);await orderApplicationPrivileges(db);};
export function authorizeOrderEditCleanup(args,env){
 assert.equal(process.platform,"linux");assert.equal(args.length,1);assert.ok(["--owner-order-edit-cleanup-preflight","--owner-order-edit-cleanup-execute"].includes(args[0]));
 assert.equal(env.NODE_ENV,"test");assert.equal(env.PRODUCT_DATABASE_MODE,"test");assert.equal(env.PRODUCT_ORDER_EDIT_CLEANUP_CONFIRMED,"true");assert.equal(env.PRODUCT_ORDER_EDIT_CLEANUP_DATABASE,"stitchtrack_product_test");
 const runId=env.PRODUCT_ORDER_EDIT_CLEANUP_RUN_ID;uuid(runId);
 assert.ok(!["NODE_OPTIONS","NODE_DEBUG","NODE_USE_ENV_PROXY","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]));
 const target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");
 const inventoryPath=env.PRODUCT_ORDER_EDIT_CLEANUP_INVENTORY,resultPath=env.PRODUCT_ORDER_EDIT_CLEANUP_RESULT;
 for(const path of [inventoryPath,resultPath])assert.ok(typeof path==="string"&&isAbsolute(path)&&resolve(path)===path);assert.equal(resultPath,inventoryPath+".result.json");
 const execute=args[0]==="--owner-order-edit-cleanup-execute";
 if(execute){assert.equal(env.PRODUCT_ORDER_EDIT_CLEANUP_EXECUTE_CONFIRMED,"true");for(const key of ["INVENTORY_DIGEST","RESULT_DIGEST"])assert.match(env["PRODUCT_ORDER_EDIT_CLEANUP_"+key]??"",/^[0-9a-f]{64}$/u);}
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),"20261109_order_items");assert.equal(orderItemEditCleanupDigest(),reviewedOrderEditCleanupProposal);
 return {target,runId,inventoryPath,resultPath,execute,inventoryDigest:env.PRODUCT_ORDER_EDIT_CLEANUP_INVENTORY_DIGEST,resultDigest:env.PRODUCT_ORDER_EDIT_CLEANUP_RESULT_DIGEST};
}
export function validateOrderEditCleanupReceipts(inventory,result,config){
 keys(inventory,"format kind runId createdAt database role businesses clients references migrationChecksums migrationVerification cleanupProposalDigest baseline plan protectedMeasurementId duplicateProbe state");
 assert.equal(inventory.format,1);assert.equal(inventory.kind,"order_item_edit_proof");uuid(inventory.runId);assert.equal(inventory.runId,config.runId);timestamp(inventory.createdAt);
 assert.equal(inventory.database,"stitchtrack_product_test");assert.equal(inventory.role,"stitchtrack_product_test_app");assert.deepEqual(inventory.migrationChecksums,PRODUCT_MIGRATIONS);
 assert.equal(inventory.migrationVerification,"local_manifest_and_prior_owner_tenth_integrity_proof");assert.equal(inventory.cleanupProposalDigest,reviewedOrderEditCleanupProposal);assert.equal(orderItemEditCleanupDigest(),reviewedOrderEditCleanupProposal);
 assert.equal(inventory.state,"independent API commits; preserve all IDs and reconcile before any retry or cleanup");assert.equal(inventory.duplicateProbe,false);assert.deepEqual(inventory.references,[]);
 assert.equal(inventory.businesses.length,2);assert.ok(inventory.businesses.every(id=>typeof id==="string"&&id.length>0&&id.length<=200&&id===id.trim()&&!/[\x00-\x1f\x7f]/u.test(id)));assert.notEqual(...inventory.businesses);
 assert.equal(inventory.clients.length,3);inventory.clients.forEach(uuid);assert.equal(new Set(inventory.clients).size,3);uuid(inventory.protectedMeasurementId);
 assert.deepEqual(inventory.baseline.map(row=>row.table),tables);for(const row of inventory.baseline){keys(row,"table count digest");assert.ok(Number.isInteger(row.count)&&row.count>=0&&row.count<=10000);assert.match(row.digest,/^[0-9a-f]{32}$/u);}
 assert.equal(inventory.plan.length,2);const template=orderItemEditPlan({clients:inventory.clients,duplicateProbe:false}),orderId=inventory.plan[0].body.id,itemId=inventory.plan[0].body.items[0].id,versionId=inventory.plan[1].body.id;
 [orderId,itemId,versionId].forEach(uuid);assert.equal(new Set([orderId,itemId,versionId,inventory.protectedMeasurementId]).size,4);
 template[0].body.id=orderId;template[0].body.items[0].id=itemId;template[1].body.id=versionId;assert.deepEqual(inventory.plan,template);
 keys(result,"format kind runId inventoryCreatedAt inventoryDigest versions orders editTrace cleanupPerformed");assert.equal(result.format,1);assert.equal(result.kind,"order_item_edit_result");assert.equal(result.runId,inventory.runId);assert.equal(result.inventoryCreatedAt,inventory.createdAt);assert.equal(result.inventoryDigest,hash(inventory));assert.equal(result.cleanupPerformed,false);
 assert.equal(result.orders.length,1);assert.equal(result.versions.length,1);const order=result.orders[0],version=result.versions[0];assert.deepEqual(orderSchema.parse(order),order);assert.deepEqual(measurementVersionSchema.parse(version),version);
 assert.equal(order.id,orderId);assert.equal(order.clientId,inventory.clients[1]);assert.equal(order.items.length,1);const item=order.items[0];assert.equal(item.id,itemId);assert.equal(item.measurementVersionId,null);assert.equal(item.createdAt,order.createdAt);assert.equal(order.updatedAt,order.createdAt);
 assert.ok(["Synthetic competing choice A","Synthetic competing choice B"].includes(item.description));
 assert.equal(version.id,versionId);assert.equal(version.clientId,inventory.clients[1]);assert.equal(version.versionNumber,1);assert.equal(version.unit,"cm");assert.deepEqual(version.entries,inventory.plan[1].body.entries);
 for(const time of [order.createdAt,item.updatedAt,version.recordedAt]){timestamp(time);assert.ok(time>=inventory.createdAt&&Date.parse(time)<=Date.now());}
 // The proof's seven submitted edits bind each precondition; no-op/stale do not advance it.
 assert.equal(result.editTrace.length,7);for(const entry of result.editTrace){keys(entry,"stage body");assert.deepEqual(orderRequestSchema.parse(entry.body),entry.body);timestamp(entry.body.expectedUpdatedAt);}
 const t0=order.createdAt,t1=result.editTrace[1].body.expectedUpdatedAt,t2=result.editTrace[5].body.expectedUpdatedAt,t3=result.editTrace[6].body.expectedUpdatedAt,t4=item.updatedAt;
 assert.ok(t0<t1&&t1<t2&&t2<t3&&t3<t4);
 const edit=(stage,time,patch)=>({stage,body:{operation:"update_item",id:orderId,itemId,expectedUpdatedAt:time,...patch}});
 assert.deepEqual(result.editTrace,[edit("edit_description",t0,{description:"Synthetic edited lining"}),edit("edit_noop",t1,{description:"Synthetic edited lining"}),edit("edit_stale",t0,{description:"Stale edit must not persist"}),
  edit("edit_competing",t1,{description:"Synthetic competing choice A"}),edit("edit_competing",t1,{description:"Synthetic competing choice B"}),edit("edit_selection",t2,{measurementVersionId:versionId}),edit("edit_clear",t3,{measurementVersionId:null})]);
 const inventoryDigest=hash(inventory),resultDigest=hash(result);if(config.execute){assert.equal(config.inventoryDigest,inventoryDigest);assert.equal(config.resultDigest,resultDigest);}
 return {inventory,result,orderId,itemId,versionId,inventoryDigest,resultDigest};
}
async function fullSnapshot(db){
 const rows=await orderApiSnapshot(db,[],[]);
 for(const table of ["AuthRateBucket","_prisma_migrations"]){const count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"')).rows[0].count;assert.ok(Number.isInteger(count)&&count>=0&&count<=10000);
  const digest=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t')).rows[0].digest;assert.match(digest,/^[0-9a-f]{32}$/u);rows.push({table,count,digest});}
 return rows.sort((a,b)=>a.table<b.table?-1:a.table>b.table?1:0);
}
function failure(config,status,stage,error,attempted,commitConfirmed=false){const count=commitConfirmed?1:status==="unconfirmed"?null:0;return {status,runId:config?.runId??null,stage:stages.has(stage)?stage:"internal",noAutomaticRetry:true,commitConfirmed,
 deletedOrders:count,deletedItems:count,deletedVersions:count,deletedEntries:count,attemptedDeletions:attempted,...(codes.has(error?.code)?{sqlstate:error.code}:{})};}
export async function runOrderEditCleanup(config,{db,read=path=>privateReceipt.read(path),inspect=inspectMetadata,report=()=>{}}={}){
 let stage="receipts",tx=false,commitAttempted=false,commitConfirmed=false,rollbackAttempted=false,outcome,data;
 const attempted={orders:0,items:0,versions:0,entries:0};
 try{
  // Owner-only files are read once, validated and digest-bound before any connection.
  data=validateOrderEditCleanupReceipts(read(config.inventoryPath),read(config.resultPath),config);
  const {inventory,result,orderId,itemId,versionId}=data;
  stage="connection";if(!db){const {Client}=await import("pg");db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}
  db.on?.("error",()=>{});await db.connect();report({status:"started",runId:config.runId,mode:config.execute?"execute":"preflight"});
  stage="begin";tx=true;await db.query(config.execute?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='7s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS host,
   host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  assert.ok(identity.version>=160000&&identity.version<170000);delete identity.version;
  assert.deepEqual(identity,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",safe:true});
  const fixtures=async()=>{
   const owners=[];for(const i of [0,1,2]){
    const {rows}=await db.query(`SELECT b."primaryOwnerUserId" AS owner FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
     JOIN product."User" u ON u."id"=b."primaryOwnerUserId" JOIN product."Client" c ON c."businessId"=b."id" WHERE b."id"=$1 AND c."id"=$2::uuid
     AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
     AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[inventory.businesses[i===2?1:0],inventory.clients[i]]);
    assert.equal(rows.length,1);assert.ok(typeof rows[0].owner==="string"&&rows[0].owner);owners.push(rows[0].owner);
   }assert.equal(owners[0],owners[1]);assert.notEqual(owners[0],owners[2]);return [...new Set(owners)];
  };
  stage="fixtures";const owners=await fixtures();
  if(config.execute){stage="row_locks";
   const users=(await db.query('SELECT "id" FROM product."User" WHERE "id"=ANY($1::text[]) ORDER BY "id" COLLATE "C" FOR UPDATE',[owners])).rows;
   assert.deepEqual(users.map(r=>r.id),[...owners].sort());
   const clients=(await db.query('SELECT "id" FROM product."Client" WHERE "id"=$1::uuid AND "businessId"=$2 FOR UPDATE',[inventory.clients[1],inventory.businesses[0]])).rows;assert.deepEqual(clients,[{id:inventory.clients[1]}]);
   assert.deepEqual((await db.query('SELECT "id" FROM product."Order" WHERE "id"=$1::uuid AND "clientId"=$2::uuid AND "businessId"=$3 FOR UPDATE',[orderId,inventory.clients[1],inventory.businesses[0]])).rows,[{id:orderId}]);
   assert.deepEqual((await db.query('SELECT "id" FROM product."OrderItem" WHERE "id"=$1::uuid AND "orderId"=$2::uuid AND "clientId"=$3::uuid FOR UPDATE',[itemId,orderId,inventory.clients[1]])).rows,[{id:itemId}]);
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
  const unreferenced=async()=>assert.deepEqual((await db.query('SELECT count(*)::int AS referencing_items FROM product."OrderItem" WHERE "measurementVersionId"=$1::uuid',[versionId])).rows,[{referencing_items:0}]);
  stage="unreferenced";await unreferenced();
  stage="baseline";assert.deepEqual(await orderApiSnapshot(db,[orderId],[itemId],[versionId]),inventory.baseline);const before=await fullSnapshot(db);
  stage="orders";assert.deepEqual((await db.query('SELECT "id","businessId","clientId","createdAt","updatedAt" FROM product."Order" WHERE "id"=$1::uuid',[orderId])).rows,
   [{id:orderId,businessId:inventory.businesses[0],clientId:inventory.clients[1],createdAt:new Date(result.orders[0].createdAt),updatedAt:new Date(result.orders[0].updatedAt)}]);
  stage="items";const expected=result.orders[0].items[0];
  assert.deepEqual((await db.query(`SELECT "id","orderId","clientId",encode(convert_to("description",'UTF8'),'hex') AS description_hex,"measurementVersionId","createdAt","updatedAt"
   FROM product."OrderItem" WHERE "id"=$1::uuid OR "orderId"=$2::uuid LIMIT 2`,[itemId,orderId])).rows,
   [{id:itemId,orderId,clientId:inventory.clients[1],description_hex:Buffer.from(expected.description,"utf8").toString("hex"),measurementVersionId:null,createdAt:new Date(expected.createdAt),updatedAt:new Date(expected.updatedAt)}]);
  stage="versions";const version=result.versions[0];
  assert.deepEqual((await db.query('SELECT "id","businessId","clientId","versionNumber","unit","recordedAt" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[versionId])).rows,
   [{id:versionId,businessId:inventory.businesses[0],clientId:inventory.clients[1],versionNumber:1,unit:"cm",recordedAt:new Date(version.recordedAt)}]);
  stage="entries";assert.deepEqual((await db.query(`SELECT "measurementVersionId",encode(convert_to("name",'UTF8'),'hex') AS bytes,"value"::text AS value FROM product."MeasurementEntry" WHERE "measurementVersionId"=$1::uuid LIMIT 2`,[versionId])).rows,
   [{measurementVersionId:versionId,bytes:Buffer.from(version.entries[0].name,"utf8").toString("hex"),value:"1.25"}]);
  stage="history";assert.deepEqual((await db.query('SELECT "id" FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid ORDER BY "id" LIMIT 2',[inventory.businesses[0],inventory.clients[1]])).rows,[{id:versionId}]);
  if(config.execute){
   stage="delete_item";attempted.items=(await db.query(`DELETE FROM product."OrderItem" AS i USING product."Order" AS o
    WHERE i."id"=$1::uuid AND i."orderId"=$2::uuid AND i."clientId"=$3::uuid AND o."id"=i."orderId" AND o."clientId"=$3::uuid AND o."businessId"=$4`,[itemId,orderId,inventory.clients[1],inventory.businesses[0]])).rowCount;assert.equal(attempted.items,1);
   stage="delete_order";attempted.orders=(await db.query('DELETE FROM product."Order" WHERE "id"=$1::uuid AND "clientId"=$2::uuid AND "businessId"=$3',[orderId,inventory.clients[1],inventory.businesses[0]])).rowCount;assert.equal(attempted.orders,1);
   stage="unreferenced";await unreferenced();
   stage="delete_entry";attempted.entries=(await db.query(`DELETE FROM product."MeasurementEntry" AS e USING product."MeasurementVersion" AS v
    WHERE e."measurementVersionId"=$1::uuid AND v."id"=e."measurementVersionId" AND v."clientId"=$2::uuid AND v."businessId"=$3`,[versionId,inventory.clients[1],inventory.businesses[0]])).rowCount;assert.equal(attempted.entries,1);
   stage="delete_version";attempted.versions=(await db.query('DELETE FROM product."MeasurementVersion" WHERE "id"=$1::uuid AND "clientId"=$2::uuid AND "businessId"=$3',[versionId,inventory.clients[1],inventory.businesses[0]])).rowCount;assert.equal(attempted.versions,1);
   stage="verify_absence";
   assert.equal((await db.query('SELECT 1 FROM product."Order" WHERE "id"=$1::uuid',[orderId])).rowCount,0);
   assert.equal((await db.query('SELECT 1 FROM product."OrderItem" WHERE "id"=$1::uuid OR "orderId"=$2::uuid',[itemId,orderId])).rowCount,0);
   for(const [table,key]of [["MeasurementVersion","id"],["MeasurementEntry","measurementVersionId"]])assert.equal((await db.query('SELECT 1 FROM product."'+table+'" WHERE "'+key+'"=$1::uuid',[versionId])).rowCount,0);
   stage="snapshot_after";assert.deepEqual(await orderApiSnapshot(db,[orderId],[itemId],[versionId]),inventory.baseline);
   const after=await fullSnapshot(db),changed=["Order","OrderItem","MeasurementVersion","MeasurementEntry"];
   assert.deepEqual(after.filter(s=>!changed.includes(s.table)),before.filter(s=>!changed.includes(s.table)));
   for(const table of changed)assert.equal(after.find(r=>r.table===table).count,before.find(r=>r.table===table).count-1);
   stage="commit";commitAttempted=true;const committed=await db.query("COMMIT");assert.equal(committed.command,"COMMIT");commitConfirmed=true;tx=false;
   outcome={status:"cleaned",runId:config.runId,commitConfirmed:true,deletedOrders:1,deletedItems:1,deletedVersions:1,deletedEntries:1,noAutomaticRetry:true};
  }else{
   stage="rollback";rollbackAttempted=true;const rolled=await db.query("ROLLBACK");assert.equal(rolled.command,"ROLLBACK");tx=false;
   outcome={status:"preflight_passed",runId:config.runId,inventoryDigest:data.inventoryDigest,resultDigest:data.resultDigest,expectedDeletions:{orders:1,items:1,versions:1,entries:1},deletedOrders:0,deletedItems:0,deletedVersions:0,deletedEntries:0,noAutomaticRetry:true};
  }
 }catch(error){
  let rolledBack=false,rollbackFailed=false;
  if(tx&&!rollbackAttempted)try{rollbackAttempted=true;const rolled=await db.query("ROLLBACK");rolledBack=rolled.command==="ROLLBACK";if(!rolledBack)rollbackFailed=true;}catch{rollbackFailed=true;}
  else if(tx)rollbackFailed=true;
  const status=commitAttempted||rollbackFailed?"unconfirmed":rolledBack?"failed_rolled_back":"refused";
  outcome=failure(config,status,stage,error,attempted,commitConfirmed);if(rollbackFailed)outcome.rollbackFailed=true;
 }finally{if(db)try{await db.end();}catch(error){if(outcome?.status==="preflight_passed"||outcome?.status==="cleaned")outcome=failure(config,commitConfirmed?"failed_after_commit":"refused","connection_cleanup",error,attempted,commitConfirmed);else outcome.connectionCleanupFailed=true;}}
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result,config;try{config=authorizeOrderEditCleanup(process.argv.slice(2),process.env);result=await runOrderEditCleanup(config,{report:value=>console.log(JSON.stringify(value))});}
 catch(error){result=failure(config,"refused","authorization",error,{orders:0,items:0,versions:0,entries:0});}
 console.log(JSON.stringify(result));if(!["preflight_passed","cleaned"].includes(result.status))process.exitCode=1;
}
