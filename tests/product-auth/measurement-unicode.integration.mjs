// Owner-only nine-migration proof. No deployment, fixture bootstrap, cleanup, retry or migration resolve.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,fsyncSync,lstatSync,realpathSync} from "node:fs";
import {resolve,dirname,isAbsolute,sep} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {snapshot,applicationPrivileges} from "./measurement-constraints.integration.mjs";
const ninth="20261108_measurement_label_unicode",prior=Object.keys(PRODUCT_MIGRATIONS).filter(n=>n<ninth).sort();
const modes={"--owner-unicode-success-before":"success_before","--owner-measurement-unicode-proof":"post",
 "--owner-unicode-collision-before":"collision_before","--owner-unicode-collision-after":"collision_after"};
const tables=["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort();
const pairs=[
 ["ordinary_case","Chest","CHEST",true],["accented_case","\u00c9paule","\u00e9PAULE",true],
 ["yoruba_case","\u00ccB\u00c0D\u00cd","\u00ecb\u00e0d\u00ed",true],["canonical_forms","\u00e9paule","e\u0301paule",true],
 ["multiple_accents","e\u0323\u0302","e\u0302\u0323",true],["accent_distinction","Epaule","\u00e9paule",false],
 ["yoruba_accent_distinction","\u00ecb\u00e0d\u00ed","\u00ecb\u00e1d\u00ed",false],
 ["turkish_dotless_i","I","\u0131",null],["turkish_dotted_i","\u0130","i",null],
 ["greek_final_sigma","\u03c3","\u03c2",null],["sharp_s","Stra\u00dfe","STRASSE",null],
];
const stageNames=new Set(["internal","authorization","fixtures","configuration","migration_files","receipt_read","receipt_write","connection","begin","settings",
 "identity","tables","locks","history","metadata","privileges","fixture_pairs","snapshot_before","baseline_compare","work","version","value_contract",
 "same_label_other_version","rows","work_rollback","snapshot_after","collision_scope","collision_rows","collision_compare","expected_rollback","rollback","cleanup",...pairs.map(p=>p[0])]);
const codes=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","42883","23502","23503","23505","23514","25P02","57014","55P03","40P01","40001","22P02"]);
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const unicodeProofFailure=(stage,e)=>({stage:stageNames.has(stage)?stage:"internal",...(codes.has(e?.code)?{sqlstate:e.code}:{})});
class Failure extends Error{constructor(stage,e){super("Guarded Unicode proof refused.");this.detail=unicodeProofFailure(stage,e);}}
const detail=(stage,e)=>e instanceof Failure?e.detail:unicodeProofFailure(stage,e);
const uuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(s);
export function authorizeUnicodeProof(args,env){
 const mode=args.length===1&&Object.hasOwn(modes,args[0])?modes[args[0]]:undefined;
 if(!mode||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||env.PRODUCT_MEASUREMENT_UNICODE_PROOF_CONFIRMED!=="true"||
  env.PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED!=="true"||["NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k])||
  (mode==="post"&&env.PRODUCT_MEASUREMENT_UNICODE_WRITES_CONFIRMED!=="true")||
  (mode.startsWith("collision_")&&env.PRODUCT_UNICODE_COLLISION_DISPOSABLE_INSTANCE_CONFIRMED!=="true"))throw new Failure("authorization");
 const fixtures=["A","B"].map(s=>({businessId:env["PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_"+s+"_ID"],clientId:env["PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_"+s+"_ID"]}));
 if(fixtures.some(f=>typeof f.businessId!=="string"||!f.businessId||f.businessId!==f.businessId.trim()||f.businessId.length>200||/[\x00-\x1f\x7f]/u.test(f.businessId)||!uuid(f.clientId))||
  fixtures[0].businessId===fixtures[1].businessId||fixtures[0].clientId.toLowerCase()===fixtures[1].clientId.toLowerCase())throw new Failure("fixtures");
 fixtures.forEach(f=>f.clientId=f.clientId.toLowerCase());
 const receiptPath=env.PRODUCT_MEASUREMENT_UNICODE_RECEIPT_PATH,collisionVersion=env.PRODUCT_UNICODE_COLLISION_VERSION_ID;
 if(typeof receiptPath!=="string"||!isAbsolute(receiptPath)||(mode.startsWith("collision_")&&!uuid(collisionVersion)))throw new Failure("configuration");
 let target;try{target=productMigrationConfig(env);assert.equal(target.mode,"test");assert.equal(target.user,"stitchtrack_product_test_migrator");}catch(e){throw new Failure("configuration",e);}
 try{assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);assert.equal(prior.length,8);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),ninth);}catch(e){throw new Failure("migration_files",e);}
 return {mode,target,fixtures,receiptPath,collisionVersion:collisionVersion?.toLowerCase()};
}
function privatePath(path){
 const full=resolve(path),parent=dirname(full),root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
 assert.ok(full!==root&&!full.startsWith(root+sep));assert.equal(realpathSync(parent),parent);
 const st=lstatSync(parent);assert.ok(st.isDirectory()&&!st.isSymbolicLink());assert.equal(st.uid,process.getuid());assert.equal(st.mode&0o077,0);return full;
}
export const privateReceipt={
 read(path){const fd=openSync(privatePath(path),constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const st=fstatSync(fd);assert.ok(st.isFile()&&st.nlink===1&&st.size>0&&st.size<=65536);assert.equal(st.uid,process.getuid());assert.equal(st.mode&0o077,0);
  return JSON.parse(readFileSync(fd,"utf8"));
 }finally{closeSync(fd);}},
 write(path,value){const full=privatePath(path),fd=openSync(full,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(value)+"\n");fsyncSync(fd);}finally{closeSync(fd);}
  const dir=openSync(dirname(full),constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(dir);}finally{closeSync(dir);}
 },
};
function validateReceipt(r,c){
 assert.deepEqual(Object.keys(r).sort(),["version","purpose","fixtures","collisionVersion","migration","identity","snapshot","oldHistory","stable","labelIndex"].sort());
 assert.equal(r.version,1);assert.equal(r.purpose,c.mode==="post"?"success":"collision");assert.deepEqual(r.fixtures,c.fixtures);
 assert.equal(r.collisionVersion,c.mode==="post"?null:c.collisionVersion);assert.equal(r.migration,PRODUCT_MIGRATIONS[ninth]);
 assert.equal(typeof r.identity,"string");assert.match(r.identity,/^[0-9a-f]{64}$/u);assert.match(r.oldHistory,/^[0-9a-f]{64}$/u);assert.match(r.stable,/^[0-9a-f]{64}$/u);
 assert.deepEqual(r.snapshot.map(s=>s.table),tables.filter(t=>t!=="_prisma_migrations"));
 for(const s of r.snapshot){assert.deepEqual(Object.keys(s).sort(),["table","count","digest"].sort());assert.ok(Number.isInteger(s.count)&&s.count>=0&&s.count<=10000);assert.match(s.digest,/^[0-9a-f]{32}$/u);}
 assert.ok(r.labelIndex&&typeof r.labelIndex==="object"&&!Array.isArray(r.labelIndex));
}
async function schemaMetadata(db,post){
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
 const {rows:constraints}=await db.query(`SELECT conname AS name,contype AS type,convalidated AS valid,condeferrable AS deferred,
  pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint WHERE conrelid=ANY($1::regclass[]) ORDER BY conname COLLATE "C"`,
  [['product."MeasurementEntry"','product."MeasurementVersion"']]);
 const expectedConstraints={MeasurementEntry_measurementVersionId_fkey:"f",MeasurementEntry_name_check:"c",MeasurementEntry_pkey:"p",MeasurementEntry_value_check:"c",
  MeasurementVersion_businessId_clientId_fkey:"f",MeasurementVersion_pkey:"p",MeasurementVersion_unit_check:"c",MeasurementVersion_versionNumber_check:"c"};
 assert.deepEqual(constraints.map(c=>c.name),Object.keys(expectedConstraints).sort());
 for(const c of constraints){assert.equal(c.type,expectedConstraints[c.name]);assert.equal(c.valid,true);assert.equal(c.deferred,false);assert.equal(typeof c.definition,"string");assert.ok(c.definition);}
 const relations=[];
 for(const [table,constraint,parent,childKeys,parentKeys]of [
  ["MeasurementVersion","MeasurementVersion_businessId_clientId_fkey","Client",[2,3],[2,1]],
  ["MeasurementEntry","MeasurementEntry_measurementVersionId_fkey","MeasurementVersion",[1],[1]]]){
  const {rows:[fk]}=await db.query(`SELECT convalidated AS valid,condeferrable AS deferred,confdeltype AS deletion,confupdtype AS update,
   confrelid=$3::regclass AS parent,conkey AS child_keys,confkey AS parent_keys FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2 AND contype='f'`,
   ['product."'+table+'"',constraint,'product."'+parent+'"']);
  assert.deepEqual(fk,{valid:true,deferred:false,deletion:"r",update:"r",parent:true,child_keys:childKeys,parent_keys:parentKeys});relations.push(fk);
 }
 const {rows:indexes}=await db.query(`SELECT c.relname AS name,i.indisunique AS unique,i.indisvalid AS valid,i.indisready AS ready,i.indpred IS NULL AS unconditional,
  ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,position)
   LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.position) AS keys,
  c.oid::text AS oid,i.indisprimary AS primary,i.indnkeyatts AS key_count,i.indnatts AS total_count,i.indrelid::regclass::text AS target,
  pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indexprs,i.indrelid) AS expression,
  CASE WHEN c.relname='MeasurementEntry_version_label_key' THEN i.indcollation[1]=
   CASE WHEN $2::boolean THEN (SELECT c.oid FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='product' AND c.collname='measurement_label_ci')
   ELSE (SELECT attcollation FROM pg_attribute WHERE attrelid='product."MeasurementEntry"'::regclass AND attname='name') END ELSE true END AS label_collation
  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND (c.relname=ANY($1::text[]) OR i.indrelid=ANY(ARRAY['product."MeasurementVersion"'::regclass,'product."MeasurementEntry"'::regclass]))`,[
  ["Client_businessId_id_key","MeasurementVersion_pkey","MeasurementVersion_clientId_versionNumber_key","MeasurementEntry_pkey","MeasurementEntry_version_label_key"],post]);
 assert.equal(indexes.length,5);
 for(const [name,keys]of Object.entries({Client_businessId_id_key:["businessId","id"],MeasurementVersion_pkey:["id"],
  MeasurementVersion_clientId_versionNumber_key:["clientId","versionNumber"],MeasurementEntry_pkey:["measurementVersionId","name"],MeasurementEntry_version_label_key:["measurementVersionId",post?"name":null]})){
  const index=indexes.find(i=>i.name===name);assert.ok(index);assert.equal(index.unique,true);assert.equal(index.valid,true);assert.equal(index.ready,true);assert.equal(index.unconditional,true);assert.equal(index.label_collation,true);assert.deepEqual(index.keys,keys);assert.equal(index.key_count,keys.length);assert.equal(index.total_count,keys.length);
  assert.equal(index.primary,name==="MeasurementVersion_pkey"||name==="MeasurementEntry_pkey");
  assert.equal(index.target,'product."'+(name.startsWith("Client_")?"Client":name.startsWith("MeasurementVersion_")?"MeasurementVersion":"MeasurementEntry")+'"');
  if(name==="MeasurementEntry_version_label_key"&&!post)assert.match(index.expression,/^lower\((?:name|"name")\)$/u);else assert.equal(index.expression,null);
  if(name==="MeasurementEntry_version_label_key"&&post)assert.match(index.definition,/^CREATE UNIQUE INDEX "MeasurementEntry_version_label_key" ON product\."MeasurementEntry" USING btree \("measurementVersionId", (?:name|"name") COLLATE product\.measurement_label_ci\)$/u);
 }
 return {stable:hash({columns,relations,constraints,indexes:indexes.filter(i=>i.name!=="MeasurementEntry_version_label_key").sort((a,b)=>a.name.localeCompare(b.name))}),labelIndex:indexes.find(i=>i.name==="MeasurementEntry_version_label_key")};
}

async function collationMetadata(db,post){
 const {rows}=await db.query(`SELECT pg_get_userbyid(c.collowner) AS owner,c.collprovider AS provider,c.collisdeterministic AS deterministic,
  c.colliculocale AS locale,c.collicurules IS NULL AS no_rules,c.collencoding=-1 AS all_encodings,c.collversion AS recorded,pg_collation_actual_version(c.oid) AS actual
  FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='product' AND c.collname='measurement_label_ci'`);
 if(!post){assert.equal(rows.length,0);return;}
 assert.equal(rows.length,1);const r=rows[0];assert.equal(r.owner,"stitchtrack_product_test_migrator");assert.equal(r.provider,"i");assert.equal(r.deterministic,false);assert.equal(r.no_rules,true);assert.equal(r.all_encodings,true);
 assert.ok(["und-u-kk-true-ks-level2","und-u-kk-ks-level2"].includes(r.locale));assert.ok(r.recorded);assert.equal(r.recorded,r.actual);
 const {rows:[dependency]}=await db.query(`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
  WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid='product."MeasurementEntry_version_label_key"'::regclass
   AND d.refclassid='pg_catalog.pg_collation'::regclass AND d.refobjid='product.measurement_label_ci'::regcollation) AS linked`);
 assert.deepEqual(dependency,{linked:true});
}
async function collisionRows(db,c,snap){
 // Whole-instance rehearsal boundary: only the two approved synthetic parent sets and one collision version.
 const expected={User:2,Account:2,Session:0,Verification:0,TermsVersion:0,TermsAcceptance:0,EmailOutbox:0,EmailVerificationIssuance:0,AuthRateBucket:0,
  Business:2,BusinessMember:2,Client:2,MeasurementVersion:1,MeasurementEntry:2};
 for(const s of snap)assert.equal(s.count,expected[s.table]);
 const {rows:[v]}=await db.query('SELECT "id","businessId","clientId" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[c.collisionVersion]);
 assert.deepEqual(v,{id:c.collisionVersion,...c.fixtures[0]});
 const {rows}=await db.query(`SELECT encode(convert_to("name",'UTF8'),'hex') AS bytes,"value"::text AS value
  FROM product."MeasurementEntry" WHERE "measurementVersionId"=$1::uuid ORDER BY "name" COLLATE "C"`,[c.collisionVersion]);
 assert.deepEqual(rows,["\u00c9paule","\u00e9PAULE"].map(s=>({bytes:Buffer.from(s,"utf8").toString("hex"),value:"1.00"})));
}
export async function runUnicodeProof(c,providedClient,receipts=privateReceipt){
 let db=providedClient,stage="receipt_read",transaction=false,candidate,output,baseline;
 const failures=[];
 try{
  if(c.mode==="post"||c.mode==="collision_after"){baseline=await receipts.read(c.receiptPath);validateReceipt(baseline,c);}
  stage="connection";if(!db){const {Client}=await import("pg");db=new Client({connectionString:c.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,
   connectionTimeoutMillis:5000,statement_timeout:10000,application_name:"stitchtrack-unicode-proof"});}
  await db.connect();stage="begin";transaction=true;
  await db.query(c.mode==="post"?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  stage="settings";await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage="identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
   host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,
   current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,pg_postmaster_start_time()::text AS started,
   (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,
   NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  assert.deepEqual(Object.keys(identity).sort(),["database","role","session_role","host","peer","port","timezone","encoding","version","started","database_oid","safe"].sort());
  assert.equal(identity.database,"stitchtrack_product_test");assert.equal(identity.role,"stitchtrack_product_test_migrator");assert.equal(identity.session_role,identity.role);
  assert.equal(identity.host,"127.0.0.1");assert.equal(identity.peer,"127.0.0.1");assert.equal(identity.port,"5432");assert.equal(identity.timezone,"UTC");assert.equal(identity.encoding,"UTF8");assert.equal(identity.safe,true);
  assert.ok(Number.isInteger(identity.version)&&identity.version>=160000&&identity.version<170000);assert.equal(typeof identity.started,"string");assert.match(identity.database_oid,/^[0-9]+$/u);
  stage="tables";const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
  assert.deepEqual(actual.map(r=>r.name),tables);assert.ok(actual.every(r=>r.kind==="r"&&r.owner===identity.role));
  const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated
   FROM pg_catalog.pg_namespace WHERE nspname='product'`);assert.deepEqual(schema,{owner:identity.role,isolated:true});
  stage="locks";await db.query('LOCK TABLE '+tables.map(t=>'product."'+t+'"').join(',')+(c.mode==="post"?' IN SHARE ROW EXCLUSIVE MODE':' IN ACCESS SHARE MODE'));
  stage="history";const {rows:history}=await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count,to_jsonb(t)::text AS record FROM product._prisma_migrations t');
  const old=history.filter(h=>h.migration_name!==ninth),nine=history.filter(h=>h.migration_name===ninth);
  assert.deepEqual(old.map(h=>h.migration_name).sort(),prior);
  assert.ok(old.every(h=>h.checksum===PRODUCT_MIGRATIONS[h.migration_name]&&h.finished_at&&!h.rolled_back_at&&h.logs===null&&h.applied_steps_count===1));
  if(c.mode.endsWith("_before")){assert.equal(history.length,8);assert.equal(nine.length,0);}
  else{
   assert.equal(history.length,9);assert.equal(nine.length,1);assert.equal(nine[0].checksum,PRODUCT_MIGRATIONS[ninth]);assert.equal(nine[0].rolled_back_at,null);
   if(c.mode==="post"){assert.ok(nine[0].finished_at);assert.equal(nine[0].logs,null);assert.equal(nine[0].applied_steps_count,1);}
   else{assert.equal(nine[0].finished_at,null);assert.equal(nine[0].applied_steps_count,0);assert.equal(typeof nine[0].logs,"string");assert.ok(nine[0].logs.includes("Measurement label collisions require separate owner review; no labels changed"));}
  }
  const oldHistory=hash(old.sort((a,b)=>a.migration_name.localeCompare(b.migration_name)).map(h=>h.record));
  stage="metadata";const meta=await schemaMetadata(db,c.mode==="post");await collationMetadata(db,c.mode==="post");
  stage="privileges";await applicationPrivileges(db);
  stage="fixture_pairs";for(const f of c.fixtures){
   const {rows:[r]}=await db.query(`SELECT c."id" AS client_id,c."businessId" AS business_id FROM product."Client" c JOIN product."Business" b ON b."id"=c."businessId"
    JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId" JOIN product."User" u ON u."id"=b."primaryOwnerUserId"
    WHERE c."id"=$1::uuid AND c."businessId"=$2 AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
    AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[f.clientId,f.businessId]);
   assert.deepEqual(r,{client_id:f.clientId,business_id:f.businessId});
  }
  stage="snapshot_before";const before=await snapshot(db),data=before.filter(s=>s.table!=="_prisma_migrations");
  if(c.mode.startsWith("collision_")){stage="collision_scope";await collisionRows(db,c,data);}
  if(baseline){stage="baseline_compare";assert.equal(baseline.identity,hash(identity));assert.equal(baseline.oldHistory,oldHistory);assert.equal(baseline.stable,meta.stable);assert.deepEqual(data,baseline.snapshot);
   if(c.mode==="collision_after"){stage="collision_compare";assert.deepEqual(meta.labelIndex,baseline.labelIndex);}
  }
  if(c.mode.endsWith("_before")){
   candidate={version:1,purpose:c.mode==="success_before"?"success":"collision",fixtures:c.fixtures,collisionVersion:c.mode==="success_before"?null:c.collisionVersion,
    migration:PRODUCT_MIGRATIONS[ninth],identity:hash(identity),snapshot:data,oldHistory,stable:meta.stable,labelIndex:meta.labelIndex};
   output={status:c.mode==="success_before"?"success_baseline_recorded":"collision_baseline_recorded",databaseMutation:false,noAutomaticRetry:true};
  }else if(c.mode==="collision_after")output={status:"collision_refusal_verified",originalRowsAndIndex:"unchanged",collation:"absent",failedHistory:"inspected_not_resolved",databaseMutation:false,noAutomaticRetry:true};
  else{
   stage="work";await db.query("SAVEPOINT unicode_work");const ids=[],expected=[],observations=[];let entries=0;
   stage="version";const {rows:[max]}=await db.query('SELECT COALESCE(max("versionNumber"),0)::int AS maximum FROM product."MeasurementVersion" WHERE "clientId"=$1::uuid',[c.fixtures[0].clientId]);
   assert.ok(Number.isInteger(max.maximum)&&max.maximum>=0&&max.maximum<2147483600);let number=max.maximum;
   const version=async()=>{const id=randomUUID();await db.query('INSERT INTO product."MeasurementVersion" ("id","businessId","clientId","versionNumber","unit") VALUES($1::uuid,$2,$3::uuid,$4,\'cm\')',[id,c.fixtures[0].businessId,c.fixtures[0].clientId,++number]);ids.push(id);return id;};
   const entry=async(id,label,value="1.00")=>{await db.query('INSERT INTO product."MeasurementEntry" ("measurementVersionId","name","value") VALUES($1::uuid,$2,$3::numeric)',[id,label,value]);expected.push({id,bytes:Buffer.from(label,"utf8").toString("hex"),value});entries++;};
   const reject=async(fn,code,constraint)=>{await db.query("SAVEPOINT unicode_expected");let error;try{await fn();}catch(e){error=e;}
    try{await db.query("ROLLBACK TO SAVEPOINT unicode_expected");await db.query("RELEASE SAVEPOINT unicode_expected");}catch(e){throw new Failure("expected_rollback",e);}
    try{assert.ok(error);assert.equal(error.code,code);if(constraint)assert.equal(error.constraint,constraint);}catch{throw new Failure(stage,error);}
   };
   for(const [id,a,b,wanted]of pairs){stage=id;const v=await version();
    const {rows:[comparison]}=await db.query('SELECT $1::text COLLATE product.measurement_label_ci=$2::text AS equal',[a,b]);assert.equal(typeof comparison.equal,"boolean");
    if(wanted!==null)assert.equal(comparison.equal,wanted);await entry(v,a);
    if(comparison.equal)await reject(()=>entry(v,b),"23505","MeasurementEntry_version_label_key");else await entry(v,b);
    observations.push({case:id,equal:comparison.equal});
   }
   stage="same_label_other_version";await entry(await version(),"Chest");
   stage="value_contract";const values=await version();for(const [i,value]of ["0.01","1000.00"].entries())await entry(values,"Value "+i,value);
   for(const value of ["0","-1","1000.01","1.001"])await reject(()=>entry(values,"Invalid",value),"23514","MeasurementEntry_value_check");
   stage="rows";const {rows}=await db.query(`SELECT "measurementVersionId" AS id,encode(convert_to("name",'UTF8'),'hex') AS bytes,"value"::text AS value
    FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[])`,[ids]);
   const sorted=a=>a.sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));assert.deepEqual(sorted(rows),sorted(expected));
   stage="work_rollback";await db.query("ROLLBACK TO SAVEPOINT unicode_work");await db.query("RELEASE SAVEPOINT unicode_work");
   stage="snapshot_after";assert.deepEqual(await snapshot(db),before);
   output={status:"passed_rolled_back",syntheticVersions:ids.length,syntheticEntries:entries,retainedSyntheticRows:0,unicode:observations,
    preserved:"baseline_records_schema_and_privileges",noAutomaticRetry:true,limitations:["no_complete_set_or_consecutive_number_proof","no_runtime_role_connection","no_concurrency_proof"]};
  }
 }catch(e){failures.push(detail(stage,e));}
 finally{if(transaction)try{await db.query("ROLLBACK");}catch(e){failures.push(detail("rollback",e));}if(db)try{await db.end();}catch(e){failures.push(detail("cleanup",e));}}
 if(!failures.length&&candidate)try{await receipts.write(c.receiptPath,candidate);}catch(e){failures.push(detail("receipt_write",e));}
 return failures.length?{status:"failed",failures,noAutomaticRetry:true}:output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runUnicodeProof(authorizeUnicodeProof(process.argv.slice(2),process.env));}catch(e){result={status:"failed",failures:[detail("internal",e)],noAutomaticRetry:true};}
 if(result.status==="failed"){console.error(JSON.stringify(result));process.exitCode=1;}else console.log(JSON.stringify(result));
}
