// OWNER ONLY. Exact FAILED run: never creates or consumes a successful proof receipt.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {orderApiPlan,orderApiSnapshot,orderCleanupProposalDigest} from "./order-api.integration.mjs";
import {orderSchemaMetadata,orderApplicationPrivileges} from "./order-constraints.integration.mjs";
import {schemaMetadata as measurementMetadata} from "./measurement-constraints.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
export const failedOrderRun="2626d27f-7dd3-448e-b4e2-a06c3e36dfa8";
const tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort(),allTables=[...tables,"AuthRateBucket","_prisma_migrations"].sort();
const stages=new Set(["authorization","receipts","connection","begin","identity","fixtures","row_locks","table_locks","schema","migration_history","metadata","references","baseline","orders","items","contents","reconciliation_match","delete_items","delete_orders","verify_absence","snapshot_after","commit","rollback","connection_cleanup","reconciliation_save","internal"]);
const codes=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),expected.split(" ").sort());
const timestamp=value=>assert.ok(typeof value==="string"&&new Date(value).toISOString()===value);
const uuid=value=>assert.equal(clientIdSchema.parse(value),value);
const inspectMetadata=async db=>{await orderSchemaMetadata(db);await measurementMetadata(db);await orderApplicationPrivileges(db);};
export function authorizeFailedOrderCleanup(args,env){
 assert.equal(process.platform,"linux");assert.equal(args.length,1);assert.ok(["--owner-failed-order-cleanup-preflight","--owner-failed-order-cleanup-execute"].includes(args[0]));
 assert.equal(env.NODE_ENV,"test");assert.equal(env.PRODUCT_DATABASE_MODE,"test");assert.equal(env.PRODUCT_FAILED_ORDER_CLEANUP_CONFIRMED,"true");assert.equal(env.PRODUCT_FAILED_ORDER_CLEANUP_RUN_ID,failedOrderRun);
 assert.ok(!["NODE_OPTIONS","NODE_DEBUG","NODE_USE_ENV_PROXY","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]));
 const target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");
 const inventoryPath=env.PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY,reconciliationPath=env.PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION;
 for(const path of [inventoryPath,reconciliationPath])assert.ok(typeof path==="string"&&isAbsolute(path)&&resolve(path)===path);
 assert.notEqual(inventoryPath,reconciliationPath);assert.notEqual(reconciliationPath,inventoryPath+".result.json");
 const execute=args[0]==="--owner-failed-order-cleanup-execute";
 if(execute){assert.equal(env.PRODUCT_FAILED_ORDER_CLEANUP_EXECUTE_CONFIRMED,"true");
  for(const key of ["PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY_DIGEST","PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION_DIGEST"])assert.match(env[key]??"",/^[0-9a-f]{64}$/u);}
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),"20261109_order_items");
 return {target,inventoryPath,reconciliationPath,execute,inventoryDigest:env.PRODUCT_FAILED_ORDER_CLEANUP_INVENTORY_DIGEST,reconciliationDigest:env.PRODUCT_FAILED_ORDER_CLEANUP_RECONCILIATION_DIGEST};
}
export function validateFailedOrderInventory(inventory,config){
 keys(inventory,"format kind runId createdAt database role businesses clients references migrationChecksums migrationVerification cleanupProposalDigest baseline plan state");
 assert.equal(inventory.format,1);assert.equal(inventory.kind,"order_api_write_proof");assert.equal(inventory.runId,failedOrderRun);timestamp(inventory.createdAt);
 assert.equal(inventory.database,"stitchtrack_product_test");assert.equal(inventory.role,"stitchtrack_product_test_app");assert.deepEqual(inventory.migrationChecksums,PRODUCT_MIGRATIONS);
 assert.equal(inventory.migrationVerification,"local_manifest_and_prior_owner_tenth_integrity_proof");assert.equal(inventory.cleanupProposalDigest,orderCleanupProposalDigest());
 assert.equal(inventory.state,"independent API commits; preserve all IDs and reconcile before any retry or cleanup");
 assert.equal(inventory.businesses.length,2);assert.ok(inventory.businesses.every(id=>typeof id==="string"&&id.length>0&&id.length<=200&&id===id.trim()&&!/[\x00-\x1f\x7f]/u.test(id)));assert.notEqual(...inventory.businesses);
 assert.equal(inventory.clients.length,3);inventory.clients.forEach(uuid);assert.equal(new Set(inventory.clients).size,3);
 const versions={valid:null,wrongClient:null,wrongBusiness:null};assert.equal(inventory.references.length,2);
 for(const ref of inventory.references){keys(ref,"purpose id businessId clientId versionNumber");assert.ok(Object.hasOwn(versions,ref.purpose));assert.equal(versions[ref.purpose],null);uuid(ref.id);versions[ref.purpose]=ref.id;
  assert.equal(ref.businessId,inventory.businesses[ref.purpose==="wrongBusiness"?1:0]);assert.equal(ref.clientId,inventory.clients[ref.purpose==="valid"?0:ref.purpose==="wrongClient"?1:2]);assert.ok(Number.isInteger(ref.versionNumber)&&ref.versionNumber>=1);}
 assert.ok(versions.wrongClient&&versions.wrongBusiness);assert.equal(new Set(Object.values(versions).filter(Boolean)).size,inventory.references.length);
 // This run must not attach the independently protected browser-created version.
 assert.equal(versions.valid,null);
 assert.deepEqual(inventory.baseline.map(row=>row.table),tables);
 for(const row of inventory.baseline){keys(row,"table count digest");assert.ok(Number.isInteger(row.count)&&row.count>=0&&row.count<=10000);assert.match(row.digest,/^[0-9a-f]{32}$/u);}
 assert.equal(inventory.plan.length,11);const template=orderApiPlan({clients:inventory.clients,versions});
 for(const [i,p]of inventory.plan.entries()){
  uuid(p.body.id);template[i].body.id=p.body.id;assert.equal(p.body.items.length,template[i].body.items.length);
  p.body.items.forEach((item,j)=>{uuid(item.id);template[i].body.items[j].id=item.id;});assert.deepEqual(p,template[i]);
 }
 const ids=inventory.plan.map(p=>p.body.id),itemIds=[...new Set(inventory.plan.flatMap(p=>p.body.items.map(i=>i.id)))];assert.equal(new Set(ids).size,11);assert.equal(itemIds.length,69);
 assert.equal(inventory.plan[9].body.items[1].id,inventory.plan[0].body.items[0].id);
 const validIds=inventory.plan.slice(0,2).map(p=>p.body.id),validItemIds=inventory.plan.slice(0,2).flatMap(p=>p.body.items.map(i=>i.id));assert.equal(new Set(validItemIds).size,11);
 const inventoryDigest=hash(inventory);if(config.execute)assert.equal(config.inventoryDigest,inventoryDigest);
 return {inventory,ids,itemIds,validIds,validItemIds,inventoryDigest};
}
const ordered=rows=>rows.toSorted((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
export function verifyRecords(data,orders,items){
 const {inventory}=data;assert.equal(orders.length,2);assert.equal(items.length,11);
 const time=value=>{assert.ok(value instanceof Date);const result=value.toISOString();assert.ok(result>=inventory.createdAt&&value.getTime()<=Date.now());return result;};
 const cleanOrders=orders.map(o=>{keys(o,"id businessId clientId createdAt updatedAt");const p=inventory.plan.slice(0,2).find(p=>p.body.id===o.id);assert.ok(p);
  assert.equal(o.businessId,inventory.businesses[0]);assert.equal(o.clientId,inventory.clients[0]);const createdAt=time(o.createdAt),updatedAt=time(o.updatedAt);assert.equal(createdAt,updatedAt);return {...o,createdAt,updatedAt};});
 assert.equal(new Set(orders.map(o=>o.id)).size,2);assert.equal(new Set(items.map(o=>o.id)).size,11);
 const cleanItems=items.map(i=>{keys(i,"id orderId clientId description_hex measurementVersionId createdAt updatedAt");const p=inventory.plan.slice(0,2).find(p=>p.body.id===i.orderId),wanted=p?.body.items.find(item=>item.id===i.id),parent=cleanOrders.find(o=>o.id===i.orderId);assert.ok(wanted&&parent);
  assert.equal(i.clientId,inventory.clients[0]);assert.equal(i.description_hex,Buffer.from(wanted.description,"utf8").toString("hex"));assert.equal(i.measurementVersionId,wanted.measurementVersionId);
  const createdAt=time(i.createdAt),updatedAt=time(i.updatedAt);assert.equal(createdAt,parent.createdAt);assert.equal(updatedAt,createdAt);return {...i,createdAt,updatedAt};});
 return {orders:ordered(cleanOrders),items:ordered(cleanItems)};
}
function validateReconciliation(record,data){
 keys(record,"format kind runId inventoryDigest reconciledAt database migrationChecksums records snapshot purpose");assert.equal(record.format,1);assert.equal(record.kind,"failed_order_cleanup_reconciliation");
 assert.equal(record.runId,failedOrderRun);assert.equal(record.inventoryDigest,data.inventoryDigest);timestamp(record.reconciledAt);assert.ok(record.reconciledAt>=data.inventory.createdAt&&Date.parse(record.reconciledAt)<=Date.now());
 assert.equal(record.database,"stitchtrack_product_test");assert.deepEqual(record.migrationChecksums,PRODUCT_MIGRATIONS);assert.equal(record.purpose,"cleanup authorization snapshot only; not a successful API proof receipt");
 keys(record.records,"orders items");keys(record.snapshot[0],"table count digest");assert.deepEqual(record.snapshot.map(s=>s.table),allTables);
 for(const row of record.snapshot){keys(row,"table count digest");assert.ok(Number.isInteger(row.count)&&row.count>=0&&row.count<=10000);assert.match(row.digest,/^[0-9a-f]{32}$/u);}
 assert.deepEqual(verifyRecords(data,record.records.orders.map(o=>({...o,createdAt:new Date(o.createdAt),updatedAt:new Date(o.updatedAt)})),record.records.items.map(o=>({...o,createdAt:new Date(o.createdAt),updatedAt:new Date(o.updatedAt)}))),record.records);
}
async function fullSnapshot(db){
 const rows=await orderApiSnapshot(db,[],[]);
 for(const table of ["AuthRateBucket","_prisma_migrations"]){const count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"')).rows[0].count;assert.ok(Number.isInteger(count)&&count>=0&&count<=10000);
  const digest=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t')).rows[0].digest;assert.match(digest,/^[0-9a-f]{32}$/u);rows.push({table,count,digest});}
 return rows.sort((a,b)=>a.table<b.table?-1:a.table>b.table?1:0);
}
function failure(status,stage,error,attempted,commitConfirmed=false){return {status,runId:failedOrderRun,stage:stages.has(stage)?stage:"internal",noAutomaticRetry:true,commitConfirmed,
 deletedOrders:commitConfirmed?2:status==="unconfirmed"?null:0,deletedItems:commitConfirmed?11:status==="unconfirmed"?null:0,attemptedDeletions:attempted,...(codes.has(error?.code)?{sqlstate:error.code}:{})};}
export async function runFailedOrderCleanup(config,{db,read=path=>privateReceipt.read(path),save=(path,value)=>privateReceipt.write(path,value),inspect=inspectMetadata,report=()=>{}}={}){
 let stage="receipts",tx=false,commitAttempted=false,commitConfirmed=false,rollbackAttempted=false,outcome,data;
 const attempted={orders:0,items:0};
 try{
  // Owner-only files are read once, validated and digest-bound before any connection.
  data=validateFailedOrderInventory(read(config.inventoryPath),config);
  const {inventory,ids,itemIds,validIds,validItemIds}=data;
  const reconciliation=config.execute?read(config.reconciliationPath):null;
  if(config.execute){validateReconciliation(reconciliation,data);assert.equal(config.reconciliationDigest,hash(reconciliation));}
  stage="connection";if(!db){const {Client}=await import("pg");db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}
  db.on?.("error",()=>{});await db.connect();report({status:"started",runId:failedOrderRun,mode:config.execute?"execute":"preflight"});
  stage="begin";tx=true;await db.query(config.execute?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='7s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS host,
   host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  assert.ok(identity.version>=160000&&identity.version<170000);delete identity.version;
  assert.deepEqual(identity,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",safe:true});
  const fixtures=async()=>{
   const owners=[];for(const i of [0,1,2]){
    const {rows:[row]}=await db.query(`SELECT b."primaryOwnerUserId" AS owner FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
     JOIN product."User" u ON u."id"=b."primaryOwnerUserId" JOIN product."Client" c ON c."businessId"=b."id" WHERE b."id"=$1 AND c."id"=$2::uuid
     AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
     AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[inventory.businesses[i===2?1:0],inventory.clients[i]]);
    assert.ok(row&&typeof row.owner==="string"&&row.owner);owners.push(row.owner);
   }assert.equal(owners[0],owners[1]);assert.notEqual(owners[0],owners[2]);return [...new Set(owners)];
  };
  stage="fixtures";const owners=await fixtures();
  if(config.execute){stage="row_locks";
   const users=(await db.query('SELECT "id" FROM product."User" WHERE "id"=ANY($1::text[]) ORDER BY "id" COLLATE "C" FOR UPDATE',[owners])).rows;
   assert.deepEqual(users.map(r=>r.id).sort(),[...owners].sort());
   const clients=(await db.query('SELECT "id" FROM product."Client" WHERE "id"=ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',[inventory.clients])).rows;
   assert.deepEqual(clients.map(r=>r.id).sort(),[...inventory.clients].sort());
   for(const [table,expected]of [["Order",validIds],["OrderItem",validItemIds]]){
    const rows=(await db.query('SELECT "id" FROM product."'+table+'" WHERE "id"=ANY($1::uuid[]) ORDER BY "id" FOR UPDATE',[expected])).rows;
    assert.deepEqual(rows.map(r=>r.id),[...expected].sort());
   }
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
  stage="references";
  for(const ref of inventory.references){const {rows}=await db.query('SELECT "id","businessId","clientId","versionNumber" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[ref.id]);
   const {purpose,...expected}=ref;assert.deepEqual(rows,[expected]);}
  stage="baseline";assert.deepEqual(await orderApiSnapshot(db,ids,itemIds),inventory.baseline);const before=await fullSnapshot(db);
  stage="orders";const {rows:orderRows}=await db.query('SELECT "id","businessId","clientId","createdAt","updatedAt" FROM product."Order" WHERE "id"=ANY($1::uuid[]) ORDER BY "id"',[ids]);
  stage="items";const {rows:itemRows}=await db.query(`SELECT "id","orderId","clientId",encode(convert_to("description",'UTF8'),'hex') AS description_hex,"measurementVersionId","createdAt","updatedAt"
   FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) OR "orderId"=ANY($2::uuid[]) ORDER BY "id"`,[itemIds,ids]);
  stage="contents";const records=verifyRecords(data,orderRows,itemRows);
  if(config.execute){stage="reconciliation_match";assert.deepEqual(records,reconciliation.records);assert.deepEqual(before,reconciliation.snapshot);}
  else data.reconciliation={format:1,kind:"failed_order_cleanup_reconciliation",runId:failedOrderRun,inventoryDigest:data.inventoryDigest,
   reconciledAt:new Date().toISOString(),database:"stitchtrack_product_test",migrationChecksums:PRODUCT_MIGRATIONS,records,snapshot:before,
   purpose:"cleanup authorization snapshot only; not a successful API proof receipt"};
  if(config.execute){
   stage="delete_items";const deletedItems=await db.query(`DELETE FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) AND "orderId"=ANY($2::uuid[]) AND "clientId"=$3::uuid`,[validItemIds,validIds,inventory.clients[0]]);
   attempted.items=deletedItems.rowCount;assert.equal(attempted.items,11);
   stage="delete_orders";const deletedOrders=await db.query('DELETE FROM product."Order" WHERE "id"=ANY($1::uuid[]) AND "businessId"=$2 AND "clientId"=$3::uuid',[validIds,inventory.businesses[0],inventory.clients[0]]);
   attempted.orders=deletedOrders.rowCount;assert.equal(attempted.orders,2);
   stage="verify_absence";assert.equal((await db.query('SELECT 1 FROM product."Order" WHERE "id"=ANY($1::uuid[])',[ids])).rowCount,0);
   assert.equal((await db.query('SELECT 1 FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) OR "orderId"=ANY($2::uuid[])',[itemIds,ids])).rowCount,0);
   stage="snapshot_after";assert.deepEqual(await orderApiSnapshot(db,ids,itemIds),inventory.baseline);
   const after=await fullSnapshot(db);assert.deepEqual(after.filter(s=>!["Order","OrderItem"].includes(s.table)),before.filter(s=>!["Order","OrderItem"].includes(s.table)));
   for(const [table,count]of [["Order",2],["OrderItem",11]])assert.equal(after.find(r=>r.table===table).count,before.find(r=>r.table===table).count-count);
   stage="commit";commitAttempted=true;const committed=await db.query("COMMIT");assert.equal(committed.command,"COMMIT");commitConfirmed=true;tx=false;
   outcome={status:"cleaned",runId:failedOrderRun,commitConfirmed:true,deletedOrders:2,deletedItems:11,noAutomaticRetry:true};
  }else{
   stage="rollback";rollbackAttempted=true;const rolled=await db.query("ROLLBACK");assert.equal(rolled.command,"ROLLBACK");tx=false;
   outcome={status:"preflight_passed",runId:failedOrderRun,inventoryDigest:data.inventoryDigest,reconciliationDigest:hash(data.reconciliation),expectedDeletions:{orders:2,items:11},deletedOrders:0,deletedItems:0,noAutomaticRetry:true};
  }
 }catch(error){
  let rolledBack=false,rollbackFailed=false;
  if(tx&&!rollbackAttempted)try{rollbackAttempted=true;const rolled=await db.query("ROLLBACK");rolledBack=rolled.command==="ROLLBACK";if(!rolledBack)rollbackFailed=true;}catch{rollbackFailed=true;}
  else if(tx)rollbackFailed=true;
  const status=commitAttempted||rollbackFailed?"unconfirmed":rolledBack?"failed_rolled_back":"refused";
  outcome=failure(status,stage,error,attempted,commitConfirmed);if(rollbackFailed)outcome.rollbackFailed=true;
 }finally{if(db)try{await db.end();}catch(error){if(outcome?.status==="preflight_passed"||outcome?.status==="cleaned")outcome=failure(commitConfirmed?"failed_after_commit":"refused","connection_cleanup",error,attempted,commitConfirmed);else outcome.connectionCleanupFailed=true;}}
 if(outcome?.status==="preflight_passed")try{stage="reconciliation_save";save(config.reconciliationPath,data.reconciliation);}
 catch(error){outcome=failure("refused",stage,error,attempted);}
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runFailedOrderCleanup(authorizeFailedOrderCleanup(process.argv.slice(2),process.env),{report:value=>console.log(JSON.stringify(value))});}
 catch(error){result=failure("refused","authorization",error,{orders:0,items:0});}
 console.log(JSON.stringify(result));if(!["preflight_passed","cleaned"].includes(result.status))process.exitCode=1;
}
