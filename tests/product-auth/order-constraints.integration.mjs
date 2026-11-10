// OWNER ONLY. Inert on import. All synthetic work is rollback-only; no COMMIT path.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {schemaMetadata as measurementMetadata,applicationPrivileges as measurementPrivileges,measurementConstraintFailureDetails} from "./measurement-constraints.integration.mjs";
const tables=["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Order","OrderItem","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort();
const descriptions=[["description_null",null,"23502"],["description_empty",""],["description_blank"," "],["description_nel","\u0085"],["description_leading"," Agbada"],["description_trailing","Agbada "],["description_unicode_trim","\u00a0Agbada\ufeff"],["description_501","\u{1f9f5}".repeat(501)]];
const stages=new Set(["internal","authorization","fixture_authorization","database_configuration","migration_files","dependency_initialization","connection","begin","transaction_settings","connection_identity","schema_tables","table_locks","migration_history","schema_metadata","measurement_metadata","application_privileges","fixture_businesses","snapshot_before","savepoint_work","synthetic_clients","synthetic_measurements","valid_orders","valid_items","order_cross_business","order_missing_client","order_invalid_uuid","item_wrong_client","item_missing_order","measurement_other_business","measurement_other_client","measurement_missing","measurement_invalid_update","description_one","description_500","restrict_order_delete","restrict_order_update","restrict_measurement_delete","restrict_client_delete","stored_rows","rollback_expected_failure","rollback_work","snapshot_after","rollback","connection_cleanup",...descriptions.map(c=>c[0])]);
export function orderConstraintFailureDetails(stage,error){const safe=measurementConstraintFailureDetails("internal",error);return {stage:stages.has(stage)?stage:"internal",...(safe.sqlstate?{sqlstate:safe.sqlstate}:{})};}
class Failure extends Error{constructor(stage,error){super("Order integrity proof failed.");this.details=orderConstraintFailureDetails(stage,error);}}
const detail=(stage,error)=>error instanceof Failure?error.details:orderConstraintFailureDetails(stage,error);
export function authorizeOrderConstraints(args,env){
 if(args.length!==1||args[0]!=="--owner-order-constraints"||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||
  env.PRODUCT_ORDER_CONSTRAINT_CHECK_CONFIRMED!=="true"||env.PRODUCT_ORDER_CONSTRAINT_FIXTURES_CONFIRMED!=="true"||
  ["NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new Failure("authorization");
 const businesses=[env.PRODUCT_ORDER_CONSTRAINT_BUSINESS_A_ID,env.PRODUCT_ORDER_CONSTRAINT_BUSINESS_B_ID];
 if(businesses.some(id=>typeof id!=="string"||!id||id!==id.trim()||id.length>200||/[\x00-\x1f\x7f]/u.test(id))||businesses[0]===businesses[1])throw new Failure("fixture_authorization");
 let target;
 try{target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");}catch(e){throw new Failure("database_configuration",e);}
 try{assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),"20261109_order_items");}catch(e){throw new Failure("migration_files",e);}
 return {target,businesses};
}
async function snapshot(db){
 const result=[];
 for(const table of tables){
  const {rows:[size]}=await db.query('SELECT count(*)::int AS count FROM product."'+table+'"');assert.ok(Number.isInteger(size.count)&&size.count>=0&&size.count<=10000);
  const {rows:[hash]}=await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t');
  assert.equal(typeof hash.digest,"string");result.push({table,count:size.count,digest:hash.digest});
 }return result;
}
// Exact reviewed column order/types/defaults; no extra writable or generated columns.
async function metadata(db){
 const {rows:columns}=await db.query(`SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,
  pg_get_expr(d.adbin,d.adrelid) AS default_value,a.attidentity AS identity,a.attgenerated AS generated
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='product' AND c.relname IN ('Order','OrderItem') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname COLLATE "C",a.attnum`);
 const expected={Order:[["id","uuid"],["businessId","text"],["clientId","uuid"],["createdAt","timestamp(3) with time zone"],["updatedAt","timestamp(3) with time zone"]],OrderItem:[["id","uuid"],["orderId","uuid"],["clientId","uuid"],["description","text"],["measurementVersionId","uuid"],["createdAt","timestamp(3) with time zone"],["updatedAt","timestamp(3) with time zone"]]};
 assert.deepEqual(columns,Object.entries(expected).flatMap(([table_name,cols])=>cols.map(([name,type])=>({table_name,name,type,required:name!=="measurementVersionId",default_value:name==="createdAt"?"CURRENT_TIMESTAMP":null,identity:"",generated:""}))));
 const {rows:[behavior]}=await db.query(`SELECT
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=ANY($1::regclass[]) AND NOT tgisinternal) AS no_triggers,
  NOT EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class=ANY($1::regclass[])) AS no_rules,
  NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY($1::regclass[]) AND (relrowsecurity OR relforcerowsecurity OR relispartition)) AS plain_tables,
  NOT EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=ANY($1::regclass[]) OR inhparent=ANY($1::regclass[])) AS no_inheritance,
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid=ANY($1::regclass[]) AND NOT (
   (conrelid='product."MeasurementVersion"'::regclass AND confrelid='product."Client"'::regclass AND conname='MeasurementVersion_businessId_clientId_fkey') OR
   (conrelid='product."MeasurementEntry"'::regclass AND confrelid='product."MeasurementVersion"'::regclass AND conname='MeasurementEntry_measurementVersionId_fkey') OR
   (conrelid='product."Order"'::regclass AND confrelid='product."Client"'::regclass AND conname='Order_businessId_clientId_fkey') OR
   (conrelid='product."OrderItem"'::regclass AND confrelid='product."Order"'::regclass AND conname='OrderItem_orderId_clientId_fkey') OR
   (conrelid='product."OrderItem"'::regclass AND confrelid='product."MeasurementVersion"'::regclass AND conname='OrderItem_clientId_measurementVersionId_fkey')
  )) AS no_unexpected_dependents`,[['product."Client"','product."MeasurementVersion"','product."MeasurementEntry"','product."Order"','product."OrderItem"']]);
 assert.deepEqual(behavior,{no_triggers:true,no_rules:true,plain_tables:true,no_inheritance:true,no_unexpected_dependents:true});
 const {rows:constraints}=await db.query(`SELECT conrelid::regclass::text AS target,conname AS name,contype AS type,convalidated AS valid,condeferrable AS deferred,
  confrelid::regclass::text AS parent,confdeltype AS deletion,confupdtype AS update,confmatchtype AS match,
  ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(num,position) JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.num ORDER BY k.position) AS keys,
  ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(num,position) JOIN pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.num ORDER BY k.position) AS parent_keys,
  pg_get_expr(conbin,conrelid) AS expression FROM pg_constraint WHERE conrelid=ANY($1::regclass[]) ORDER BY conname COLLATE "C"`,[['product."Order"','product."OrderItem"']]);
 // Unique reference indexes are standalone indexes, not extra UNIQUE constraints.
 assert.deepEqual(constraints.map(c=>c.name).sort(),["Order_pkey","Order_businessId_clientId_fkey","OrderItem_pkey","OrderItem_description_check","OrderItem_orderId_clientId_fkey","OrderItem_clientId_measurementVersionId_fkey"].sort());
 for(const c of constraints){assert.equal(c.valid,true);assert.equal(c.deferred,false);}
 for(const [name,target,parent,keys,parent_keys]of [
  ["Order_businessId_clientId_fkey","Order","Client",["businessId","clientId"],["businessId","id"]],
  ["OrderItem_orderId_clientId_fkey","OrderItem","Order",["orderId","clientId"],["id","clientId"]],
  ["OrderItem_clientId_measurementVersionId_fkey","OrderItem","MeasurementVersion",["clientId","measurementVersionId"],["clientId","id"]]]){
  const c=constraints.find(c=>c.name===name);assert.equal(c.type,"f");assert.equal(c.target,'product."'+target+'"');assert.equal(c.parent,'product."'+parent+'"');
  assert.equal(c.deletion,"r");assert.equal(c.update,"r");assert.equal(c.match,"s");assert.deepEqual(c.keys,keys);assert.deepEqual(c.parent_keys,parent_keys);assert.equal(c.expression,null);
 }
 for(const n of ["Order","OrderItem"]){const c=constraints.find(c=>c.name===n+"_pkey");assert.equal(c.type,"p");assert.equal(c.target,'product."'+n+'"');assert.deepEqual(c.keys,["id"]);}
 const description=constraints.find(c=>c.name==="OrderItem_description_check");assert.equal(description.type,"c");assert.equal(description.target,'product."OrderItem"');assert.deepEqual(description.keys,["description"]);
 // PostgreSQL deparses BETWEEN as >= / <=. Preserve the literal whitespace bytes while
 // accepting irrelevant parentheses/identifier quoting/casts outside that one literal.
 const parts=description.expression.split("'");assert.equal(parts.length,3);assert.equal(parts[1],"\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff");
 const outside=s=>s.replace(/::text|[\s()"]/gu,"");
 assert.equal(outside(parts[0]),"char_lengthdescription>=1ANDchar_lengthdescription<=500ANDdescription=btrimdescription,");assert.equal(outside(parts[2]),"");
 const {rows:indexes}=await db.query(`SELECT c.relname AS name,i.indrelid::regclass::text AS target,i.indisunique AS unique,i.indisvalid AS valid,i.indisready AS ready,
  i.indpred IS NULL AND i.indexprs IS NULL AS plain,i.indnkeyatts=i.indnatts AS no_included,i.indnullsnotdistinct AS nulls_not_distinct,am.amname AS method,
  ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,position) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.position) AS keys,
  ARRAY(SELECT v::int FROM unnest(i.indoption) v) AS options
  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
  WHERE i.indrelid=ANY($1::regclass[]) OR i.indexrelid='product."MeasurementVersion_clientId_id_key"'::regclass`,[['product."Order"','product."OrderItem"']]);
 const keys={Order_pkey:["Order",true,["id"]],Order_id_clientId_key:["Order",true,["id","clientId"]],Order_businessId_createdAt_id_idx:["Order",false,["businessId","createdAt","id"]],Order_businessId_clientId_createdAt_id_idx:["Order",false,["businessId","clientId","createdAt","id"]],OrderItem_pkey:["OrderItem",true,["id"]],OrderItem_orderId_createdAt_id_idx:["OrderItem",false,["orderId","createdAt","id"]],OrderItem_clientId_measurementVersionId_idx:["OrderItem",false,["clientId","measurementVersionId"]],MeasurementVersion_clientId_id_key:["MeasurementVersion",true,["clientId","id"]]};
 assert.equal(indexes.length,8);
 for(const [name,[table,unique,cols]]of Object.entries(keys))assert.deepEqual(indexes.find(i=>i.name===name),{name,target:'product."'+table+'"',unique,valid:true,ready:true,plain:true,no_included:true,nulls_not_distinct:false,method:"btree",keys:cols,options:cols.map(()=>0)});
}
async function privileges(db){
 await measurementPrivileges(db);
 for(const [table,editable]of [["Order",[]],["OrderItem",["description","measurementVersionId","updatedAt"]]]){
  const {rows:[flags]}=await db.query(`SELECT has_table_privilege($1::text,$2::text,'SELECT') AS readable,
   has_table_privilege($1::text,$2::text,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS broad,
   CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stitchtrack_product_test_cleanup') THEN
    (has_table_privilege('stitchtrack_product_test_cleanup',$2::text,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
     has_any_column_privilege('stitchtrack_product_test_cleanup',$2::text,'SELECT,INSERT,UPDATE,REFERENCES')) ELSE false END AS cleanup_access`,["stitchtrack_product_test_app",'product."'+table+'"']);
  assert.deepEqual(flags,{readable:true,broad:false,cleanup_access:false});
  const {rows:columns}=await db.query(`SELECT attname AS name,has_column_privilege($1::text,$2::text,attname,'SELECT') AS readable,
   has_column_privilege($1::text,$2::text,attname,'INSERT') AS insertable,has_column_privilege($1::text,$2::text,attname,'UPDATE') AS editable,
   has_column_privilege($1::text,$2::text,attname,'REFERENCES') AS referencable
   FROM pg_attribute WHERE attrelid=$2::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`,["stitchtrack_product_test_app",'product."'+table+'"']);
  const names=table==="Order"?["id","businessId","clientId","createdAt","updatedAt"]:["id","orderId","clientId","description","measurementVersionId","createdAt","updatedAt"];
  assert.deepEqual(columns,names.map(name=>({name,readable:true,insertable:true,editable:editable.includes(name),referencable:false})));
 }
}
export async function runOrderConstraintChecks({target,businesses},providedClient){
 let db=providedClient,stage="dependency_initialization",transaction=false,checks=0,connectionFault;
 const failures=[],counts={clients:0,measurementVersions:0,measurementEntries:0,orders:0,items:0};
 try{
  if(!db){const {Client}=await import("pg");db=new Client({connectionString:target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:10000,application_name:"stitchtrack-order-integrity-proof"});}
  db.on?.("error",error=>{connectionFault=error;});
  stage="connection";await db.connect();stage="begin";transaction=true;await db.query("BEGIN");
  stage="transaction_settings";await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="connection_identity";
  const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,
   current_setting('port') AS port,current_setting('TimeZone') AS timezone,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  assert.ok(identity?.version>=160000&&identity.version<170000);const {version,...rest}=identity;
  assert.deepEqual(rest,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",safe:true});
  stage="schema_tables";
  const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
  assert.deepEqual(actual,tables.map(name=>({name,kind:"r",owner:target.user})));
  const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated_history FROM pg_catalog.pg_namespace WHERE nspname='product'`);
  assert.deepEqual(schema,{owner:target.user,isolated_history:true});
  stage="table_locks";await db.query('LOCK TABLE '+tables.map(t=>'product."'+t+'"').join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  stage="migration_history";
  const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations');
  assert.equal(history.length,10);assert.deepEqual(history.map(r=>r.migration_name).sort(),Object.keys(PRODUCT_MIGRATIONS).sort());
  assert.ok(history.every(r=>r.checksum===PRODUCT_MIGRATIONS[r.migration_name]&&r.finished_at&&!r.rolled_back_at&&r.logs===null&&r.applied_steps_count===1));
  stage="schema_metadata";await metadata(db);stage="measurement_metadata";await measurementMetadata(db);stage="application_privileges";await privileges(db);
  stage="fixture_businesses";const owners=[];
  for(const id of businesses){
   const {rows}=await db.query(`SELECT b."primaryOwnerUserId" AS owner FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId" JOIN product."User" u ON u."id"=b."primaryOwnerUserId"
    WHERE b."id"=$1 AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[id]);
   assert.equal(rows.length,1);assert.equal(typeof rows[0].owner,"string");assert.ok(rows[0].owner);owners.push(rows[0].owner);
  }assert.notEqual(owners[0],owners[1]);
  stage="snapshot_before";const before=await snapshot(db);
  stage="savepoint_work";await db.query("SAVEPOINT order_work");
  stage="synthetic_clients";const clients=[0,0,1].map(i=>({id:randomUUID(),businessId:businesses[i]}));
  for(const c of clients){const r=await db.query(`INSERT INTO product."Client" ("id","businessId","fullName","phone","email","updatedAt") VALUES ($1::uuid,$2,'Synthetic Order Proof',NULL,NULL,transaction_timestamp()) RETURNING "id","businessId"`,[c.id,c.businessId]);assert.deepEqual(r.rows,[c]);counts.clients++;}
  stage="synthetic_measurements";const versions=[];
  for(const c of clients){const id=randomUUID();const r=await db.query(`INSERT INTO product."MeasurementVersion" ("id","businessId","clientId","versionNumber","unit") VALUES ($1::uuid,$2,$3::uuid,1,'cm') RETURNING "id"`,[id,c.businessId,c.id]);assert.deepEqual(r.rows,[{id}]);counts.measurementVersions++;
   assert.equal((await db.query(`INSERT INTO product."MeasurementEntry" ("measurementVersionId","name","value") VALUES ($1::uuid,'Chest',40.25)`,[id])).rowCount,1);counts.measurementEntries++;versions.push(id);}
  const order=async(client=clients[0],id=randomUUID())=>{const r=await db.query(`INSERT INTO product."Order" ("id","businessId","clientId","updatedAt") VALUES ($1::uuid,$2,$3::uuid,transaction_timestamp()) RETURNING "id","businessId","clientId"`,[id,client.businessId,client.id]);assert.deepEqual(r.rows,[{id,businessId:client.businessId,clientId:client.id}]);counts.orders++;return id;};
  stage="valid_orders";const first=await order(),second=await order();assert.notEqual(first,second);checks++;
  const item=async(description="Agbada with inside pocket",patch={})=>{const v={id:randomUUID(),orderId:first,clientId:clients[0].id,description,measurementVersionId:versions[0],...patch};
   const r=await db.query(`INSERT INTO product."OrderItem" ("id","orderId","clientId","description","measurementVersionId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,transaction_timestamp()) RETURNING "id","orderId","clientId","description","measurementVersionId"`,[v.id,v.orderId,v.clientId,v.description,v.measurementVersionId]);assert.deepEqual(r.rows,[v]);counts.items++;return v.id;};
  stage="valid_items";const selected=await item();await item("Two-piece outfit",{measurementVersionId:null});await item("Shirt",{orderId:second});checks++;
  const reject=async(action,code,constraints)=>{
   await db.query("SAVEPOINT expected_failure");let error;
   try{await action();}catch(e){error=e;}
   try{await db.query("ROLLBACK TO SAVEPOINT expected_failure");await db.query("RELEASE SAVEPOINT expected_failure");}catch(e){throw new Failure("rollback_expected_failure",e);}
   try{assert.ok(error);assert.equal(error.code,code);if(constraints)assert.ok([constraints].flat().includes(error.constraint));}
   catch(e){throw new Failure(stage,error??e);}checks++;
  };
  stage="order_cross_business";await reject(()=>order({...clients[0],businessId:businesses[1]}),"23503","Order_businessId_clientId_fkey");
  stage="order_missing_client";await reject(()=>order({id:randomUUID(),businessId:businesses[0]}),"23503","Order_businessId_clientId_fkey");
  stage="order_invalid_uuid";await reject(()=>order(clients[0],"not-a-uuid"),"22P02");
  stage="item_wrong_client";await reject(()=>item("Wrong Client",{clientId:clients[1].id,measurementVersionId:null}),"23503","OrderItem_orderId_clientId_fkey");
  stage="item_missing_order";await reject(()=>item("No Order",{orderId:randomUUID(),measurementVersionId:null}),"23503","OrderItem_orderId_clientId_fkey");
  for(const [stageName,id]of [["measurement_other_business",versions[2]],["measurement_other_client",versions[1]],["measurement_missing",randomUUID()]]){
   stage=stageName;await reject(()=>item("Invalid selection",{measurementVersionId:id}),"23503","OrderItem_clientId_measurementVersionId_fkey");}
  stage="measurement_invalid_update";await reject(()=>db.query('UPDATE product."OrderItem" SET "measurementVersionId"=$1::uuid WHERE "id"=$2::uuid',[versions[1],selected]),"23503","OrderItem_clientId_measurementVersionId_fkey");
  for(const [stageName,value,code="23514"]of descriptions){stage=stageName;await reject(()=>item(value),code,code==="23514"?"OrderItem_description_check":undefined);}
  stage="description_one";await item("A");checks++;stage="description_500";await item("\u{1f9f5}".repeat(500));checks++;
  stage="restrict_order_delete";await reject(()=>db.query('DELETE FROM product."Order" WHERE "id"=$1::uuid',[first]),"23503","OrderItem_orderId_clientId_fkey");
  stage="restrict_order_update";await reject(()=>db.query('UPDATE product."Order" SET "id"=$1::uuid WHERE "id"=$2::uuid',[randomUUID(),first]),"23503","OrderItem_orderId_clientId_fkey");
  stage="restrict_measurement_delete";await reject(()=>db.query('DELETE FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[versions[0]]),"23503",["OrderItem_clientId_measurementVersionId_fkey","MeasurementEntry_measurementVersionId_fkey"]);
  stage="restrict_client_delete";await reject(()=>db.query('DELETE FROM product."Client" WHERE "id"=$1::uuid',[clients[0].id]),"23503",["Order_businessId_clientId_fkey","MeasurementVersion_businessId_clientId_fkey"]);
  stage="stored_rows";
  for(const [table,column,ids,expected]of [["Client","id",clients.map(c=>c.id),3],["MeasurementVersion","id",versions,3],["MeasurementEntry","measurementVersionId",versions,3],["Order","clientId",[clients[0].id],2],["OrderItem","clientId",[clients[0].id],5]])assert.equal((await db.query('SELECT count(*)::int AS count FROM product."'+table+'" WHERE "'+column+'"=ANY($1::uuid[])',[ids])).rows[0].count,expected);checks++;
  stage="rollback_work";await db.query("ROLLBACK TO SAVEPOINT order_work");await db.query("RELEASE SAVEPOINT order_work");
  stage="snapshot_after";assert.deepEqual(await snapshot(db),before);checks++;
 }catch(e){failures.push(detail(stage,e));}
 finally{
  if(transaction)try{const r=await db.query("ROLLBACK");assert.equal(r.command,"ROLLBACK");}catch(e){failures.push(detail("rollback",e));}
  if(db)try{await db.end();}catch(e){failures.push(detail("connection_cleanup",e));}
 }
 if(connectionFault)failures.push(detail("connection",connectionFault));
 if(failures.length)return {status:"failed",failures,noAutomaticRetry:true};
 return {status:"passed_rolled_back",checks,syntheticRowsTested:counts,retainedSyntheticRows:0,existingRecords:"unchanged_in_locked_17_table_snapshot",permissionProof:"effective_catalogue_privileges",limitations:["no_runtime_role_connection","no_api_or_tenant_authorization_proof","minimum_item_count_and_creation_atomicity_require_service","no_concurrency_proof"]};
}
// Read-only catalogue checks shared with the restricted-app Orders API proof.
export {metadata as orderSchemaMetadata,privileges as orderApplicationPrivileges};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runOrderConstraintChecks(authorizeOrderConstraints(process.argv.slice(2),process.env));}catch(e){result={status:"failed",failures:[detail("internal",e)],noAutomaticRetry:true};}
 if(result.status==="failed"){console.error(JSON.stringify(result));process.exitCode=1;}else console.log(JSON.stringify(result));
}
