// Offline harness authorization/fault tests only. The double does not prove PostgreSQL constraints or Unicode behavior.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {authorizeMeasurementConstraints,measurementConstraintFailureDetails,runMeasurementConstraintChecks} from "./measurement-constraints.integration.mjs";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const source=readFileSync(new URL("./measurement-constraints.integration.mjs",import.meta.url),"utf8");
const args=["--owner-measurement-constraints"];
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",
 PRODUCT_MEASUREMENT_CONSTRAINT_CHECK_CONFIRMED:"true",PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED:"true",
 PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:"disposable-a",PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_B_ID:"disposable-b",
 PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID:"11111111-1111-4111-8111-111111111111",PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_B_ID:"22222222-2222-4222-8222-222222222222",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
// Every transaction uses an injected double; authorization itself never opens a connection.
const config=()=>authorizeMeasurementConstraints(args,env);
function runChecks(db){
 assert.ok(db&&typeof db.query==="function"&&Array.isArray(db.calls));
 return runMeasurementConstraintChecks(config(),db);
}
const fault=(code="42501",constraint)=>Object.assign(new Error("PRIVATE URL password identifiers SQL parameters"),{code,constraint,detail:"PRIVATE",stack:"PRIVATE"});
test("nine-migration entry requires the exact manifest while retaining approvals and fixture checks",()=>{
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);
 assert.equal(config().target.user,"stitchtrack_product_test_migrator");
 assert.match(source,/assertProductMigrationFiles\(\);assert.equal\(Object.keys\(PRODUCT_MIGRATIONS\).length,9\)/u);
 assert.ok(source.includes("Object.keys(PRODUCT_MIGRATIONS).sort()"));
 assert.match(source,/if\(process.argv\[1\]&&import.meta.url===pathToFileURL/u);
 assert.match(source,/if\(!db\)\{const \{Client\}=await import\("pg"\)/u);
 for(const bad of [[],[...args,"--execute"],["--owner-client-constraints"]])assert.throws(()=>authorizeMeasurementConstraints(bad,env),e=>e.details.stage==="authorization");
 for(const patch of [{PRODUCT_MEASUREMENT_CONSTRAINT_CHECK_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED:undefined},
  {NODE_ENV:"development"},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{DEBUG:"*"},{NODE_DEBUG:"pg"},{RUST_LOG:"debug"},{PRISMA_LOG_LEVEL:"trace"},{PGOPTIONS:"other"},{PGSERVICE:"other"},{PGSERVICEFILE:"other"}])
  assert.throws(()=>authorizeMeasurementConstraints(args,{...env,...patch}),e=>e.details.stage==="authorization");
 for(const patch of [{PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:""},{PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:" a "},
  {PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_B_ID:env.PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID},{PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:"a\nb"},
  {PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID:undefined},{PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID:"not-a-uuid"},
  {PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_B_ID:env.PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID}])
  assert.throws(()=>authorizeMeasurementConstraints(args,{...env,...patch}),e=>e.details.stage==="fixture_authorization");
});
test("wrong database, schema, role, loopback host, port and missing confirmation refuse before connecting",()=>{
 for(const patch of [{PRODUCT_DATABASE_CONFIRMED:undefined},{PRODUCT_MIGRATION_CONFIRMED:undefined},{PRODUCT_TEST_MIGRATION_DATABASE_URL:undefined},
  ...[["/stitchtrack_product_test?","/stitchtrack_product_dev?"],["/stitchtrack_product_test?","/stitchtrack_assessment?"],
   ["_migrator:","_app:"],["_migrator:","_cleanup:"],["127.0.0.1","localhost"],[":5432/",":5433/"],["schema=product","schema=public"]].map(([from,to])=>({PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace(from,to)}))])
  assert.throws(()=>authorizeMeasurementConstraints(args,{...env,...patch}),e=>e.details.stage==="database_configuration");
});
const tableNames=["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort();
function double(options={}){
 const c=config(),calls=[],versions=new Map(),entries=new Map(),savepoints=new Map();let rolledWork=false;
 const oldId="33333333-3333-4333-8333-333333333333";
 versions.set(oldId,{id:oldId,...c.fixtures[0],versionNumber:7,unit:"cm"});entries.set(oldId+"|Existing",{measurementVersionId:oldId,name:"Existing",value:"1.00"});
 const initial={versions:structuredClone(versions),entries:structuredClone(entries)};
 const response=rows=>({rows,rowCount:rows.length});
 // Model selected server comparison outcomes; never use this as evidence of actual PG collation.
 const collator=new Intl.Collator("und",{sensitivity:"accent"});
 const equal=(a,b)=>options.edgeFlip&&["I","\u0130","\u03c3","Stra\u00dfe"].includes(a)?collator.compare(a,b)!==0:collator.compare(a,b)===0;
 const db={calls,versions,entries,initial,async connect(){calls.push("connect");if(options.connect)throw options.connect;},async end(){calls.push("end");if(options.cleanup)throw options.cleanup;},
  async query(sql,values=[]){
   calls.push(sql);options.inject?.(sql,values);
   if(options.noPublicUsage&&/to_regclass\(\s*'public\./u.test(sql))throw fault("42501");
   if(sql==="ROLLBACK"){if(options.rollback)throw options.rollback;versions.clear();entries.clear();for(const [k,v]of initial.versions)versions.set(k,v);for(const [k,v]of initial.entries)entries.set(k,v);return response([]);}
   if(sql.startsWith("SAVEPOINT ")){savepoints.set(sql.slice(10),{versions:structuredClone(versions),entries:structuredClone(entries)});return response([]);}
   if(sql.startsWith("ROLLBACK TO SAVEPOINT ")){const name=sql.slice(22),saved=savepoints.get(name);assert.ok(saved);versions.clear();entries.clear();for(const [k,v]of saved.versions)versions.set(k,v);for(const [k,v]of saved.entries)entries.set(k,v);if(name==="measurement_work")rolledWork=true;return response([]);}
   if(sql.startsWith("RELEASE SAVEPOINT ")){savepoints.delete(sql.slice(18));return response([]);}
   if(sql==="BEGIN"||sql.startsWith("SET LOCAL")||sql.startsWith("LOCK TABLE"))return response([]);
   if(sql.startsWith("SELECT current_database()"))return response([{database:"stitchtrack_product_test",role:options.wrongIdentity?"wrong":c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",encoding:"UTF8",safe:true}]);
   if(sql.startsWith("SELECT c.relname AS name,c.relkind"))return response(tableNames.map(name=>({name,kind:"r",owner:c.target.user})));
   if(sql.startsWith("SELECT pg_get_userbyid(nspowner)"))return response([{owner:c.target.user,isolated_history:!options.publicHistory}]);
   if(sql.startsWith("SELECT migration_name,checksum")){
    const manifest=Object.entries(PRODUCT_MIGRATIONS),history=(options.eighthHistory?manifest.slice(0,8):manifest).map(([migration_name,checksum])=>({migration_name,checksum:options.badHistory?"wrong":checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1}));
    if(options.extraHistory)history.push({...history[8],migration_name:"20990101_unreviewed"});
    if(options.historyPatch)Object.assign(history.at(-1),options.historyPatch);
    return response(history);
   }
   if(sql.startsWith("SELECT c.relname AS table_name"))return response([
    ...[["measurementVersionId","uuid"],["name","text"],["value",options.roundingTypmod?"numeric(6,2)":"numeric"]].map(([name,type])=>({table_name:"MeasurementEntry",name,type,required:true})),
    ...[["id","uuid"],["businessId","text"],["clientId","uuid"],["versionNumber","integer"],["unit","text"],["recordedAt","timestamp(3) with time zone"]].map(([name,type])=>({table_name:"MeasurementVersion",name,type,required:true}))]);
   if(sql.startsWith("SELECT a.attcollation"))return response([{default_label_collation:true}]);
   if(sql.includes("FROM pg_trigger"))return response([{count:0}]);
   if(sql.startsWith("SELECT convalidated AS valid"))return response([{valid:true,deferred:false,deletion:options.cascade?"c":"r",update:"r",parent:true,child_keys:values[1].startsWith("MeasurementVersion")?[2,3]:[1],parent_keys:values[1].startsWith("MeasurementVersion")?[2,1]:[1]}]);
   if(sql.startsWith("SELECT c.relname AS name,i.indisunique"))return response(Object.entries({Client_businessId_id_key:["businessId","id"],MeasurementVersion_pkey:["id"],MeasurementVersion_clientId_versionNumber_key:["clientId","versionNumber"],MeasurementEntry_pkey:["measurementVersionId","name"],MeasurementEntry_version_label_key:["measurementVersionId","name"]}).map(([name,keys])=>({name,keys,unique:true,valid:true,ready:true,unconditional:true,label_collation:!options.indexCollation,
    key_count:keys.length,total_count:keys.length,target:'product."'+(name.startsWith("Client_")?"Client":name.startsWith("MeasurementVersion_")?"MeasurementVersion":"MeasurementEntry")+'"',
    expression:name==="MeasurementEntry_version_label_key"&&options.oldIndex?"lower(name)":null,
    definition:'CREATE UNIQUE INDEX "MeasurementEntry_version_label_key" ON product."MeasurementEntry" USING btree ("measurementVersionId", name COLLATE product.measurement_label_ci)'})));
   if(sql.startsWith("SELECT pg_get_userbyid(c.collowner)"))return response(options.missingCollation?[]:[{owner:c.target.user,provider:"i",deterministic:false,no_rules:true,all_encodings:true,locale:"und-u-kk-ks-level2",recorded:"test-version",actual:"test-version",...options.collationPatch}]);
   if(sql.startsWith("SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_depend"))return response([{linked:!options.noDependency}]);
   if(sql.startsWith("SELECT NOT (rolsuper"))return response([{safe:true,restricted_schema:true}]);
   if(sql.startsWith("SELECT has_table_privilege"))return response([{readable:true,insertable:true,forbidden:!!options.unauthorizedPrivilege}]);
   if(sql.startsWith('SELECT c."id" AS client_id'))return response(options.badFixture?[]:[{client_id:values[0],business_id:values[1]}]);
   if(sql.startsWith('SELECT COALESCE(max("versionNumber")'))return response([{maximum:7}]);
   if(sql.startsWith("SELECT md5(")){const table=sql.match(/FROM product\."(\w+)" t/u)[1];return response([{digest:JSON.stringify(table==="MeasurementVersion"?[...versions]:table==="MeasurementEntry"?[...entries]:options.changedSnapshot&&rolledWork?"changed":"untouched")}]);}
   if(sql.startsWith("SELECT count(*)::int AS count FROM product.")){
    const table=sql.match(/FROM product\."(\w+)"/u)[1];
    let count=table==="MeasurementVersion"?versions.size:table==="MeasurementEntry"?entries.size:1;
    if(sql.includes('WHERE "measurementVersionId"=$1'))count=[...entries.values()].filter(v=>v.measurementVersionId===values[0]).length;
    else if(sql.includes("=ANY($1::uuid[])"))count=table==="MeasurementVersion"?values[0].filter(id=>versions.has(id)).length:[...entries.values()].filter(v=>values[0].includes(v.measurementVersionId)).length;
    else if(options.unbounded)count=10001;
    return response([{count}]);
   }
   if(sql.startsWith('SELECT 1 FROM product."Client"'))return response([]);
   if(sql.startsWith('SELECT 1 FROM product."MeasurementVersion"'))return response(versions.has(values[0])?[{}]:[]);
   if(sql.startsWith("SELECT $1::text COLLATE"))return response([{equal:options.requiredCaseMismatch?false:options.comparisonPatch?.[values[0]]??equal(values[0],values[1])}]);
   if(sql.startsWith('INSERT INTO product."MeasurementVersion"')){
    const [id,businessId,clientId,versionNumber,unit]=values;
    if(id===null||unit===null)throw fault("23502");if(id==="not-a-uuid")throw fault("22P02");
    if(versionNumber<1)throw fault("23514","MeasurementVersion_versionNumber_check");
    if(!["cm","in"].includes(unit))throw fault("23514","MeasurementVersion_unit_check");
    if(!c.fixtures.some(f=>f.clientId===clientId&&f.businessId===businessId))throw fault("23503","MeasurementVersion_businessId_clientId_fkey");
    if(versions.has(id))throw fault("23505","MeasurementVersion_pkey");
    if([...versions.values()].some(v=>v.clientId===clientId&&v.versionNumber===versionNumber))throw fault("23505","MeasurementVersion_clientId_versionNumber_key");
    const v={id,businessId,clientId,versionNumber,unit};versions.set(id,v);return response([{...v,database_time:true}]);
   }
   if(sql.startsWith('INSERT INTO product."MeasurementEntry"')){
    const [measurementVersionId,name,value]=values;
    if(name===null||value===null)throw fault("23502");
    if(!name.trim()||name==="\u0085"||name!==name.trim()||[...name].length>60)throw fault("23514","MeasurementEntry_name_check");
    if((!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>1000||(value.split(".")[1]||"").length>2)&&!(options.acceptPrecision&&value==="1.001"))throw fault("23514","MeasurementEntry_value_check");
    if(!versions.has(measurementVersionId))throw fault("23503","MeasurementEntry_measurementVersionId_fkey");
    if(!(options.acceptUnicodeCollision&&name==="CHEST")&&[...entries.values()].some(v=>v.measurementVersionId===measurementVersionId&&equal(v.name,name)))throw fault("23505",options.wrongConstraint?"PRIVATE constraint":"MeasurementEntry_version_label_key");
    const v={measurementVersionId,name,value};entries.set(measurementVersionId+"|"+name,v);return response([v]);
   }
   throw Error("Unexpected offline SQL shape");
  },
 };
 return db;
}
test("injected happy path exercises rollback, counts, multiple entries and PostgreSQL-observation output",async()=>{
 for(const edgeFlip of [false,true]){
  const db=double({edgeFlip}),r=await runChecks(db);
  assert.equal(r.status,"passed_rolled_back",JSON.stringify(r));assert.equal(r.syntheticVersionsTested,14);assert.ok(r.syntheticEntriesTested>=20);assert.equal(r.retainedSyntheticRows,0);
  assert.equal(r.unicode.length,11);
  for(const id of ["ordinary_case","accented_case","yoruba_case","canonical_forms","multiple_accents"])assert.equal(r.unicode.find(c=>c.case===id).equal,true);
  for(const id of ["accent_distinction","yoruba_accent_distinction"])assert.equal(r.unicode.find(c=>c.case===id).equal,false);
  assert.equal(r.unicode.find(c=>c.case==="greek_final_sigma").equal,!edgeFlip);
  for(const row of r.unicode)assert.equal(row.collision,row.equal);
  assert.equal(r.unicode.find(c=>c.case==="accented_case").collision,true);assert.equal(r.unicode.find(c=>c.case==="yoruba_case").collision,true);
  assert.deepEqual(db.versions,db.initial.versions);assert.deepEqual(db.entries,db.initial.entries);assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");
  assert.ok(r.limitations.includes("complete_sets_and_consecutive_allocation_require_service"));
  assert.doesNotMatch(JSON.stringify(r),/disposable-|synthetic-only|postgresql:|11111111|PRIVATE/u);
 }
});
test("public history absence uses catalogs without public USAGE and still refuses any public history relation",async()=>{
 const check=source.match(/SELECT pg_get_userbyid\(nspowner\) AS owner,[\s\S]+?AS isolated_history[\s\S]+?WHERE nspname='product'/u)?.[0];
 assert.ok(check);assert.match(check,/NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_class c JOIN pg_catalog\.pg_namespace n ON n.oid=c.relnamespace/u);
 assert.match(check,/n.nspname='public' AND c.relname='_prisma_migrations'/u);
 assert.doesNotMatch(check,/relkind|to_regclass|public\./u);
 for(const publicHistory of [false,true]){
  const db=double({noPublicUsage:true,publicHistory}),r=await runChecks(db);
  if(publicHistory){
   assert.deepEqual(r,{status:"failed",failures:[{stage:"schema_tables"}],noAutomaticRetry:true});
   assert.equal(db.calls.some(sql=>sql.startsWith('INSERT INTO product.')),false);
  }else assert.equal(r.status,"passed_rolled_back",JSON.stringify(r));
  assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");
  assert.deepEqual(db.versions,db.initial.versions);assert.deepEqual(db.entries,db.initial.entries);
 }
});
test("identity, history, exact decimal metadata, FK, permissions, fixtures and bounded snapshots fail closed",async()=>{
 for(const [options,stage]of [[{wrongIdentity:true},"connection_identity"],[{badHistory:true},"migration_history"],[{roundingTypmod:true},"schema_metadata"],
  [{cascade:true},"schema_metadata"],[{indexCollation:true},"schema_metadata"],[{unauthorizedPrivilege:true},"application_privileges"],[{badFixture:true},"fixture_pairs"],[{unbounded:true},"snapshot_before"],[{changedSnapshot:true},"snapshot_after"]]){
  const db=double(options),r=await runChecks(db);assert.deepEqual(r,{status:"failed",failures:[{stage}],noAutomaticRetry:true});
  assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");assert.deepEqual(db.versions,db.initial.versions);
 }
});
test("unexpectedly accepted precision, wrong unique constraint and required Unicode mismatch cannot pass",async()=>{
 for(const [options,expected]of [[{acceptPrecision:true},{stage:"value_excess_precision"}],[{wrongConstraint:true},{stage:"label_exact_duplicate",sqlstate:"23505"}],[{requiredCaseMismatch:true},{stage:"ordinary_case"}]]){
  const db=double(options),r=await runChecks(db);assert.deepEqual(r,{status:"failed",failures:[expected],noAutomaticRetry:true});
  assert.ok(db.calls.includes("ROLLBACK"));assert.deepEqual(db.versions,db.initial.versions);assert.deepEqual(db.entries,db.initial.entries);
 }
});
test("connection/lock/timeouts and rollback/cleanup errors retain only safe stages and SQLSTATE",async()=>{
 for(const [options,expected]of [[{connect:fault("08006")},[{stage:"connection",sqlstate:"08006"}]],
  [{inject:sql=>{if(sql.startsWith("LOCK TABLE"))throw fault("55P03");}},[{stage:"table_locks",sqlstate:"55P03"}]],
  [{inject:sql=>{if(sql==="BEGIN")throw fault("08006");}},[{stage:"begin",sqlstate:"08006"}]],
  [{inject:sql=>{if(sql==="ROLLBACK TO SAVEPOINT expected_failure")throw fault("08006");}},[{stage:"rollback_expected_failure",sqlstate:"08006"}]],
  [{rollback:fault("08006"),cleanup:fault("08003")},[{stage:"rollback",sqlstate:"08006"},{stage:"connection_cleanup",sqlstate:"08003"}]],
 ]){
  const db=double(options),r=await runChecks(db);assert.deepEqual(r,{status:"failed",failures:expected,noAutomaticRetry:true});
  if(!options.connect)assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");assert.doesNotMatch(JSON.stringify(r),/PRIVATE|password|parameters/u);
 }
 assert.deepEqual(measurementConstraintFailureDetails("PRIVATE",{code:"PRIVATE",message:"PRIVATE"}),{stage:"internal"});
 assert.deepEqual(measurementConstraintFailureDetails("unit_invalid",fault("23514")),{stage:"unit_invalid",sqlstate:"23514"});
});
test("only measurement INSERTs are possible; immutable records, guarded parent fixtures and all nine migrations remain scoped",()=>{
 assert.deepEqual([...source.matchAll(/INSERT INTO product\."(\w+)"/gu)].map(m=>m[1]),["MeasurementVersion","MeasurementEntry"]);
 assert.doesNotMatch(source,/\bDELETE\s+FROM\b|\bUPDATE\s+product\.|CREATE TABLE|ALTER TABLE|GRANT |TRUNCATE |query\(["'`]COMMIT/u);
 for(const text of ["history.length,9","host(inet_server_addr())","host(inet_client_addr())","IN SHARE ROW EXCLUSIVE MODE","10000",
  '"ROLLBACK"','"ROLLBACK TO SAVEPOINT measurement_work"','"ROLLBACK TO SAVEPOINT expected_failure"',"assert.equal(error.code,code)",
 ])assert.ok(source.includes(text),text);
 for(const text of ["label_61","label_unicode_trim","Hip","Thigh","Agbada Length","accented_case","yoruba_case","canonical_forms","turkish_dotless_i","greek_final_sigma","sharp_s","1.001","1000.01","-Infinity"])
  assert.ok(source.includes(text),text);
 assert.match(source,/connectionTimeoutMillis:5000,statement_timeout:10000/u);
 assert.match(source,/finally\{[\s\S]+db.query\("ROLLBACK"\)[\s\S]+db.end\(\)/u);
});

test("incompatible or incomplete migration history refuses before measurement inserts",async()=>{
 for(const options of [{eighthHistory:true},{extraHistory:true},{historyPatch:{finished_at:null}},{historyPatch:{rolled_back_at:new Date()}},
  {historyPatch:{logs:"PRIVATE"}},{historyPatch:{applied_steps_count:0}},{historyPatch:{migration_name:"20990101_unreviewed"}}]){
  const db=double(options);
  assert.deepEqual(await runChecks(db),{status:"failed",failures:[{stage:"migration_history"}],noAutomaticRetry:true});
  assert.equal(db.calls.some(sql=>sql.startsWith('INSERT INTO product.')),false);
  assert.ok(db.calls.includes("ROLLBACK"));assert.equal(db.calls.at(-1),"end");
 }
});
test("dedicated ICU configuration, dependency and non-expression index metadata fail closed",async()=>{
 for(const options of [{oldIndex:true},{missingCollation:true},{noDependency:true},
  ...[{owner:"wrong"},{provider:"c"},{deterministic:true},{no_rules:false},{all_encodings:false},
   {locale:"und-u-ks-level2"},{recorded:null},{actual:"different"}].map(collationPatch=>({collationPatch}))]){
  const db=double(options),r=await runChecks(db);
  assert.deepEqual(r,{status:"failed",failures:[{stage:"schema_metadata"}],noAutomaticRetry:true});
  assert.equal(db.calls.some(sql=>sql.startsWith('INSERT INTO product.')),false);assert.ok(db.calls.includes("ROLLBACK"));
 }
 assert.equal((await runChecks(double({collationPatch:{locale:"und-u-kk-true-ks-level2"}}))).status,"passed_rolled_back");
});
test("required equality and accent distinctions cannot become optional observations; insert enforcement is checked",async()=>{
 for(const [left,stage,expected]of [["Chest","ordinary_case",true],["\u00c9paule","accented_case",true],["\u00ccB\u00c0D\u00cd","yoruba_case",true],
  ["\u00e9paule","canonical_forms",true],["e\u0323\u0302","multiple_accents",true],["Epaule","accent_distinction",false],["\u00ecb\u00e0d\u00ed","yoruba_accent_distinction",false]]){
  const db=double({comparisonPatch:{[left]:!expected}}),r=await runChecks(db);
  assert.deepEqual(r,{status:"failed",failures:[{stage}],noAutomaticRetry:true});assert.ok(db.calls.includes("ROLLBACK"));
  assert.deepEqual(db.versions,db.initial.versions);assert.deepEqual(db.entries,db.initial.entries);
 }
 const db=double({acceptUnicodeCollision:true});
 assert.deepEqual(await runChecks(db),{status:"failed",failures:[{stage:"ordinary_case"}],noAutomaticRetry:true});
 assert.deepEqual(db.entries,db.initial.entries);
 assert.match(source,/SELECT \$1::text COLLATE product\.measurement_label_ci=\$2::text AS equal/u);
 assert.doesNotMatch(source,/lower\(\$1|lower_equal/u);
});
