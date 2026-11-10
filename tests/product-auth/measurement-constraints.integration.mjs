// OWNER ONLY. Inert on import. Synthetic measurement inserts only; unconditional rollback, never COMMIT.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const tables=["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort();
const labelRejected=[
 ["label_null",null,"23502"],["label_empty",""],["label_space"," "],["label_nbsp","\u00a0"],["label_nel","\u0085"],
 ["label_61","\u{1f9f5}".repeat(61)],["label_leading_space"," Hip"],["label_trailing_bom","Hip\ufeff"],["label_unicode_trim","\u00a0Hip"],
];
const numericCases=[
 ["value_minimum","0.01",true],["value_ordinary","45.25",true],["value_near_maximum","999.99",true],["value_maximum","1000.00",true],
 ["value_zero","0",false],["value_negative","-1",false],["value_above_maximum","1000.01",false],
 ["value_excess_precision","1.001",false],["value_tiny","0.001",false],["value_trailing_scale","1.000",false],
 ["value_nan","NaN",false],["value_infinity","Infinity",false],["value_negative_infinity","-Infinity",false],
];
const unicodeCases=[
 ["ordinary_case","Chest","CHEST",true],["accented_case","\u00c9paule","\u00e9PAULE",true],
 ["yoruba_case","\u00ccB\u00c0D\u00cd","\u00ecb\u00e0d\u00ed",true],
 ["canonical_forms","\u00e9paule","e\u0301paule",true],
 ["multiple_accents","e\u0323\u0302","e\u0302\u0323",true],
 ["accent_distinction","Epaule","\u00e9paule",false],["yoruba_accent_distinction","\u00ecb\u00e0d\u00ed","\u00ecb\u00e1d\u00ed",false],
 ["turkish_dotless_i","I","\u0131"],["turkish_dotted_i","\u0130","i"],
 ["greek_final_sigma","\u03c3","\u03c2"],["sharp_s","Stra\u00dfe","STRASSE"],
];
const stages=new Set(["internal","authorization","fixture_authorization","database_configuration","migration_files","dependency_initialization",
 "connection","begin","transaction_settings","connection_identity","schema_tables","table_locks","migration_history","schema_metadata","application_privileges",
 "fixture_pairs","snapshot_before","version_allocation","savepoint_work","version_valid","version_independent","version_other_client","version_uuid_invalid",
 "version_uuid_null","version_duplicate_id","version_cross_business","version_orphan_lookup","version_orphan_client","version_zero","version_negative",
 "version_duplicate_number","unit_invalid","unit_uppercase","unit_null","entry_orphan_lookup","entry_orphan","label_flexible","label_one","label_60",
 "label_exact_duplicate","label_other_version","value_null","multiple_entries","stored_rows","rollback_work","rollback_rows","snapshot_after",
 "rollback_expected_failure","rollback","connection_cleanup",...labelRejected.map(c=>c[0]),...numericCases.map(c=>c[0]),...unicodeCases.map(c=>c[0])]);
const sqlstates=new Set(["08000","08001","08003","08006","08007","08P01","28000","28P01","3D000","3F000","42501","42P01","42703","42704",
 "42601","42883","42804","22003","22021","22P02","23502","23503","23505","23514","25P02","25P03","57014","55P03","40P01","40001","53300"]);
export const measurementConstraintFailureDetails=(stage,error)=>({stage:stages.has(stage)?stage:"internal",...(sqlstates.has(error?.code)?{sqlstate:error.code}:{})});
class ProofFailure extends Error{constructor(stage,error){super("Measurement constraint proof failed.");this.details=measurementConstraintFailureDetails(stage,error);}}
const detailsOf=(stage,error)=>error instanceof ProofFailure?error.details:measurementConstraintFailureDetails(stage,error);
export function authorizeMeasurementConstraints(args,env){
 if(args.length!==1||args[0]!=="--owner-measurement-constraints"||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||
  env.PRODUCT_MEASUREMENT_CONSTRAINT_CHECK_CONFIRMED!=="true"||env.PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED!=="true"||
  ["NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new ProofFailure("authorization");
 const fixtures=["A","B"].map(suffix=>({businessId:env["PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_"+suffix+"_ID"],clientId:env["PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_"+suffix+"_ID"]}));
 if(fixtures.some(f=>typeof f.businessId!=="string"||!f.businessId||f.businessId!==f.businessId.trim()||f.businessId.length>200||/[\x00-\x1f\x7f]/u.test(f.businessId)||
  typeof f.clientId!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(f.clientId))||
  fixtures[0].businessId===fixtures[1].businessId||fixtures[0].clientId.toLowerCase()===fixtures[1].clientId.toLowerCase())throw new ProofFailure("fixture_authorization");
 for(const f of fixtures)f.clientId=f.clientId.toLowerCase();
 let target;
 try{target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");}
 catch(error){throw new ProofFailure("database_configuration",error);}
 try{assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);}
 catch(error){throw new ProofFailure("migration_files",error);}
 return {target,fixtures};
}
export async function snapshot(db){
 const result=[];
 for(const table of tables){
  const {rows:[size]}=await db.query('SELECT count(*)::int AS count FROM product."'+table+'"');
  assert.ok(Number.isInteger(size.count)&&size.count>=0&&size.count<=10000);
  const {rows:[digest]}=await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t');
  assert.equal(typeof digest.digest,"string");result.push({table,count:size.count,digest:digest.digest});
 }
 return result;
}
export async function schemaMetadata(db){
 const {rows:columns}=await db.query(`SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='product' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname COLLATE "C",a.attnum`,[["MeasurementEntry","MeasurementVersion"]]);
 assert.deepEqual(columns,[...[["measurementVersionId","uuid"],["name","text"],["value","numeric"]].map(([name,type])=>({table_name:"MeasurementEntry",name,type,required:true})),
  ...[["id","uuid"],["businessId","text"],["clientId","uuid"],["versionNumber","integer"],["unit","text"],["recordedAt","timestamp(3) with time zone"]].map(([name,type])=>({table_name:"MeasurementVersion",name,type,required:true}))]);
 const {rows:[collation]}=await db.query(`SELECT a.attcollation='pg_catalog."default"'::regcollation AS default_label_collation
  FROM pg_attribute a WHERE a.attrelid='product."MeasurementEntry"'::regclass AND a.attname='name' AND NOT a.attisdropped`);
 assert.deepEqual(collation,{default_label_collation:true});
 const {rows:[triggers]}=await db.query(`SELECT count(*)::int AS count FROM pg_trigger
  WHERE tgrelid=ANY($1::regclass[]) AND NOT tgisinternal`,[['product."MeasurementVersion"','product."MeasurementEntry"']]);assert.equal(triggers.count,0);
 for(const [table,constraint,parent,childKeys,parentKeys]of [
  ["MeasurementVersion","MeasurementVersion_businessId_clientId_fkey","Client",[2,3],[2,1]],
  ["MeasurementEntry","MeasurementEntry_measurementVersionId_fkey","MeasurementVersion",[1],[1]]]){
  const {rows:[fk]}=await db.query(`SELECT convalidated AS valid,condeferrable AS deferred,confdeltype AS deletion,confupdtype AS update,
   confrelid=$3::regclass AS parent,conkey AS child_keys,confkey AS parent_keys FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2 AND contype='f'`,
   ['product."'+table+'"',constraint,'product."'+parent+'"']);
  assert.deepEqual(fk,{valid:true,deferred:false,deletion:"r",update:"r",parent:true,child_keys:childKeys,parent_keys:parentKeys});
 }
 const {rows:indexes}=await db.query(`SELECT c.relname AS name,i.indisunique AS unique,i.indisvalid AS valid,i.indisready AS ready,i.indpred IS NULL AS unconditional,
  ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,position)
   LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.position) AS keys,
  i.indnkeyatts AS key_count,i.indnatts AS total_count,i.indrelid::regclass::text AS target,
  pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indexprs,i.indrelid) AS expression,
  CASE WHEN c.relname='MeasurementEntry_version_label_key' THEN i.indcollation[1]=
   (SELECT c.oid FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace
     WHERE n.nspname='product' AND c.collname='measurement_label_ci') ELSE true END AS label_collation
  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relname=ANY($1::text[])`,[
  ["Client_businessId_id_key","MeasurementVersion_pkey","MeasurementVersion_clientId_versionNumber_key","MeasurementEntry_pkey","MeasurementEntry_version_label_key"]]);
 assert.equal(indexes.length,5);
 for(const [name,keys]of Object.entries({Client_businessId_id_key:["businessId","id"],MeasurementVersion_pkey:["id"],
  MeasurementVersion_clientId_versionNumber_key:["clientId","versionNumber"],MeasurementEntry_pkey:["measurementVersionId","name"],MeasurementEntry_version_label_key:["measurementVersionId","name"]})){
  const index=indexes.find(i=>i.name===name);assert.ok(index);assert.equal(index.unique,true);assert.equal(index.valid,true);assert.equal(index.ready,true);assert.equal(index.unconditional,true);assert.equal(index.label_collation,true);assert.deepEqual(index.keys,keys);
  assert.equal(index.expression,null);assert.equal(index.key_count,keys.length);assert.equal(index.total_count,keys.length);
  assert.equal(index.target,'product."'+(name.startsWith("Client_")?"Client":name.startsWith("MeasurementVersion_")?"MeasurementVersion":"MeasurementEntry")+'"');
  if(name==="MeasurementEntry_version_label_key")assert.match(index.definition,/^CREATE UNIQUE INDEX "MeasurementEntry_version_label_key" ON product\."MeasurementEntry" USING btree \("measurementVersionId", (?:name|"name") COLLATE product\.measurement_label_ci\)$/u);
 }
 const {rows:collations}=await db.query(`SELECT pg_get_userbyid(c.collowner) AS owner,c.collprovider AS provider,c.collisdeterministic AS deterministic,
  c.colliculocale AS locale,c.collicurules IS NULL AS no_rules,c.collencoding=-1 AS all_encodings,c.collversion AS recorded,pg_collation_actual_version(c.oid) AS actual
  FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='product' AND c.collname='measurement_label_ci'`);
 assert.equal(collations.length,1);const c=collations[0];
 assert.equal(c.owner,"stitchtrack_product_test_migrator");assert.equal(c.provider,"i");assert.equal(c.deterministic,false);
 assert.equal(c.no_rules,true);assert.equal(c.all_encodings,true);
 assert.ok(["und-u-kk-true-ks-level2","und-u-kk-ks-level2"].includes(c.locale));assert.ok(c.recorded);assert.equal(c.recorded,c.actual);
 const {rows:[dependency]}=await db.query(`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
  WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid='product."MeasurementEntry_version_label_key"'::regclass
   AND d.refclassid='pg_catalog.pg_collation'::regclass AND d.refobjid='product.measurement_label_ci'::regcollation) AS linked`);
 assert.deepEqual(dependency,{linked:true});
}
export async function applicationPrivileges(db){
 const {rows:[role]}=await db.query(`SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe,
  NOT has_schema_privilege(rolname,'product','CREATE') AS restricted_schema FROM pg_roles WHERE rolname='stitchtrack_product_test_app'`);
 assert.deepEqual(role,{safe:true,restricted_schema:true});
 for(const [table,columns]of [["MeasurementVersion",["id","businessId","clientId","versionNumber","unit","recordedAt"]],["MeasurementEntry",["measurementVersionId","name","value"]]]){
  const {rows:[permissions]}=await db.query(`SELECT has_table_privilege($1::text,$2::text,'SELECT') AS readable,
   (SELECT bool_and(has_column_privilege($1::text,$2::text,c,'INSERT')) FROM unnest($3::text[]) c) AS insertable,
   has_table_privilege($1::text,$2::text,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1::text,$2::text,'UPDATE,REFERENCES') AS forbidden`,
   ["stitchtrack_product_test_app",'product."'+table+'"',columns]);
  assert.deepEqual(permissions,{readable:true,insertable:true,forbidden:false});
 }
}
// The injected client is only for offline fault tests. The owner CLI always creates pg.Client.
export async function runMeasurementConstraintChecks({target,fixtures},providedClient){
 let db=providedClient,stage="dependency_initialization",transaction=false,checks=0,versionCount=0,entryCount=0;
 const failures=[],versionIds=[],unicode=[];
 try{
  if(!db){const {Client}=await import("pg");db=new Client({connectionString:target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,
   connectionTimeoutMillis:5000,statement_timeout:10000,application_name:"stitchtrack-measurement-constraint-proof"});}
  stage="connection";await db.connect();stage="begin";transaction=true;await db.query("BEGIN");
  stage="transaction_settings";await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");
  await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="connection_identity";
  const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
   host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,
   to_regnamespace('product')::text AS namespace,current_setting('server_encoding') AS encoding,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  assert.deepEqual(identity,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_migrator",session_role:"stitchtrack_product_test_migrator",
   host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",encoding:"UTF8",safe:true});
  stage="schema_tables";
  const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
  assert.deepEqual(actual.map(r=>r.name),tables);assert.ok(actual.every(r=>r.kind==="r"&&r.owner===target.user));
  const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,
   NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated_history
   FROM pg_catalog.pg_namespace WHERE nspname='product'`);
  assert.deepEqual(schema,{owner:target.user,isolated_history:true});
  stage="table_locks";await db.query('LOCK TABLE '+tables.map(t=>'product."'+t+'"').join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  stage="migration_history";
  const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations');
  assert.equal(history.length,9);assert.deepEqual(history.map(r=>r.migration_name).sort(),Object.keys(PRODUCT_MIGRATIONS).sort());
  assert.ok(history.every(r=>r.checksum===PRODUCT_MIGRATIONS[r.migration_name]&&r.finished_at&&!r.rolled_back_at&&r.logs===null&&r.applied_steps_count===1));
  stage="schema_metadata";await schemaMetadata(db);stage="application_privileges";await applicationPrivileges(db);
  stage="fixture_pairs";
  for(const f of fixtures){
   const {rows:[fixture]}=await db.query(`SELECT c."id" AS client_id,c."businessId" AS business_id FROM product."Client" c JOIN product."Business" b ON b."id"=c."businessId"
    JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId" JOIN product."User" u ON u."id"=b."primaryOwnerUserId"
    WHERE c."id"=$1::uuid AND c."businessId"=$2 AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
    AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[f.clientId,f.businessId]);
   assert.deepEqual(fixture,{client_id:f.clientId,business_id:f.businessId});
  }
  stage="snapshot_before";const before=await snapshot(db);
  stage="version_allocation";
  const {rows:[numbers]}=await db.query('SELECT COALESCE(max("versionNumber"),0)::int AS maximum FROM product."MeasurementVersion" WHERE "clientId"=ANY($1::uuid[])',[fixtures.map(f=>f.clientId)]);
  assert.ok(Number.isInteger(numbers.maximum)&&numbers.maximum>=0&&numbers.maximum<2147483600);let number=numbers.maximum;
  stage="savepoint_work";await db.query("SAVEPOINT measurement_work");
  const version=async(patch={})=>{
   const v={id:randomUUID(),...fixtures[0],versionNumber:++number,unit:"cm",...patch};
   const {rows:[row]}=await db.query(`INSERT INTO product."MeasurementVersion" ("id","businessId","clientId","versionNumber","unit")
    VALUES ($1::uuid,$2,$3::uuid,$4::integer,$5) RETURNING "id","businessId","clientId","versionNumber","unit",
    "recordedAt"=transaction_timestamp()::timestamptz(3) AS database_time`,[v.id,v.businessId,v.clientId,v.versionNumber,v.unit]);
   assert.deepEqual(row,{...v,database_time:true});versionIds.push(v.id);versionCount++;return v;
  };
  const entry=async(id,name,value="40.25")=>{
   const {rows:[row]}=await db.query(`INSERT INTO product."MeasurementEntry" ("measurementVersionId","name","value") VALUES ($1::uuid,$2,$3::numeric)
    RETURNING "measurementVersionId","name","value"::text AS value`,[id,name,value]);
   assert.deepEqual(row,{measurementVersionId:id,name,value});entryCount++;return row;
  };
  const reject=async(action,code,constraints)=>{
   await db.query("SAVEPOINT expected_failure");let error;
   try{await action();}catch(e){error=e;}
   try{await db.query("ROLLBACK TO SAVEPOINT expected_failure");await db.query("RELEASE SAVEPOINT expected_failure");}
   catch(e){throw new ProofFailure("rollback_expected_failure",e);}
   try{assert.ok(error);assert.equal(error.code,code);if(constraints)assert.ok([].concat(constraints).includes(error.constraint));}
   catch{throw new ProofFailure(stage,error);}checks++;
  };
  stage="version_valid";const first=await version();checks++;
  stage="version_independent";const second=await version({unit:"in"});checks++;
  stage="version_other_client";await version({...fixtures[1],versionNumber:first.versionNumber});checks++;
  for(const [id,patch,code,constraint]of [
   ["version_uuid_invalid",{id:"not-a-uuid"},"22P02"],["version_uuid_null",{id:null},"23502"],
   ["version_duplicate_id",{id:first.id},"23505","MeasurementVersion_pkey"],
   ["version_cross_business",{clientId:fixtures[1].clientId},"23503","MeasurementVersion_businessId_clientId_fkey"],
   ["version_zero",{versionNumber:0},"23514","MeasurementVersion_versionNumber_check"],["version_negative",{versionNumber:-1},"23514","MeasurementVersion_versionNumber_check"],
   ["version_duplicate_number",{versionNumber:first.versionNumber},"23505","MeasurementVersion_clientId_versionNumber_key"],
   ["unit_invalid",{unit:"mm"},"23514","MeasurementVersion_unit_check"],["unit_uppercase",{unit:"CM"},"23514","MeasurementVersion_unit_check"],["unit_null",{unit:null},"23502"]
  ]){stage=id;await reject(()=>version(patch),code,constraint);}
  stage="version_orphan_lookup";const orphanClient=randomUUID();assert.equal((await db.query('SELECT 1 FROM product."Client" WHERE "id"=$1::uuid',[orphanClient])).rowCount,0);
  stage="version_orphan_client";await reject(()=>version({clientId:orphanClient}),"23503","MeasurementVersion_businessId_clientId_fkey");
  stage="entry_orphan_lookup";const orphanVersion=randomUUID();assert.equal((await db.query('SELECT 1 FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[orphanVersion])).rowCount,0);
  stage="entry_orphan";await reject(()=>entry(orphanVersion,"Hip"),"23503","MeasurementEntry_measurementVersionId_fkey");
  stage="label_flexible";for(const label of ["Hip","Thigh","Agbada Length"]){await entry(first.id,label);checks++;}
  stage="label_one";await entry(first.id,"A");checks++;
  stage="label_60";await entry(first.id,"\u{1f9f5}".repeat(60));checks++;
  for(const [id,label,code="23514"]of labelRejected){stage=id;await reject(()=>entry(first.id,label),code,code==="23514"?"MeasurementEntry_name_check":undefined);}
  stage="label_exact_duplicate";await reject(()=>entry(first.id,"Hip"),"23505",["MeasurementEntry_pkey","MeasurementEntry_version_label_key"]);
  stage="label_other_version";await entry(second.id,"Hip");checks++;
  for(const [id,value,accepted]of numericCases){stage=id;
   if(accepted){await entry(first.id,id,value);checks++;}else await reject(()=>entry(first.id,id,value),"23514","MeasurementEntry_value_check");
  }
  stage="value_null";await reject(()=>entry(first.id,"Null value",null),"23502");
  for(const [id,left,right,requiredCollision]of unicodeCases){stage=id;const v=await version();
   // The index's explicit collation is verified by schemaMetadata(); default C/lower() is not its equality contract.
   const {rows:[comparison]}=await db.query('SELECT $1::text COLLATE product.measurement_label_ci=$2::text AS equal',[left,right]);
   assert.equal(typeof comparison.equal,"boolean");
   if(requiredCollision!==undefined)assert.equal(comparison.equal,requiredCollision);
   await entry(v.id,left);
   const collision=comparison.equal;
   if(collision)await reject(()=>entry(v.id,right),"23505",["MeasurementEntry_pkey","MeasurementEntry_version_label_key"]);
   else{await entry(v.id,right);checks++;}
   unicode.push({case:id,equal:comparison.equal,collision});
  }
  stage="multiple_entries";
  assert.equal((await db.query('SELECT count(*)::int AS count FROM product."MeasurementEntry" WHERE "measurementVersionId"=$1::uuid',[first.id])).rows[0].count,9);checks++;
  stage="stored_rows";assert.equal((await db.query('SELECT count(*)::int AS count FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[versionIds])).rows[0].count,versionIds.length);checks++;
  stage="rollback_work";await db.query("ROLLBACK TO SAVEPOINT measurement_work");await db.query("RELEASE SAVEPOINT measurement_work");
  stage="rollback_rows";
  for(const table of ["MeasurementEntry","MeasurementVersion"]){
   const column=table==="MeasurementEntry"?"measurementVersionId":"id";
   assert.equal((await db.query('SELECT count(*)::int AS count FROM product."'+table+'" WHERE "'+column+'"=ANY($1::uuid[])',[versionIds])).rows[0].count,0);
  }checks++;
  stage="snapshot_after";assert.deepEqual(await snapshot(db),before);checks++;
 }catch(error){failures.push(detailsOf(stage,error));}
 finally{
  if(transaction)try{await db.query("ROLLBACK");}catch(error){failures.push(detailsOf("rollback",error));}
  if(db)try{await db.end();}catch(error){failures.push(detailsOf("connection_cleanup",error));}
 }
 if(failures.length)return {status:"failed",failures,noAutomaticRetry:true};
 return {status:"passed_rolled_back",checks,syntheticVersionsTested:versionCount,syntheticEntriesTested:entryCount,retainedSyntheticRows:0,unicode,
  unrelatedRecords:"unchanged_in_locked_snapshot",restrictionProof:"validated_fk_and_effective_privilege_metadata",
  limitations:["unicode_observations_are_not_full_case_folding_policy","complete_sets_and_consecutive_allocation_require_service","no_concurrency_proof","no_runtime_role_connection"]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;
 try{result=await runMeasurementConstraintChecks(authorizeMeasurementConstraints(process.argv.slice(2),process.env));}
 catch(error){result={status:"failed",failures:[detailsOf("internal",error)],noAutomaticRetry:true};}
 if(result.status==="failed"){console.error(JSON.stringify(result));process.exitCode=1;}else console.log(JSON.stringify(result));
}
