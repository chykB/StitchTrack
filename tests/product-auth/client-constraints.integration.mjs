// OWNER ONLY. Inert on import; one isolated test transaction, never COMMIT.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {emailSchema} from "../../lib/auth/schemas.ts";
const tables=["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort();
const nameAcceptedStages=["name_one","name_120_unicode"];
const nameRejectedStages=["name_null","name_empty","name_space_only","name_nbsp_only","name_nel_only","name_121_unicode","name_leading_nbsp","name_trailing_bom"];
const phoneAcceptedStages=["phone_null","phone_7_digits","phone_15_digits","phone_formatted","phone_32_characters"];
const phoneRejectedStages=["phone_empty","phone_6_digits","phone_16_digits","phone_33_characters","phone_letter","phone_tab","phone_non_ascii","phone_untrimmed"];
const emailAcceptedStages=["email_null","email_normalized","email_apostrophe","email_long"];
const emailRejectedStages=["email_empty","email_uppercase","email_structure","email_space","email_non_ascii"];
const stages=new Set(["internal","authorization","fixture_authorization","database_configuration","migration_files","dependency_initialization",
 "connection","begin","transaction_settings","connection_identity","schema_tables","table_locks","migration_history","schema_privileges",
 "fixture_accounts","foreign_key_metadata","ownership_metadata","application_privileges","snapshot_before","savepoint_work",
 "uuid_valid","uuid_duplicate","uuid_invalid","uuid_null","business_required","orphan_lookup","business_orphan","duplicate_contacts",
 "inserted_rows","rollback_work","rollback_rows","snapshot_after","rollback_expected_failure","rollback","connection_cleanup",
 ...nameAcceptedStages,...nameRejectedStages,...phoneAcceptedStages,...phoneRejectedStages,...emailAcceptedStages,...emailRejectedStages]);
const sqlstates=new Set(["08000","08001","08003","08004","08006","08007","08P01","28000","28P01","3D000","3F000","42501","42P01","42703","42704",
 "42601","42883","42804","42P18","42809","22021","22P02","23502","23503","23505","23514","25P02","25P03","57014","55P03","40P01","40001","53300"]);
// Only fixed identifiers and allowlisted PostgreSQL codes can leave the process.
export function clientConstraintFailureDetails(stage,error){
 return {stage:stages.has(stage)?stage:"internal",...(sqlstates.has(error?.code)?{sqlstate:error.code}:{})};
}
class ProofFailure extends Error{
 constructor(stage,error){super("Client constraint proof failed.");this.details=clientConstraintFailureDetails(stage,error);}
}
const detailsOf=(stage,error)=>error instanceof ProofFailure?error.details:clientConstraintFailureDetails(stage,error);
export function authorizeClientConstraints(args,env){
 if(args.length!==1||args[0]!=="--owner-client-constraints"||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||
   env.PRODUCT_CLIENT_CONSTRAINT_CHECK_CONFIRMED!=="true"||env.PRODUCT_CLIENT_CONSTRAINT_FIXTURES_CONFIRMED!=="true"||
   ["NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new ProofFailure("authorization");
 const businesses=[env.PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID,env.PRODUCT_CLIENT_CONSTRAINT_BUSINESS_B_ID];
 if(businesses.some(id=>typeof id!=="string"||!id||id!==id.trim()||id.length>200||/[\x00-\x1f\x7f]/u.test(id))||businesses[0]===businesses[1])throw new ProofFailure("fixture_authorization");
 let target;
 try{target=productMigrationConfig(env);
  if(target.mode!=="test"||target.database!=="stitchtrack_product_test"||target.user!=="stitchtrack_product_test_migrator")throw Error();
 }catch(error){throw new ProofFailure("database_configuration",error);}
 try{assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,7);}
 catch(error){throw new ProofFailure("migration_files",error);}
 return {target,businesses};
}
// Only fixed reviewed table identifiers are interpolated. Snapshots never return row data.
async function snapshot(db){
 const result=[];
 for(const table of tables){
  const {rows:[size]}=await db.query('SELECT count(*)::int AS count FROM product."'+table+'"');
  assert.ok(size.count<=10000,"Bounded verification scope required");
  const {rows:[digest]}=await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t');
  result.push({table,count:size.count,digest:digest.digest});
 }
 return result;
}
// Optional client double is for offline fault tests; the CLI always constructs pg.Client.
export async function runClientConstraintChecks({target,businesses},providedClient){
 let db=providedClient,stage="dependency_initialization",transaction=false,checks=0,inserted=0;
 const failures=[];
 try{
  if(!db){const {Client}=await import("pg");db=new Client({connectionString:target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,
   connectionTimeoutMillis:5000,statement_timeout:10000,application_name:"stitchtrack-client-constraint-proof"});}
  stage="connection";await db.connect();stage="begin";transaction=true;await db.query("BEGIN");
  stage="transaction_settings";
  await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");
  await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="connection_identity";
  const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
   host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,current_setting('port') AS port,
   current_setting('TimeZone') AS timezone,to_regnamespace('product')::text AS namespace,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe
   FROM pg_roles WHERE rolname=current_user`);
  assert.deepEqual(identity,{database:target.database,role:target.user,session_role:target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",safe:true});
  stage="schema_tables";
  const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
  assert.deepEqual(actual.map(r=>r.name),tables);assert.ok(actual.every(r=>r.kind==="r"&&r.owner===target.user));
  // Quiescent owner-run proof: prevent concurrent writes from invalidating the comparison.
  stage="table_locks";
  await db.query('LOCK TABLE '+tables.map(t=>'product."'+t+'"').join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  stage="migration_history";
  const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations');
  assert.equal(history.length,7);assert.equal(new Set(history.map(r=>r.migration_name)).size,7);
  assert.ok(history.every(r=>PRODUCT_MIGRATIONS[r.migration_name]===r.checksum&&r.finished_at&&!r.rolled_back_at&&r.logs===null&&r.applied_steps_count===1));
  stage="schema_privileges";
  const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='product'`);assert.equal(schema.owner,target.user);
  const {rows:[triggers]}=await db.query(`SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid='product."Client"'::regclass AND NOT tgisinternal`);assert.equal(triggers.count,0);
  stage="fixture_accounts";
  const {rows:owners}=await db.query(`SELECT b."id" FROM product."Business" b
   JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
   JOIN product."User" u ON u."id"=b."primaryOwnerUserId"
   WHERE b."id"=ANY($1::text[]) AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
   AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[businesses]);
  assert.equal(owners.length,2);
  // No DELETE/UPDATE is issued against an existing Business or membership.
  stage="foreign_key_metadata";
  const {rows:[fk]}=await db.query(`SELECT confdeltype AS deletion,confupdtype AS update,convalidated AS valid,
   confrelid='product."Business"'::regclass AS parent,
   conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='product."Client"'::regclass AND attname='businessId')]::smallint[] AS child_key,
   confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='product."Business"'::regclass AND attname='id')]::smallint[] AS parent_key
   FROM pg_constraint WHERE conrelid='product."Client"'::regclass AND conname='Client_businessId_fkey' AND contype='f'`);
  assert.deepEqual(fk,{deletion:"r",update:"r",valid:true,parent:true,child_key:true,parent_key:true});
  stage="ownership_metadata";
  const {rows:[ownership]}=await db.query(`SELECT convalidated AND condeferrable AND condeferred AND confdeltype='a' AND confupdtype='r'
   AND confrelid='product."BusinessMember"'::regclass
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='product."Business"'::regclass AND attname='id'),
     (SELECT attnum FROM pg_attribute WHERE attrelid='product."Business"'::regclass AND attname='primaryOwnerUserId')]::smallint[]
   AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='product."BusinessMember"'::regclass AND attname='businessId'),
     (SELECT attnum FROM pg_attribute WHERE attrelid='product."BusinessMember"'::regclass AND attname='userId')]::smallint[]
   AS valid FROM pg_constraint
   WHERE conrelid='product."Business"'::regclass AND conname='Business_id_primaryOwnerUserId_fkey' AND contype='f'`);assert.equal(ownership?.valid,true);
  stage="application_privileges";
  const {rows:[permissions]}=await db.query(`SELECT
   has_column_privilege('stitchtrack_product_test_app','product."Business"','primaryOwnerUserId','UPDATE') AS owner_update,
   has_column_privilege('stitchtrack_product_test_app','product."Business"','id','UPDATE') AS business_id_update,
   has_any_column_privilege('stitchtrack_product_test_app','product."BusinessMember"','UPDATE') AS membership_update,
   has_table_privilege('stitchtrack_product_test_app','product."Business"','DELETE') AS business_delete,
   has_table_privilege('stitchtrack_product_test_app','product."BusinessMember"','DELETE') AS membership_delete,
   has_column_privilege('stitchtrack_product_test_app','product."Client"','businessId','UPDATE') AS client_reassignment`);
  assert.deepEqual(permissions,{owner_update:false,business_id_update:false,membership_update:false,business_delete:false,membership_delete:false,client_reassignment:false});checks+=2;
  stage="snapshot_before";
  const before=await snapshot(db),ids=[];
  stage="savepoint_work";
  await db.query("SAVEPOINT client_work");
  const insert=async(patch={})=>{
   const value={id:randomUUID(),businessId:businesses[0],fullName:"Synthetic constraint client",phone:null,email:null,...patch};
   const {rows:[row]}=await db.query('INSERT INTO product."Client" ("id","businessId","fullName","phone","email","createdAt","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()) RETURNING "id"',[value.id,value.businessId,value.fullName,value.phone,value.email]);
   assert.equal(row.id,value.id);ids.push(row.id);inserted++;return row.id;
  };
  const reject=async(patch,code,constraint)=>{
   await db.query("SAVEPOINT expected_failure");let error;
   try{await insert(patch);}catch(e){error=e;}
   // Undo even an unexpectedly accepted row before refusing the run.
   try{await db.query("ROLLBACK TO SAVEPOINT expected_failure");await db.query("RELEASE SAVEPOINT expected_failure");}
   catch(rollbackError){throw new ProofFailure("rollback_expected_failure",rollbackError);}
   try{assert.ok(error,"Expected database refusal");assert.equal(error.code,code);if(constraint)assert.equal(error.constraint,constraint);}
   catch{throw new ProofFailure(stage,error);}checks++;
  };
  stage="uuid_valid";const first=await insert();checks++;
  stage="uuid_duplicate";await reject({id:first},"23505","Client_pkey");
  stage="uuid_invalid";await reject({id:"not-a-uuid"},"22P02");
  stage="uuid_null";await reject({id:null},"23502");
  stage="business_required";await reject({businessId:null},"23502");
  stage="orphan_lookup";const orphan=randomUUID();assert.equal((await db.query('SELECT 1 FROM product."Business" WHERE "id"=$1',[orphan])).rowCount,0);
  stage="business_orphan";await reject({businessId:orphan},"23503","Client_businessId_fkey");
  for(const [i,fullName] of ["A","\u{1f9f5}".repeat(120)].entries()){stage=nameAcceptedStages[i];await insert({fullName});checks++;}
  for(const [i,fullName] of [null,""," ","\u00a0","\u0085","\u{1f9f5}".repeat(121),"\u00a0A","A\ufeff"].entries()){
   stage=nameRejectedStages[i];await reject({fullName},fullName===null?"23502":"23514",fullName===null?undefined:"Client_fullName_check");}
  for(const [i,phone] of [null,"1234567","123456789012345","+234 (803) 123-4567","1234567"+"-".repeat(25)].entries()){stage=phoneAcceptedStages[i];await insert({phone});checks++;}
  for(const [i,phone] of ["","123456","1234567890123456","1234567"+"-".repeat(26),"123456a","123\t4567","\uff11\uff12\uff13\uff14\uff15\uff16\uff17"," 1234567"].entries()){
   stage=phoneRejectedStages[i];await reject({phone},"23514","Client_phone_check");}
  for(const [i,raw] of [null," Canonical@EXAMPLE.INVALID ","o'neil@example.invalid","a".repeat(300)+"@example.invalid"].entries()){
   stage=emailAcceptedStages[i];await insert({email:raw===null?null:emailSchema.parse(raw)});checks++;
  }
  for(const [i,email] of ["","Uppercase@example.invalid","a@b","a b@example.invalid","\u00f3la@example.invalid"].entries()){
   stage=emailRejectedStages[i];await reject({email},"23514","Client_email_check");}
  stage="duplicate_contacts";const shared={fullName:"Synthetic shared contact",phone:"1234567",email:"shared@example.invalid"};
  const a=await insert(shared),a2=await insert(shared),b=await insert({...shared,businessId:businesses[1]});
  assert.equal(new Set([a,a2,b]).size,3);checks++;
  stage="inserted_rows";assert.equal((await db.query('SELECT "id" FROM product."Client" WHERE "id"=ANY($1::uuid[])',[ids])).rowCount,ids.length);
  stage="rollback_work";await db.query("ROLLBACK TO SAVEPOINT client_work");await db.query("RELEASE SAVEPOINT client_work");
  stage="rollback_rows";assert.equal((await db.query('SELECT count(*)::int AS count FROM product."Client" WHERE "id"=ANY($1::uuid[])',[ids])).rows[0].count,0);checks++;
  stage="snapshot_after";assert.deepEqual(await snapshot(db),before);checks++;
 }catch(error){failures.push(detailsOf(stage,error));}
 finally{
  if(transaction)try{await db.query("ROLLBACK");}catch(error){failures.push(detailsOf("rollback",error));}
  if(db)try{await db.end();}catch(error){failures.push(detailsOf("connection_cleanup",error));}
 }
 if(failures.length)return {status:"failed",failures};
 return {status:"passed_rolled_back",checks,syntheticClientRowsTested:inserted,retainedNewClients:0,
  businessProtection:"catalogue_and_runtime_privileges_only",unrelatedRecords:"unchanged_in_locked_snapshot"};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;
 try{result=await runClientConstraintChecks(authorizeClientConstraints(process.argv.slice(2),process.env));}
 catch(error){result={status:"failed",failures:[detailsOf("internal",error)]};}
 if(result.status==="failed"){
  for(const detail of result.failures)console.error("FAIL: guarded Client constraint verification "+JSON.stringify(detail)+". No automatic retry.");
  process.exitCode=1;
 }else console.log(JSON.stringify(result));
}
