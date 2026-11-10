// OWNER ONLY. Inert import; one browser Order/item, no HTTP, no fixture writes, no retries.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {privateReceipt} from "./measurement-unicode.integration.mjs";
import {orderApiSnapshot} from "./order-api.integration.mjs";
import {measurementApiSnapshotTables} from "./measurement-api.integration.mjs";
import {orderSchemaMetadata,orderApplicationPrivileges} from "./order-constraints.integration.mjs";
import {schemaMetadata as measurementMetadata} from "./measurement-constraints.integration.mjs";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
import {orderDescriptionSchema} from "../../lib/order-contract.ts";
const tables=[...measurementApiSnapshotTables,"Order","OrderItem","AuthRateBucket","_prisma_migrations"].sort();
const snapshotTables=tables.filter(t=>t!=="AuthRateBucket"),hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const keys=(v,s)=>assert.deepEqual(Object.keys(v).sort(),s.split(" ").sort());
const uuid=v=>{assert.equal(clientIdSchema.parse(v),v);assert.equal(v,v.toLowerCase());};
const stamp=v=>assert.ok(typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)&&new Date(v).toISOString()===v);
const modes={"--owner-browser-order-baseline":"baseline","--owner-browser-order-reconcile":"reconcile","--owner-browser-order-cleanup-preflight":"preflight","--owner-browser-order-cleanup-execute":"execute"};
const stages=new Set(["authorization","evidence","connection","begin","identity","fixtures","row_locks","table_locks","schema","migration_history","metadata","protected_version","snapshot","discovery","records","evidence_match","delete_item","delete_order","restoration","commit","rollback","connection_cleanup","evidence_save"]);
const codes=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
export function authorizeBrowserOrder(args,env){
 assert.equal(process.platform,"linux");assert.equal(args.length,1);assert.ok(Object.hasOwn(modes,args[0]));const mode=modes[args[0]];
 assert.equal(env.NODE_ENV,"test");assert.equal(env.PRODUCT_DATABASE_MODE,"test");
 for(const flag of ["CONFIRMED","FIXTURES_CONFIRMED","RATE_TRACKING_CONFIRMED"])assert.equal(env["PRODUCT_BROWSER_ORDER_"+flag],"true");
 assert.ok(!["NODE_OPTIONS","NODE_DEBUG","NODE_USE_ENV_PROXY","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]));
 const target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");
 const baselinePath=env.PRODUCT_BROWSER_ORDER_BASELINE,planPath=env.PRODUCT_BROWSER_ORDER_PLAN;
 for(const p of [baselinePath,...(mode==="baseline"?[planPath]:[])])assert.ok(typeof p==="string"&&isAbsolute(p)&&resolve(p)===p);
 assert.notEqual(planPath,baselinePath);const digests={};let runId;
 if(mode!=="baseline"){
  runId=env.PRODUCT_BROWSER_ORDER_RUN_ID;uuid(runId);
  for(const k of ["BASELINE",...(mode!=="reconcile"?["RECONCILIATION"]:[]),...(mode==="execute"?["PREFLIGHT"]:[])]){
   const d=env["PRODUCT_BROWSER_ORDER_"+k+"_SHA256"];assert.match(d??"",/^[0-9a-f]{64}$/u);digests[k.toLowerCase()]=d;
  }
 }
 if(mode==="execute")assert.equal(env.PRODUCT_BROWSER_ORDER_EXECUTE_CONFIRMED,"true");
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),"20261109_order_items");
 return {mode,target,planPath,baselinePath,reconciliationPath:baselinePath+".reconciled.json",preflightPath:baselinePath+".cleanup.json",runId,digests};
}
function plan(v){
 keys(v,"businessId clientId protectedMeasurementId creation final");assert.ok(typeof v.businessId==="string"&&v.businessId.length>0&&v.businessId.length<=200&&v.businessId===v.businessId.trim()&&!/[\x00-\x1f\x7f]/u.test(v.businessId));
 uuid(v.clientId);uuid(v.protectedMeasurementId);
 for(const item of [v.creation,v.final]){keys(item,"description measurementVersionId");assert.equal(orderDescriptionSchema.parse(item.description),item.description);assert.ok(item.measurementVersionId===null||item.measurementVersionId===v.protectedMeasurementId);}
 return v;
}
function snapshotShape(v){
 assert.deepEqual(v.map(x=>x.table),snapshotTables);
 for(const row of v){keys(row,"table count digest");assert.ok(Number.isInteger(row.count)&&row.count>=0&&row.count<=10000);assert.match(row.digest,/^[0-9a-f]{32}$/u);}
}
function rateShape(v){keys(v,"table count digest");assert.equal(v.table,"AuthRateBucket");assert.ok(Number.isInteger(v.count)&&v.count>=0&&v.count<=10000);assert.match(v.digest,/^[0-9a-f]{32}$/u);}
function baselineShape(v,c){
 keys(v,"format kind runId createdAt database migrationChecksums plan orderIds itemIds snapshot rates");assert.equal(v.format,1);assert.equal(v.kind,"browser_order_baseline");uuid(v.runId);assert.equal(v.runId,c.runId);stamp(v.createdAt);
 assert.equal(v.database,"stitchtrack_product_test");assert.deepEqual(v.migrationChecksums,PRODUCT_MIGRATIONS);plan(v.plan);snapshotShape(v.snapshot);rateShape(v.rates);
 for(const [ids,table]of [[v.orderIds,"Order"],[v.itemIds,"OrderItem"]]){assert.ok(Array.isArray(ids)&&ids.length<=200);ids.forEach(uuid);assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids,[...ids].sort());assert.equal(ids.length,v.snapshot.find(r=>r.table===table).count);}
}
function recordShape(r,b,final=false,initial){
 keys(r,"order item");const {order:o,item:i}=r,p=b.plan;keys(o,"id businessId clientId createdAt updatedAt");keys(i,"id orderId clientId description_hex measurementVersionId createdAt updatedAt");uuid(o.id);uuid(i.id);
 assert.ok(!b.orderIds.includes(o.id)&&!b.itemIds.includes(i.id));assert.equal(o.businessId,p.businessId);assert.equal(o.clientId,p.clientId);assert.equal(i.clientId,p.clientId);assert.equal(i.orderId,o.id);
 const wanted=final?p.final:p.creation;assert.equal(i.description_hex,Buffer.from(wanted.description,"utf8").toString("hex"));assert.equal(i.measurementVersionId,wanted.measurementVersionId);
 for(const time of [o.createdAt,o.updatedAt,i.createdAt,i.updatedAt]){stamp(time);assert.ok(time>=b.createdAt&&Date.parse(time)<=Date.now());}
 assert.equal(o.updatedAt,o.createdAt);assert.equal(i.createdAt,o.createdAt);
 if(!final)assert.equal(i.updatedAt,i.createdAt);
 else {assert.deepEqual(o,initial.order);for(const key of ["id","orderId","clientId","createdAt"])assert.equal(i[key],initial.item[key]);assert.ok(i.updatedAt>=initial.item.updatedAt);
  if(i.description_hex!==initial.item.description_hex||i.measurementVersionId!==initial.item.measurementVersionId)assert.ok(i.updatedAt>initial.item.updatedAt);}
}
function evidenceShape(v,kind,b,baselineDigest,reconciliation){
 keys(v,"format kind runId baselineDigest checkedAt records rates"+(kind==="browser_order_cleanup_preflight"?" reconciliationDigest":""));assert.equal(v.format,1);assert.equal(v.kind,kind);assert.equal(v.runId,b.runId);assert.equal(v.baselineDigest,baselineDigest);stamp(v.checkedAt);assert.ok(v.checkedAt>=b.createdAt&&Date.parse(v.checkedAt)<=Date.now());rateShape(v.rates);
 recordShape(v.records,b,!!reconciliation,reconciliation?.records);
 if(reconciliation)assert.equal(v.reconciliationDigest,hash(reconciliation));
}
async function tableDigest(db,table){
 const count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"')).rows[0].count;
 const digest=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t')).rows[0].digest;
 return {table,count,digest};
}
async function snapshot(db,orderIds=[],itemIds=[]){const rows=await orderApiSnapshot(db,orderIds,itemIds);rows.push(await tableDigest(db,"_prisma_migrations"));rows.sort((a,b)=>a.table<b.table?-1:a.table>b.table?1:0);snapshotShape(rows);return rows;}
async function identifiers(db,table){const ids=(await db.query('SELECT "id" FROM product."'+table+'" ORDER BY "id" LIMIT 202')).rows.map(r=>r.id);assert.ok(ids.length<=201);return ids;}
async function records(db,orderId,itemId){
 const {rows:orders}=await db.query('SELECT "id","businessId","clientId","createdAt","updatedAt" FROM product."Order" WHERE "id"=$1::uuid',[orderId]);
 const {rows:items}=await db.query(`SELECT "id","orderId","clientId",encode(convert_to("description",'UTF8'),'hex') AS description_hex,"measurementVersionId","createdAt","updatedAt"
  FROM product."OrderItem" WHERE "id"=$1::uuid OR "orderId"=$2::uuid ORDER BY "id" LIMIT 2`,[itemId,orderId]);assert.equal(orders.length,1);assert.equal(items.length,1);
 const dates=row=>({...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});return {order:dates(orders[0]),item:dates(items[0])};
}
const inspect=async db=>{await orderSchemaMetadata(db);await measurementMetadata(db);await orderApplicationPrivileges(db);};
export async function runBrowserOrder(c,{db,read=p=>privateReceipt.read(p),save=(p,v)=>privateReceipt.write(p,v),inspectMetadata=inspect}={}){
 let stage="evidence",tx=false,rollbackAttempted=false,commitAttempted=false,commitConfirmed=false,outcome,output;
 const attempted={items:0,orders:0};let b,reconciliation,preflight,p;
 try{
  if(c.mode==="baseline")p=plan(read(c.planPath));
  else {b=read(c.baselinePath);baselineShape(b,c);assert.equal(hash(b),c.digests.baseline);p=b.plan;
   if(c.mode!=="reconcile"){reconciliation=read(c.reconciliationPath);evidenceShape(reconciliation,"browser_order_reconciliation",b,hash(b));assert.equal(hash(reconciliation),c.digests.reconciliation);}
   if(c.mode==="execute"){preflight=read(c.preflightPath);evidenceShape(preflight,"browser_order_cleanup_preflight",b,hash(b),reconciliation);assert.equal(hash(preflight),c.digests.preflight);}
  }
  stage="connection";if(!db){const {Client}=await import("pg");db=new Client({connectionString:c.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}db.on?.("error",()=>{});await db.connect();
  stage="begin";tx=true;await db.query(c.mode==="execute"?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='7s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,
   current_setting('port') AS port,current_setting('TimeZone') AS timezone,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);assert.ok(identity.version>=160000&&identity.version<170000);delete identity.version;
  assert.deepEqual(identity,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",safe:true});
  const fixtures=async()=>{const {rows}=await db.query(`SELECT b."primaryOwnerUserId" AS owner FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
   JOIN product."User" u ON u."id"=b."primaryOwnerUserId" JOIN product."Client" c ON c."businessId"=b."id" WHERE b."id"=$1 AND c."id"=$2::uuid
   AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[p.businessId,p.clientId]);assert.equal(rows.length,1);assert.ok(typeof rows[0].owner==="string"&&rows[0].owner);return rows[0].owner;};
  stage="fixtures";const owner=await fixtures();
  if(c.mode==="execute"){stage="row_locks";const r=preflight.records;
   for(const [sql,params,id]of [['SELECT "id" FROM product."User" WHERE "id"=$1 FOR UPDATE',[owner],owner],['SELECT "id" FROM product."Client" WHERE "id"=$1::uuid AND "businessId"=$2 FOR UPDATE',[p.clientId,p.businessId],p.clientId],
    ['SELECT "id" FROM product."Order" WHERE "id"=$1::uuid AND "businessId"=$2 AND "clientId"=$3::uuid FOR UPDATE',[r.order.id,p.businessId,p.clientId],r.order.id],['SELECT "id" FROM product."OrderItem" WHERE "id"=$1::uuid AND "orderId"=$2::uuid AND "clientId"=$3::uuid FOR UPDATE',[r.item.id,r.order.id,p.clientId],r.item.id]])assert.deepEqual((await db.query(sql,params)).rows,[{id}]);
  }
  stage="table_locks";await db.query('LOCK TABLE '+tables.map(t=>'product."'+t+'"').join(',')+(c.mode==="execute"?' IN SHARE ROW EXCLUSIVE MODE':' IN ACCESS SHARE MODE'));
  stage="schema";const {rows:relations}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);assert.deepEqual(relations,tables.map(name=>({name,kind:"r",owner:c.target.user})));
  assert.deepEqual((await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated FROM pg_namespace WHERE nspname='product'`)).rows,[{owner:c.target.user,isolated:true}]);
  stage="migration_history";const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations');assert.equal(history.length,10);assert.deepEqual(history.map(h=>h.migration_name).sort(),Object.keys(PRODUCT_MIGRATIONS).sort());
  assert.ok(history.every(h=>h.checksum===PRODUCT_MIGRATIONS[h.migration_name]&&h.finished_at instanceof Date&&Number.isFinite(h.finished_at.getTime())&&h.rolled_back_at===null&&h.logs===null&&h.applied_steps_count===1));
  stage="metadata";await inspectMetadata(db);stage="fixtures";assert.equal(await fixtures(),owner);
  stage="protected_version";assert.deepEqual((await db.query('SELECT "id","businessId","clientId","versionNumber" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[p.protectedMeasurementId])).rows,[{id:p.protectedMeasurementId,businessId:p.businessId,clientId:p.clientId,versionNumber:1}]);
  stage="snapshot";const rates=await tableDigest(db,"AuthRateBucket");rateShape(rates);
  const time=(await db.query('SELECT transaction_timestamp()::timestamptz(3) AS time')).rows[0].time.toISOString();stamp(time);
  if(c.mode==="baseline"){
   const orderIds=await identifiers(db,"Order"),itemIds=await identifiers(db,"OrderItem");assert.ok(orderIds.length<=200&&itemIds.length<=200);
   output={format:1,kind:"browser_order_baseline",runId:randomUUID(),createdAt:time,database:"stitchtrack_product_test",migrationChecksums:PRODUCT_MIGRATIONS,plan:p,orderIds,itemIds,snapshot:await snapshot(db),rates};baselineShape(output,{runId:output.runId});
  }else{
   stage="discovery";const orderIds=await identifiers(db,"Order"),itemIds=await identifiers(db,"OrderItem");
   const added=(all,before)=>{assert.ok(before.every(id=>all.includes(id)));const ids=all.filter(id=>!before.includes(id));assert.equal(ids.length,1);return ids[0];};
   const orderId=added(orderIds,b.orderIds),itemId=added(itemIds,b.itemIds);
   stage="snapshot";assert.deepEqual(await snapshot(db,[orderId],[itemId]),b.snapshot);
   stage="records";const actual=await records(db,orderId,itemId);recordShape(actual,b,c.mode!=="reconcile",reconciliation?.records);
   if(c.mode!=="reconcile"){assert.equal(orderId,reconciliation.records.order.id);assert.equal(itemId,reconciliation.records.item.id);}
   if(c.mode==="execute"){
    stage="evidence_match";assert.deepEqual(actual,preflight.records);assert.deepEqual(rates,preflight.rates);
    stage="delete_item";attempted.items=(await db.query('DELETE FROM product."OrderItem" WHERE "id"=$1::uuid AND "orderId"=$2::uuid AND "clientId"=$3::uuid',[itemId,orderId,p.clientId])).rowCount;assert.equal(attempted.items,1);
    stage="delete_order";attempted.orders=(await db.query('DELETE FROM product."Order" WHERE "id"=$1::uuid AND "businessId"=$2 AND "clientId"=$3::uuid',[orderId,p.businessId,p.clientId])).rowCount;assert.equal(attempted.orders,1);
    stage="restoration";assert.deepEqual(await snapshot(db),b.snapshot);assert.deepEqual(await identifiers(db,"Order"),b.orderIds);assert.deepEqual(await identifiers(db,"OrderItem"),b.itemIds);assert.deepEqual(await tableDigest(db,"AuthRateBucket"),rates);
    stage="commit";commitAttempted=true;const committed=await db.query("COMMIT");assert.equal(committed.command,"COMMIT");commitConfirmed=true;tx=false;outcome={status:"cleaned",commitConfirmed:true,deletedOrders:1,deletedItems:1,noAutomaticRetry:true};
   }else output={format:1,kind:c.mode==="reconcile"?"browser_order_reconciliation":"browser_order_cleanup_preflight",runId:b.runId,baselineDigest:hash(b),checkedAt:time,records:actual,rates,...(c.mode==="preflight"?{reconciliationDigest:hash(reconciliation)}:{})};
  }
  if(c.mode!=="execute"){stage="rollback";rollbackAttempted=true;const rolled=await db.query("ROLLBACK");assert.equal(rolled.command,"ROLLBACK");tx=false;outcome={status:c.mode+"_passed",rollbackConfirmed:true,deletedOrders:0,deletedItems:0,noAutomaticRetry:true};}
 }catch(error){
  let rolledBack=false,rollbackFailed=false;if(tx&&!rollbackAttempted)try{rollbackAttempted=true;assert.equal((await db.query("ROLLBACK")).command,"ROLLBACK");rolledBack=true;}catch{rollbackFailed=true;}else if(tx)rollbackFailed=true;
  outcome={status:commitAttempted||rollbackFailed?"unconfirmed":rolledBack?"failed_rolled_back":"refused",stage:stages.has(stage)?stage:"authorization",commitConfirmed,deletedOrders:c.mode==="execute"&&(commitAttempted||rollbackFailed)?null:0,deletedItems:c.mode==="execute"&&(commitAttempted||rollbackFailed)?null:0,noAutomaticRetry:true,...(rollbackFailed?{rollbackFailed:true}:{}),...(codes.has(error?.code)?{sqlstate:error.code}:{})};
 }finally{if(db)try{await db.end();}catch{if(["baseline_passed","reconcile_passed","preflight_passed","cleaned"].includes(outcome?.status))outcome={status:commitConfirmed?"failed_after_commit":"refused",stage:"connection_cleanup",commitConfirmed,deletedOrders:commitConfirmed?1:0,deletedItems:commitConfirmed?1:0,noAutomaticRetry:true};else outcome.connectionCleanupFailed=true;}}
 if(output&&outcome?.rollbackConfirmed)try{save(c.mode==="baseline"?c.baselinePath:c.mode==="reconcile"?c.reconciliationPath:c.preflightPath,output);outcome.evidenceDigest=hash(output);outcome.runId=output.runId;}catch{outcome={status:"refused",stage:"evidence_save",noAutomaticRetry:true,deletedOrders:0,deletedItems:0};}
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runBrowserOrder(authorizeBrowserOrder(process.argv.slice(2),process.env));}catch{result={status:"refused",stage:"authorization",noAutomaticRetry:true};}
 console.log(JSON.stringify(result));if(!["baseline_passed","reconcile_passed","preflight_passed","cleaned"].includes(result.status))process.exitCode=1;
}
