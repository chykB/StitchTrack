// OWNER ONLY. Inert on import. Observer SQL is read-only; real API writes commit independently.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {dirname} from "node:path";
import {constants,openSync,fsyncSync,closeSync,realpathSync} from "node:fs";
import {authorizeClientApiProof,saveClientApiInventory} from "./client-api.integration.mjs";
import {applicationPrivileges} from "./measurement-constraints.integration.mjs";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
import {measurementPath,measurementRequestSchema,measurementSingleReplySchema,measurementListReplySchema} from "../../lib/measurement-contract.ts";
const origin="http://127.0.0.1:3000";
export const measurementApiSnapshotTables=["Account","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Session","TermsAcceptance","TermsVersion","User","Verification"].sort();
const tables=measurementApiSnapshotTables;
const stages=new Set(["authorization","connection","database_identity","schema_tables","application_privileges","icu_metadata","fixture_a_owner","fixture_b_owner",
 "fixture_a_client","fixture_b_client","fixture_a_session","fixture_b_session","fixture_a_history","fixture_b_history","distinct_owners","fresh_ids","baseline",
 "http_session_identity","list_a","list_b","invalid_session","cross_business","preflight_snapshot","inventory","refill_invalid","refill_create","refill_concurrent",
 "invalid_empty","invalid_nul","invalid_blank","invalid_duplicate","invalid_oversized","invalid_absence","create","get","retry","conflict","concurrent",
 "stored_versions","stored_entries","final_list","unrelated_snapshot","observer_rollback","connection_cleanup","finish_receipt","internal"]);
const states=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","42883","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
class StatusFailure extends Error{constructor(actual,expected){super("Unexpected HTTP status.");this.actual=actual;this.expected=expected;}}
class RollbackFailure extends Error{}
export function measurementApiProofFailure(stage,inventorySaved,writeStarted,error){return {status:"failed",stage:stages.has(stage)?stage:"internal",inventorySaved,
 possibleCommittedVersions:writeStarted?8:0,noAutomaticRetry:true,...(states.has(error?.code)?{sqlstate:error.code}:{}),
 ...(error instanceof StatusFailure?{actualHttpStatus:error.actual,expectedHttpStatus:error.expected}:{})};}
export function authorizeMeasurementApiProof(args,env){
 assert.equal(args.length,1);assert.ok(["--owner-measurement-api-preflight","--owner-measurement-api-write-proof"].includes(args[0]));
 assert.equal(env.PRODUCT_MEASUREMENT_API_PROOF_CONFIRMED,"true");assert.equal(env.PRODUCT_MEASUREMENT_API_FIXTURES_CONFIRMED,"true");
 const write=args[0]==="--owner-measurement-api-write-proof";
 const base=authorizeClientApiProof([write?"--owner-client-api-write-proof":"--owner-client-api-preflight"],{...env,
  PRODUCT_CLIENT_API_PROOF_CONFIRMED:env.PRODUCT_MEASUREMENT_API_PROOF_CONFIRMED,PRODUCT_CLIENT_API_FIXTURES_CONFIRMED:env.PRODUCT_MEASUREMENT_API_FIXTURES_CONFIRMED,
  PRODUCT_CLIENT_API_WRITES_CONFIRMED:env.PRODUCT_MEASUREMENT_API_WRITES_CONFIRMED,PRODUCT_CLIENT_API_INVENTORY:env.PRODUCT_MEASUREMENT_API_INVENTORY,
  PRODUCT_CLIENT_API_BUSINESS_A_ID:env.PRODUCT_MEASUREMENT_API_BUSINESS_A_ID,PRODUCT_CLIENT_API_BUSINESS_B_ID:env.PRODUCT_MEASUREMENT_API_BUSINESS_B_ID,
  PRODUCT_CLIENT_API_COOKIE_A:env.PRODUCT_MEASUREMENT_API_COOKIE_A,PRODUCT_CLIENT_API_COOKIE_B:env.PRODUCT_MEASUREMENT_API_COOKIE_B});
 const clients=["A","B"].map(s=>clientIdSchema.parse(env["PRODUCT_MEASUREMENT_API_CLIENT_"+s+"_ID"]));assert.notEqual(...clients);
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);
 return {...base,clients};
}
export function saveMeasurementApiInventory(path,value){
 // Reuse exclusive owner-only/outside-Git file creation; persist the directory entry too.
 saveClientApiInventory(path,value);
 const fd=openSync(realpathSync(dirname(path)),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
export async function measurementApiProofRequest(cookie,body,{request=fetch,expectedStatus=200,deadline=Date.now()+900000}={}){
 assert.ok(Date.now()<deadline);
 const response=await request(origin+measurementPath,{method:"POST",headers:{origin,"content-type":"application/json",cookie},body:JSON.stringify(body),
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(Math.min(15000,deadline-Date.now()))});
 assert.equal(response.redirected,false);assert.equal(response.headers.has("set-cookie"),false);
 if(response.status!==expectedStatus){await response.body?.cancel();throw new StatusFailure(response.status,expectedStatus);}
 assert.ok(response.headers.get("content-type")?.startsWith("application/json"));return response.json();
}
const ordered=entries=>[...entries].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
export function measurementApiPlan(clientId,maximum){
 assert.ok(Number.isInteger(maximum)&&maximum>=0&&maximum<2147483600);
 const make=(purpose,unit,entries,expectedVersionNumbers)=>({purpose,expectedVersionNumbers,body:{operation:"create",id:randomUUID(),clientId,unit,entries}});
 return [make("initial","cm",[{name:"Waist (Round)",value:"40.25"},{name:"Agbada Width",value:"1000"},{name:"e\u0301paule",value:"0.01"}],[maximum+1]),
  make("concurrent_a","cm",[{name:"Hip",value:"41.5"},{name:"Thigh",value:"23.75"}],[maximum+2,maximum+3]),
  make("concurrent_b","in",[{name:"Hip",value:"16.5"},{name:"Thigh",value:"9.25"}],[maximum+2,maximum+3]),
  make("invalid_empty","cm",[],[]),make("invalid_nul","cm",[{name:"Hip\u0000Width",value:"1"}],[]),
  make("invalid_blank","cm",[{name:" \u0085 ",value:"1"}],[]),
  make("invalid_duplicate","cm",[{name:"\u00c9paule",value:"1"},{name:"e\u0301PAULE",value:"2"}],[]),
  make("invalid_oversized","cm",Array.from({length:51},(_,i)=>({name:"Synthetic "+i,value:"1"})),[])];
}
export async function measurementApiSnapshot(db,ids){
  const result=[];for(const table of tables){
   const exclusion=table==="MeasurementVersion"?' WHERE "id"<>ALL($1::uuid[])':table==="MeasurementEntry"?' WHERE "measurementVersionId"<>ALL($1::uuid[])':"";
   const params=exclusion?[ids]:[],count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"'+exclusion,params)).rows[0].count;
   assert.ok(Number.isInteger(count)&&count>=0&&count<=10000);
   const digest=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t'+exclusion,params)).rows[0].digest;
   assert.equal(typeof digest,"string");result.push({table,count,digest});
  }return result;
}
export async function runMeasurementApiProof(config,{db,request=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),save=saveMeasurementApiInventory,tokenDigest,report=()=>{}}={}){
 let phase="connection",inventorySaved=false,writeStarted=false,outcome,inventory,savedVersions,alive=true;
 const runId=randomUUID(),deadline=Date.now()+900000;let plan,ids,baseline;
 const read=async fn=>{
  assert.ok(alive);let value,error;
  try{await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='7s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");value=await fn();}catch(e){error=e;}
  try{await db.query("ROLLBACK");}catch{throw new RollbackFailure();}if(error)throw error;return value;
 };
 const one=(index,body,status=200)=>{assert.ok(alive);return measurementApiProofRequest(config.cookies[index],body,{request,expectedStatus:status,deadline});};
 const snapshots=()=>read(()=>measurementApiSnapshot(db,ids));
 const list=async index=>{
  const versions=[];let cursor;for(let page=0;page<16;page++){
   const reply=measurementListReplySchema.parse(await one(index,{operation:"list",clientId:config.clients[index],limit:2,...(cursor?{cursor}:{})}));
   assert.ok(reply.versions.length<=2);versions.push(...reply.versions);
   if(!reply.nextCursor){assert.equal(new Set(versions.map(v=>v.id)).size,versions.length);for(let i=1;i<versions.length;i++)assert.ok(versions[i-1].versionNumber>versions[i].versionNumber);
    const expected=await read(async()=>(await db.query('SELECT "id","versionNumber" FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid ORDER BY "versionNumber" DESC',[config.businesses[index],config.clients[index]])).rows);
    assert.deepEqual(versions.map(v=>({id:v.id,versionNumber:v.versionNumber})),expected);return versions;
   }cursor=reply.nextCursor;
  }throw Error("Bounded pagination exhausted.");
 };
 const refill=async stage=>{
  phase=stage;assert.ok(Date.now()+config.refillWait<deadline);report({status:"waiting_for_rate_refill",stage,runId});
  for(let left=config.refillWait;left>0;left-=Math.min(left,30000)){await wait(Math.min(left,30000));assert.ok(alive);}
 };
 const checkVersion=(value,p)=>{
  const v=measurementSingleReplySchema.parse(value).version,body=measurementRequestSchema.parse(p.body);
  assert.equal(v.id,body.id);assert.equal(v.clientId,body.clientId);assert.equal(v.unit,body.unit);assert.ok(p.expectedVersionNumbers.includes(v.versionNumber));
  assert.deepEqual(ordered(v.entries),ordered(body.entries));return v;
 };
 try{
  if(!db){const {Client}=await import("pg");db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}
  db.on?.("error",()=>{alive=false;});await db.connect();report({status:"started",runId,mode:config.write?"write_proof":"preflight"});
  if(!tokenDigest){await import("../../scripts/register-server-only.mjs");const {sessionTokenDigester}=await import("../../lib/product-auth/session-adapter.server.ts");tokenDigest=sessionTokenDigester(config.tokenKey);}
  const owners=[],maximum=[];
  await read(async()=>{
   phase="database_identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
    host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,
    to_regnamespace('product')::text AS namespace,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
   assert.ok(identity.version>=160000&&identity.version<170000);delete identity.version;
   assert.deepEqual(identity,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",session_role:"stitchtrack_product_test_app",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",encoding:"UTF8",safe:true});
   phase="schema_tables";const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
   assert.deepEqual(actual.map(r=>r.name),[...tables,"AuthRateBucket","_prisma_migrations"].sort());assert.ok(actual.every(r=>r.kind==="r"&&r.owner==="stitchtrack_product_test_migrator"));
   const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated_history
    FROM pg_catalog.pg_namespace WHERE nspname='product'`);
   assert.deepEqual(schema,{owner:"stitchtrack_product_test_migrator",isolated_history:true});
   phase="application_privileges";await applicationPrivileges(db);
   phase="icu_metadata";const {rows:[icu]}=await db.query(`SELECT pg_get_userbyid(c.collowner) AS owner,c.collprovider AS provider,c.collisdeterministic AS deterministic,c.colliculocale AS locale,
    c.collversion AS recorded,pg_collation_actual_version(c.oid) AS actual,
    EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid='product."MeasurementEntry_version_label_key"'::regclass AND i.indisunique AND i.indisvalid AND i.indisready
     AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indcollation[1]=c.oid) AS indexed
    FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='product' AND c.collname='measurement_label_ci'`);
   assert.equal(icu.owner,"stitchtrack_product_test_migrator");assert.equal(icu.provider,"i");assert.equal(icu.deterministic,false);assert.equal(icu.indexed,true);
   assert.ok(["und-u-kk-true-ks-level2","und-u-kk-ks-level2"].includes(icu.locale));assert.ok(icu.recorded);assert.equal(icu.recorded,icu.actual);
   for(const i of [0,1]){
    phase=i===0?"fixture_a_owner":"fixture_b_owner";
    const {rows:[owner]}=await db.query(`SELECT b."primaryOwnerUserId" AS id FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
     JOIN product."User" u ON u."id"=b."primaryOwnerUserId" WHERE b."id"=$1 AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
     AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[config.businesses[i]]);assert.ok(owner);owners.push(owner.id);
    phase=i===0?"fixture_a_client":"fixture_b_client";const {rows:[c]}=await db.query('SELECT "id","businessId" FROM product."Client" WHERE "id"=$1::uuid AND "businessId"=$2',[config.clients[i],config.businesses[i]]);assert.deepEqual(c,{id:config.clients[i],businessId:config.businesses[i]});
    phase=i===0?"fixture_a_session":"fixture_b_session";const raw=decodeURIComponent(config.cookies[i].slice("better-auth.session_token=".length)).split(".")[0];
    const {rows:[session]}=await db.query('SELECT "userId","expiresAt">clock_timestamp()+INTERVAL \'16 minutes\' AS sufficient FROM product."Session" WHERE "token"=$1',[tokenDigest(raw)]);assert.deepEqual(session,{userId:owner.id,sufficient:true});
    phase=i===0?"fixture_a_history":"fixture_b_history";const {rows:[history]}=await db.query('SELECT count(*)::int AS count,COALESCE(max("versionNumber"),0)::int AS maximum FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid',[config.businesses[i],config.clients[i]]);
    assert.ok(Number.isInteger(history.count)&&history.count>=0&&history.count<=20);assert.ok(Number.isInteger(history.maximum)&&history.maximum>=0&&history.maximum<2147483600);maximum.push(history.maximum);
   }
   phase="distinct_owners";assert.notEqual(owners[0],owners[1]);
   plan=measurementApiPlan(config.clients[0],maximum[0]);ids=plan.map(p=>p.body.id);phase="fresh_ids";
   assert.equal((await db.query('SELECT 1 FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[ids])).rowCount,0);
   assert.equal((await db.query('SELECT 1 FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[])',[ids])).rowCount,0);
  });
  phase="baseline";baseline=await snapshots();
  phase="http_session_identity";for(const i of [0,1]){
   const response=await request(origin+"/api/internal/tailor-session/session",{headers:{origin,cookie:config.cookies[i]},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
   if(response.status!==200)throw new StatusFailure(response.status,200);assert.equal(response.redirected,false);assert.equal(response.headers.has("set-cookie"),false);assert.equal((await response.json()).user.id,owners[i]);
  }
  phase="list_a";await list(0);phase="list_b";await list(1);
  phase="invalid_session";assert.deepEqual(await measurementApiProofRequest("better-auth.session_token=invalid",{operation:"list",clientId:config.clients[0]},{request,expectedStatus:401,deadline}),{error:"unauthenticated"});
  phase="cross_business";for(const body of [{operation:"list",clientId:config.clients[0]},{operation:"get",clientId:config.clients[0],id:ids[0]}])assert.deepEqual(await one(1,body,404),{error:"measurement_not_found"});
  if(!config.write){phase="preflight_snapshot";assert.deepEqual(await snapshots(),baseline);outcome={status:"preflight_passed",measurementWrites:0,rateCountersMayChange:true,runId};}
  else{
   phase="inventory";inventory={format:1,kind:"measurement_api_write_proof",runId,createdAt:new Date().toISOString(),database:config.target.database,role:config.target.user,
    businesses:config.businesses,clients:config.clients,migrationChecksums:PRODUCT_MIGRATIONS,baselineMaximum:maximum[0],baseline,plan,
    state:"planned; API transactions commit independently; reconcile every inventoried ID before any rerun or cleanup"};
   save(config.inventory,inventory);inventorySaved=true;
   await refill("refill_invalid");
   for(const p of plan.slice(3)){phase=p.purpose;writeStarted=true;assert.deepEqual(await one(0,p.body,422),{error:"validation_failed"});}
   phase="invalid_absence";await read(async()=>{
    const invalidIds=plan.slice(3).map(p=>p.body.id);
    assert.equal((await db.query('SELECT 1 FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[invalidIds])).rowCount,0);
    assert.equal((await db.query('SELECT 1 FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[])',[invalidIds])).rowCount,0);
   });
   await refill("refill_create");phase="create";const first=checkVersion(await one(0,plan[0].body),plan[0]);
   phase="get";assert.deepEqual(measurementSingleReplySchema.parse(await one(0,{operation:"get",clientId:config.clients[0],id:first.id})).version,first);
   phase="retry";assert.deepEqual(checkVersion(await one(0,plan[0].body),plan[0]),first);
   phase="conflict";assert.deepEqual(await one(0,{...plan[0].body,unit:"in"},409),{error:"measurement_conflict"});
   await refill("refill_concurrent");phase="concurrent";
   const concurrent=await Promise.allSettled(plan.slice(1,3).map(p=>one(0,p.body)));for(const r of concurrent)if(r.status==="rejected")throw r.reason;
   const pair=concurrent.map((r,i)=>checkVersion(r.value,plan[i+1]));assert.deepEqual(pair.map(v=>v.versionNumber).sort((a,b)=>a-b),[maximum[0]+2,maximum[0]+3]);
   savedVersions=[first,...pair];phase="stored_versions";
   await read(async()=>{
    const {rows}=await db.query('SELECT "id","businessId","clientId","versionNumber","unit","recordedAt" FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[ids]);assert.equal(rows.length,3);
    for(const row of rows){const expected=savedVersions.find(v=>v.id===row.id);assert.ok(expected);assert.equal(row.businessId,config.businesses[0]);assert.deepEqual({...expected,entries:undefined},{id:row.id,clientId:row.clientId,versionNumber:row.versionNumber,unit:row.unit,recordedAt:row.recordedAt.toISOString(),entries:undefined});}
    phase="stored_entries";const {rows:entries}=await db.query('SELECT "measurementVersionId","name","value"::text AS value FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[]) LIMIT 401',[ids]);assert.equal(entries.length,7);
    for(const v of savedVersions)assert.deepEqual(ordered(entries.filter(e=>e.measurementVersionId===v.id).map(e=>({name:e.name,value:e.value}))),ordered(v.entries));
   });
   phase="cross_business";for(const v of savedVersions){assert.deepEqual(await one(1,{operation:"get",clientId:config.clients[0],id:v.id},404),{error:"measurement_not_found"});assert.deepEqual(await one(1,{operation:"get",clientId:config.clients[1],id:v.id},404),{error:"measurement_not_found"});}
   phase="final_list";const a=await list(0),b=await list(1);assert.ok(savedVersions.every(v=>a.some(row=>row.id===v.id)));assert.ok(b.every(v=>!ids.includes(v.id)));
   phase="unrelated_snapshot";assert.deepEqual(await snapshots(),baseline);
   outcome={status:"write_proof_passed",runId,committedSyntheticVersions:3,committedSyntheticEntries:7,inventorySaved:true,cleanupPerformed:false,rateCountersMayChange:true,
    notExercisedLive:["database_outage","lost_commit_response","expired_or_locked_fixture","simultaneous_same_uuid"]};
  }
 }catch(error){outcome=measurementApiProofFailure(error instanceof RollbackFailure?"observer_rollback":phase,inventorySaved,writeStarted,error);}
 finally{if(db)try{await db.end();}catch(error){if(outcome?.status==="failed")outcome.connectionCleanupFailed=true;else outcome=measurementApiProofFailure("connection_cleanup",inventorySaved,writeStarted,error);}}
 if(outcome.status==="write_proof_passed")try{save(config.inventory+".result.json",{format:1,kind:"measurement_api_write_result",runId,inventoryCreatedAt:inventory.createdAt,versions:savedVersions,cleanupPerformed:false});}
 catch(error){outcome=measurementApiProofFailure("finish_receipt",inventorySaved,writeStarted,error);}
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runMeasurementApiProof(authorizeMeasurementApiProof(process.argv.slice(2),process.env),{report:value=>console.log(JSON.stringify(value))});}
 catch(error){result=measurementApiProofFailure("authorization",false,false,error);}
 console.log(JSON.stringify(result));if(result.status==="failed")process.exitCode=1;
}
