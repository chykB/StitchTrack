// Offline authorization/source checks and injected client faults only; no pg client or connection.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {authorizeClientConstraints,clientConstraintFailureDetails,runClientConstraintChecks} from "./client-constraints.integration.mjs";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {productMigrationConfig} from "../../prisma/product/targets.ts";
const source=readFileSync(new URL("./client-constraints.integration.mjs",import.meta.url),"utf8");
const args=["--owner-client-constraints"];
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",
 PRODUCT_CLIENT_CONSTRAINT_CHECK_CONFIRMED:"true",PRODUCT_CLIENT_CONSTRAINT_FIXTURES_CONFIRMED:"true",
 PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID:"disposable-business-a",PRODUCT_CLIENT_CONSTRAINT_BUSINESS_B_ID:"disposable-business-b",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
test("historical owner proof refuses the later registered migrations before any connection",()=>{
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);
 assert.throws(()=>authorizeClientConstraints(args,env),error=>{
  assert.deepEqual(error.details,{stage:"migration_files"});return true;
 });
 assert.match(source,/assertProductMigrationFiles\(\);assert.equal\(Object.keys\(PRODUCT_MIGRATIONS\).length,7\)/u);
 assert.match(source,/async function run[\s\S]+await import\("pg"\)/u);
});
test("historical proof still checks explicit approvals and distinct fixtures before manifest compatibility",()=>{
 const refuses=(args,env,stage)=>assert.throws(()=>authorizeClientConstraints(args,env),error=>error.details.stage===stage);
 for(const bad of [[],[...args,"--execute"],["--owner-integration"]])refuses(bad,env,"authorization");
 for(const patch of [{PRODUCT_CLIENT_CONSTRAINT_CHECK_CONFIRMED:undefined},{PRODUCT_CLIENT_CONSTRAINT_FIXTURES_CONFIRMED:undefined}])
  refuses(args,{...env,...patch},"authorization");
 for(const patch of [{PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID:""},{PRODUCT_CLIENT_CONSTRAINT_BUSINESS_B_ID:env.PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID},
  {PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID:" a "},{PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID:"a\nb"}])
  refuses(args,{...env,...patch},"fixture_authorization");
});
test("wrong database, role, environment, host or debug/service overrides refuse at their own guard",()=>{
 const authorization=[{NODE_ENV:"development"},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},
  {NODE_DEBUG:"pg"},{DEBUG:"*"},{PGOPTIONS:"-c timezone=UTC"},{PGSERVICE:"other"}];
 const configuration=[{PRODUCT_DATABASE_CONFIRMED:undefined},{PRODUCT_MIGRATION_CONFIRMED:undefined},
  ...["stitchtrack_product_dev","stitchtrack_assessment"].map(name=>({PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("/stitchtrack_product_test?","/"+name+"?")})),
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("_migrator:","_app:")},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace("127.0.0.1","localhost")},
  {PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace(":5432/",":5433/")}];
 for(const [stage,patches]of [["authorization",authorization],["database_configuration",configuration]])
  for(const patch of patches)assert.throws(()=>authorizeClientConstraints(args,{...env,...patch}),error=>error.details.stage===stage);
});
test("actual database identity/history and quiescent bounded snapshots are checked inside rollback-only transaction",()=>{
 for(const token of ['db.query("BEGIN")','db.query("ROLLBACK")','inet_server_addr()','inet_client_addr()','session_user','to_regnamespace(\'product\')','assert.equal(history.length,7)','PRODUCT_MIGRATIONS[r.migration_name]','IN SHARE ROW EXCLUSIVE MODE','size.count<=10000','assert.deepEqual(await snapshot(db),before)'])assert.ok(source.includes(token),token);
 assert.doesNotMatch(source,/db\.query\(["'`]COMMIT/u);
 assert.match(source,/finally\{[\s\S]+db\.query\("ROLLBACK"\)[\s\S]+db\.end\(\)/u);
 assert.ok(source.indexOf('return {status:"passed_rolled_back"')>source.indexOf('if(failures.length)return {status:"failed",failures}'));
});
test("only synthetic Client inserts are attempted; expected failures and all test rows are explicitly rolled back",()=>{
 assert.match(source,/INSERT INTO product\."Client"[\s\S]+VALUES \(\$1::uuid,\$2,\$3,\$4,\$5/u);
 assert.doesNotMatch(source,/\bDELETE\s+FROM\b|\bUPDATE\s+product\.|CREATE TABLE|ALTER TABLE|GRANT |TRUNCATE /u);
 for(const token of ['SAVEPOINT expected_failure','ROLLBACK TO SAVEPOINT expected_failure','SAVEPOINT client_work','ROLLBACK TO SAVEPOINT client_work','assert.equal(error.code,code)','assert.equal(error.constraint,constraint)','retainedNewClients:0'])assert.ok(source.includes(token));
 assert.ok(source.includes('businessProtection:"catalogue_and_runtime_privileges_only"'));
 assert.doesNotMatch(source,/console\.(?:log|error)\([^\n]*(?:target\.url|businesses|error|password|\.stack)/u);
});
test("required boundary cases, duplicate contacts and live Business ownership/refusal metadata are present",()=>{
 for(const token of ['"Client_pkey"','"22P02"','businessId:null','"Client_businessId_fkey"','"Client_fullName_check"','repeat(120)','repeat(121)',
  '"123456"','"1234567"','"123456789012345"','"1234567890123456"','repeat(25)','repeat(26)','"Client_phone_check"','"Client_email_check"',
  'emailSchema.parse(raw)','new Set([a,a2,b])','confdeltype','confupdtype','primaryOwnerUserId','has_column_privilege','membership_delete:false'])assert.ok(source.includes(token),token);
});


test("safe diagnostics accept only fixed stage names and allowlisted SQLSTATEs",()=>{
 const privateError={code:"42501",message:"PRIVATE password database URL business ID",stack:"PRIVATE stack",detail:"PRIVATE row",constraint:"PRIVATE constraint"};
 assert.deepEqual(clientConstraintFailureDetails("application_privileges",privateError),{stage:"application_privileges",sqlstate:"42501"});
 assert.deepEqual(clientConstraintFailureDetails("PRIVATE stage",{code:"SECRET"}),{stage:"internal"});
 assert.deepEqual(clientConstraintFailureDetails("connection",{code:"ECONNREFUSED"}),{stage:"connection"});
 for(const stage of ["snapshot_before","snapshot_after","rollback","rollback_expected_failure","connection_cleanup","name_120_unicode","phone_33_characters","email_long"])
  assert.deepEqual(clientConstraintFailureDetails(stage),{stage});
 for(const [patch,stage] of [[{PRODUCT_CLIENT_CONSTRAINT_CHECK_CONFIRMED:undefined},"authorization"],
  [{PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID:""},"fixture_authorization"],[{PRODUCT_MIGRATION_CONFIRMED:undefined},"database_configuration"]]){
  assert.throws(()=>authorizeClientConstraints(args,{...env,...patch}),error=>error.details.stage===stage&&!JSON.stringify(error.details).includes("PRIVATE"));
 }
});
// Transaction/fault tests deliberately use the existing injected-client seam, not CLI authorization.
// Model the historical seven-migration database; never authorize it against the current inventory.
const historicalMigrations=Object.entries(PRODUCT_MIGRATIONS).filter(([name])=>name<"20261108_measurement_history");
const historicalConfig={target:productMigrationConfig(env),businesses:[env.PRODUCT_CLIENT_CONSTRAINT_BUSINESS_A_ID,env.PRODUCT_CLIENT_CONSTRAINT_BUSINESS_B_ID]};
function runHistoricalFaultChecks(db){
 assert.ok(db&&typeof db.query==="function"&&Array.isArray(db.calls),"Offline database double is mandatory");
 assert.equal(historicalMigrations.length,7);
 return runClientConstraintChecks(historicalConfig,db);
}
const privateFailure=(code="42501",constraint)=>Object.assign(new Error("PRIVATE message, password, URL and identifiers"),{code,constraint,detail:"PRIVATE row",stack:"PRIVATE stack"});
function faultClient(options={}){
 const calls=[],ids=new Set(),target=historicalConfig.target;
 let orphan;
 const result=rows=>({rows,rowCount:rows.length});
 const db={calls,
  async connect(){calls.push("connect");if(options.connect)throw options.connect;},
  async end(){calls.push("end");if(options.cleanup)throw options.cleanup;},
  async query(sql,values=[]){
   calls.push(sql);options.inject?.(sql,values);
   if(sql==="ROLLBACK"){if(options.rollback)throw options.rollback;return result([]);}
   if(sql==="BEGIN"||sql.startsWith("SET LOCAL")||sql.startsWith("SAVEPOINT")||sql.startsWith("RELEASE SAVEPOINT")||sql.startsWith("ROLLBACK TO SAVEPOINT")||sql.startsWith("LOCK TABLE"))return result([]);
   if(sql.includes("SELECT current_database()"))return result([{database:target.database,role:target.user,session_role:target.user,
    host:sql.includes("host(inet_server_addr())")?"127.0.0.1":"127.0.0.1/32",peer:sql.includes("host(inet_client_addr())")?"127.0.0.1":"127.0.0.1/32",port:"5432",timezone:"UTC",namespace:"product",safe:true}]);
   if(sql.includes("SELECT c.relname AS name"))return result(["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations",...(options.extraTables||[])].sort().map(name=>({name,kind:"r",owner:target.user})));
   if(sql.includes("SELECT migration_name,checksum"))return result((options.eighthHistory?Object.entries(PRODUCT_MIGRATIONS).filter(([name])=>name<="20261108_measurement_history"):historicalMigrations).map(([migration_name,checksum])=>({migration_name,checksum:options.badHistory?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1})));
   if(sql.includes("SELECT pg_get_userbyid(nspowner)"))return result([{owner:target.user}]);
   if(sql.includes("FROM pg_trigger"))return result([{count:0}]);
   if(sql.includes('SELECT b."id"'))return result(options.badFixtures?[]:[{id:"disposable-business-a"},{id:"disposable-business-b"}]);
   if(sql.includes("SELECT confdeltype AS deletion"))return result([{deletion:"r",update:"r",valid:true,parent:true,child_key:true,parent_key:true}]);
   if(sql.includes("AS valid FROM pg_constraint"))return result([{valid:true}]);
   if(sql.includes("AS owner_update"))return result([{owner_update:!!options.badPrivileges,business_id_update:false,membership_update:false,business_delete:false,membership_delete:false,client_reassignment:false}]);
   if(sql.startsWith("SELECT md5("))return result([{digest:"offline-only-snapshot"}]);
   if(sql.startsWith('SELECT count(*)::int AS count FROM product."'))return result([{count:0}]);
   if(sql.startsWith('SELECT 1 FROM product."Business"')){orphan=values[0];return result([]);}
   if(sql.startsWith('INSERT INTO product."Client"')){
    const [id,businessId]=values;
    if(ids.has(id))throw privateFailure("23505",options.wrongConstraint?"PRIVATE wrong constraint":"Client_pkey");
    if(id==="not-a-uuid")throw privateFailure("22P02");if(id===null||businessId===null)throw privateFailure("23502");
    if(businessId===orphan)throw privateFailure("23503","Client_businessId_fkey");
    ids.add(id);return result([{id}]);
   }
   throw Error("Unexpected offline SQL shape");
  },
 };
 return db;
}
test("identity regression uses host() while retaining exact loopback assertions",async()=>{
 assert.match(source,/host\(inet_server_addr\(\)\) AS host,host\(inet_client_addr\(\)\) AS peer/u);
 assert.doesNotMatch(source,/inet_(?:server|client)_addr\(\)::text/u);
 const db=faultClient({inject:sql=>{if(sql.startsWith('INSERT INTO product."Client"'))throw privateFailure();}});
 const result=await runHistoricalFaultChecks(db);
 assert.deepEqual(result,{status:"failed",failures:[{stage:"uuid_valid",sqlstate:"42501"}]});
 assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");assert.doesNotMatch(JSON.stringify(result),/PRIVATE|password|URL/u);
});
test("connection, lock, history, fixture, permission and snapshot failures remain distinguishable",async()=>{
 for(const [options,expected]of [
  [{connect:privateFailure("08006")},{stage:"connection",sqlstate:"08006"}],
  [{inject:sql=>{if(sql.startsWith("LOCK TABLE"))throw privateFailure("55P03");}},{stage:"table_locks",sqlstate:"55P03"}],
  [{badHistory:true},{stage:"migration_history"}],
  [{badFixtures:true},{stage:"fixture_accounts"}],
  [{badPrivileges:true},{stage:"application_privileges"}],
  [{inject:sql=>{if(sql.startsWith("SELECT md5("))throw privateFailure("57014");}},{stage:"snapshot_before",sqlstate:"57014"}],
 ]){
  const db=faultClient(options),result=await runHistoricalFaultChecks(db);
  assert.deepEqual(result,{status:"failed",failures:[expected]});assert.equal(db.calls.at(-1),"end");
  assert.equal(db.calls.includes("ROLLBACK"),expected.stage!=="connection");assert.doesNotMatch(JSON.stringify(result),/PRIVATE|password|URL/u);
 }
});
test("individual Unicode assertion errors and wrong expected constraints retain their stage and rollback",async()=>{
 const unicode=faultClient({inject:(sql,values)=>{if(sql.startsWith('INSERT INTO product."Client"')&&values[2]==="\u{1f9f5}".repeat(120))throw privateFailure("23514","PRIVATE constraint");}});
 const result=await runHistoricalFaultChecks(unicode);
 assert.deepEqual(result,{status:"failed",failures:[{stage:"name_120_unicode",sqlstate:"23514"}]});
 assert.ok(unicode.calls.includes("ROLLBACK"));
 const mismatch=faultClient({wrongConstraint:true});
 assert.deepEqual(await runHistoricalFaultChecks(mismatch),{status:"failed",failures:[{stage:"uuid_duplicate",sqlstate:"23505"}]});
 assert.ok(mismatch.calls.includes("ROLLBACK TO SAVEPOINT expected_failure"));assert.ok(mismatch.calls.includes("ROLLBACK"));
});
test("savepoint/outer rollback and cleanup failures cannot become success or conceal the original failure",async()=>{
 const savepoint=faultClient({inject:sql=>{if(sql==="ROLLBACK TO SAVEPOINT expected_failure")throw privateFailure("08006");}});
 assert.deepEqual(await runHistoricalFaultChecks(savepoint),{status:"failed",failures:[{stage:"rollback_expected_failure",sqlstate:"08006"}]});
 assert.ok(savepoint.calls.includes("ROLLBACK"));
 const db=faultClient({inject:sql=>{if(sql.startsWith("LOCK TABLE"))throw privateFailure("55P03");},rollback:privateFailure("08006"),cleanup:privateFailure("08003")});
 assert.deepEqual(await runHistoricalFaultChecks(db),{status:"failed",failures:[
  {stage:"table_locks",sqlstate:"55P03"},{stage:"rollback",sqlstate:"08006"},{stage:"connection_cleanup",sqlstate:"08003"}]});
 assert.equal(db.calls.at(-1),"end");
 const begin=faultClient({inject:sql=>{if(sql==="BEGIN")throw privateFailure("08006");}});
 assert.deepEqual(await runHistoricalFaultChecks(begin),{status:"failed",failures:[{stage:"begin",sqlstate:"08006"}]});
 assert.ok(begin.calls.includes("ROLLBACK"),"Even uncertain BEGIN acknowledgement must attempt rollback");
});

test("historical transaction independently rejects expanded tables or eight database history rows before inserts",async()=>{
 for(const [options,stage]of [[{extraTables:["MeasurementEntry","MeasurementVersion"]},"schema_tables"],[{eighthHistory:true},"migration_history"]]){
  const db=faultClient(options);
  assert.deepEqual(await runHistoricalFaultChecks(db),{status:"failed",failures:[{stage}]});
  assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");
  assert.equal(db.calls.some(sql=>sql.startsWith('INSERT INTO product."Client"')),false);
 }
});
