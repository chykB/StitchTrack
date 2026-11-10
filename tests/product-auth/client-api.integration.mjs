// OWNER ONLY. Import is inert. Real HTTP API writes commit independently and are never rolled back here.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pathToFileURL,fileURLToPath} from "node:url";
import {basename,dirname,isAbsolute,resolve,sep} from "node:path";
import {constants,lstatSync,realpathSync,openSync,writeFileSync,fsyncSync,closeSync} from "node:fs";
import {productDatabaseConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {localSessionRatePolicy} from "../../lib/product-auth/session-policy.ts";
import {clientRecordPath,clientSingleReplySchema,clientListReplySchema} from "../../lib/client-record-contract.ts";
const origin="http://127.0.0.1:3000",root=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
export function authorizeClientApiProof(args,env){
 const mode=args[0];
 if(process.platform!=="linux"||args.length!==1||!["--owner-client-api-preflight","--owner-client-api-write-proof"].includes(mode)||
  env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||env.PRODUCT_CLIENT_API_PROOF_CONFIRMED!=="true"||env.PRODUCT_CLIENT_API_FIXTURES_CONFIRMED!=="true"||
  env.PRODUCT_SESSION_HTTP_ORIGIN!==origin||["NODE_OPTIONS","NODE_DEBUG","NODE_USE_ENV_PROXY","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw Error();
 const businesses=[env.PRODUCT_CLIENT_API_BUSINESS_A_ID,env.PRODUCT_CLIENT_API_BUSINESS_B_ID];
 if(businesses.some(id=>typeof id!=="string"||!id||id!==id.trim()||id.length>200||/[\x00-\x1f\x7f]/u.test(id))||businesses[0]===businesses[1])throw Error();
 const cookies=[env.PRODUCT_CLIENT_API_COOKIE_A,env.PRODUCT_CLIENT_API_COOKIE_B];
 if(cookies.some(c=>typeof c!=="string"||c.length>2048||!/^better-auth\.session_token=[^;\s]+$/u.test(c))||cookies[0]===cookies[1])throw Error();
 const target=productDatabaseConfig(env);if(target.mode!=="test"||target.user!=="stitchtrack_product_test_app")throw Error();
 const tokenKey=Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY??"","base64");if(tokenKey.length!==32||tokenKey.toString("base64")!==env.PRODUCT_SESSION_TOKEN_KEY)throw Error();
 const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID??"");
 const write=mode==="--owner-client-api-write-proof",inventory=env.PRODUCT_CLIENT_API_INVENTORY;
 if(write&&(env.PRODUCT_CLIENT_API_WRITES_CONFIRMED!=="true"||!inventory||!isAbsolute(inventory)))throw Error();
 return {origin,target,businesses,cookies,tokenKey,write,inventory,refillWait:Math.max(policy.login.account.capacity*policy.login.account.refillIntervalMs,policy.login.ip.capacity*policy.login.ip.refillIntervalMs)+1000};
}
export function saveClientApiInventory(path,inventory){
 if(!isAbsolute(path))throw Error();
 const parent=realpathSync(dirname(path)),info=lstatSync(dirname(path)),file=resolve(parent,basename(path));
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)!==0||file===root||file.startsWith(root+sep))throw Error();
 const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,JSON.stringify(inventory,null,2)+"\n");fsyncSync(fd);}finally{closeSync(fd);}
}
// A known 429 occurs before Client writes. Only that response may be retried, with the identical body/UUID.
export async function clientApiProofRequest(cookie,body,{request=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),retry429=true,deadline=Date.now()+900000,expectedStatus}={}){
 for(let attempt=0;attempt<6;attempt++){
  assert.ok(Date.now()<deadline);
  const response=await request(origin+clientRecordPath,{method:"POST",headers:{origin,"content-type":"application/json",cookie},
   body:JSON.stringify(body),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
  assert.equal(response.redirected,false);assert.equal(response.headers.has("set-cookie"),false);
  if(response.status===429&&retry429){
   const raw=response.headers.get("retry-after");assert.ok(raw&&/^[0-9]+$/u.test(raw));const seconds=Number(raw);
   assert.ok(Number.isSafeInteger(seconds)&&seconds>=1&&seconds<=180&&Date.now()+(seconds+1)*1000<deadline);
   await response.body?.cancel();await wait((seconds+1)*1000);continue;
  }
  if(expectedStatus!==undefined&&response.status!==expectedStatus)throw new HttpStatusFailure(response.status,expectedStatus);
  assert.ok(response.headers.get("content-type")?.startsWith("application/json"));
  return {status:response.status,body:await response.json()};
 }
 throw Error();
}
// Only explicitly captured numeric statuses are publishable; never serialize a caught error.
class HttpStatusFailure extends Error{
 constructor(actual,expected){super("Unexpected HTTP status.");this.actual=actual;this.expected=expected;}
}
export function clientApiProofFailure(stage,inventorySaved,error){
 return {status:"failed",stage,inventorySaved,possibleCommittedClients:inventorySaved?3:0,noAutomaticRetry:true,
  ...(error instanceof HttpStatusFailure?{actualHttpStatus:error.actual,expectedHttpStatus:error.expected}:{})};
}
// Shared by the preflight and write proof; injected reads allow offline failure-stage tests.
export async function clientApiProofList(index,{one,readIds,setStage}){
 assert.ok(index===0||index===1);const prefix=index===0?"client_list_a":"client_list_b";
 const all=[];let cursor;for(let page=0;page<30;page++){
  setStage(prefix+"_http");const body=await one(index,{operation:"list",limit:1,...(cursor?{cursor}:{})});
  setStage(prefix+"_response");const reply=clientListReplySchema.parse(body);
  setStage(prefix+"_page_size");assert.ok(reply.clients.length<=1);
  all.push(...reply.clients);if(!reply.nextCursor){
   setStage(prefix+"_ordering");
   for(let i=1;i<all.length;i++){const a=all[i-1],b=all[i];assert.ok(a.createdAt<b.createdAt||a.createdAt===b.createdAt&&a.id<b.id);}
   setStage(prefix+"_unique_ids");assert.equal(new Set(all.map(r=>r.id)).size,all.length);
   setStage(prefix+"_database_scope");assert.deepEqual(all.map(r=>r.id),await readIds(index));return all;
  }cursor=reply.nextCursor;
 }
 setStage(prefix+"_page_bound");throw Error();
}
class CleanupFailure extends Error{constructor(inventorySaved){super("Proof cleanup failed.");this.inventorySaved=inventorySaved;}}
const snapshotTables=["User","Account","Session","Business","BusinessMember","Verification","EmailVerificationIssuance","EmailOutbox","TermsVersion","TermsAcceptance","Client"];
async function run(config){
 await import("../../scripts/register-server-only.mjs");
 const {sessionTokenDigester}=await import("../../lib/product-auth/session-adapter.server.ts");
 const {Client}=await import("pg"),db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});
 let phase="connection",alive=true,inventorySaved=false;db.on("error",()=>{alive=false;});
 const runId=randomUUID(),ids=[randomUUID(),randomUUID(),randomUUID()],deadline=Date.now()+900000;
 let passed=0;
 const readonly=async fn=>{assert.ok(alive);await db.query("BEGIN READ ONLY");try{return await fn();}finally{await db.query("ROLLBACK");}};
 const api=(index,body,options={})=>clientApiProofRequest(config.cookies[index],body,{deadline,...options});
 const one=async(index,body,status=200)=>{const r=await api(index,body,{expectedStatus:status});return r.body;};
 const snapshots=()=>readonly(async()=>{
  const result=[];for(const table of snapshotTables){
   const exclusion=table==="Client"?' WHERE "id"<>ALL($1::uuid[])':"",params=table==="Client"?[ids]:[];
   const count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"'+exclusion,params)).rows[0].count;assert.ok(count<=10000);
   const digest=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t'+exclusion,params)).rows[0].digest;
   result.push({table,count,digest});
  }return result;
 });
 try{
  await db.connect();phase="database_identity";
  const owners=await readonly(async()=>{
   const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
    host(inet_server_addr()) AS host,current_setting('port') AS port,current_setting('TimeZone') AS timezone,
    to_regnamespace('product')::text AS namespace,NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
   assert.deepEqual(identity,{database:config.target.database,role:config.target.user,session_role:config.target.user,host:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",safe:true});
   const {rows:[privileges]}=await db.query(`SELECT has_table_privilege(current_user,'product."Client"','SELECT') AS read,
    has_column_privilege(current_user,'product."Client"','fullName','INSERT') AS insert,
    has_column_privilege(current_user,'product."Client"','fullName','UPDATE') AS edit,
    has_column_privilege(current_user,'product."Client"','businessId','UPDATE') AS reassign,
    has_table_privilege(current_user,'product."Client"','DELETE') AS remove,has_schema_privilege(current_user,'product','CREATE') AS ddl`);
   assert.deepEqual(privileges,{read:true,insert:true,edit:true,reassign:false,remove:false,ddl:false});
   phase="fixture_and_session_preflight";const result=[];
   const digest=sessionTokenDigester(config.tokenKey);
   for(const [i,businessId]of config.businesses.entries()){
    phase=i===0?"fixture_a_owner_eligibility":"fixture_b_owner_eligibility";
    const {rows:[owner]}=await db.query(`SELECT b."primaryOwnerUserId" AS id FROM product."Business" b
     JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId"
     JOIN product."User" u ON u."id"=b."primaryOwnerUserId" WHERE b."id"=$1 AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL
     AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[businessId]);assert.ok(owner);
    phase=i===0?"fixture_a_session_lookup":"fixture_b_session_lookup";
    const raw=decodeURIComponent(config.cookies[i].slice("better-auth.session_token=".length)).split(".")[0];
    const {rows:[session]}=await db.query('SELECT "userId","expiresAt" FROM product."Session" WHERE "token"=$1',[digest(raw)]);
    phase=i===0?"fixture_a_session_owner_match":"fixture_b_session_owner_match";
    assert.equal(session?.userId,owner.id);
    phase=i===0?"fixture_a_session_lifetime":"fixture_b_session_lifetime";
    assert.ok(session.expiresAt.getTime()>deadline+60000,"Use a fixture session with at least 16 minutes remaining");result.push(owner.id);
    phase=i===0?"fixture_a_client_count":"fixture_b_client_count";
    const count=(await db.query('SELECT count(*)::int AS count FROM product."Client" WHERE "businessId"=$1',[businessId])).rows[0].count;assert.ok(count<=20);
   }
   phase="fixture_distinct_owners";assert.notEqual(result[0],result[1]);
   phase="fixture_client_uuid_absence";
   assert.equal((await db.query('SELECT 1 FROM product."Client" WHERE "id"=ANY($1::uuid[])',[ids])).rowCount,0);return result;
  });
  phase="existing_record_baseline";const before=await snapshots();
  // Reconcile the actual Next process's signed-cookie identity before any Client mutation.
  phase="http_session_identity";
  for(const [i,cookie]of config.cookies.entries()){
   const response=await fetch(origin+"/api/internal/tailor-session/session",{headers:{cookie,origin},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,200);const reply=await response.json();assert.equal(reply.user.id,owners[i]);
  }
  const list=index=>clientApiProofList(index,{one,setStage:value=>{phase=value;},readIds:index=>readonly(async()=>
   (await db.query('SELECT "id" FROM product."Client" WHERE "businessId"=$1 ORDER BY "createdAt","id"',[config.businesses[index]])).rows.map(row=>row.id))});
  phase="non_client_write_checks";await list(0);await list(1);
  phase="invalid_session_http";
  const invalid=await clientApiProofRequest("better-auth.session_token=invalid",{operation:"list"},{deadline,expectedStatus:401});
  phase="invalid_session_response";assert.deepEqual(invalid.body,{error:"unauthenticated"});
  for(const [stage,body] of [
   ["invalid_list_limit_zero",{operation:"list",limit:0}],
   ["invalid_list_limit_above_max",{operation:"list",limit:51}],
   ["invalid_list_ownership_field",{operation:"list",businessId:config.businesses[1]}],
   ["invalid_get_timestamp",{operation:"get",id:ids[0],updatedAt:"2026-01-01T00:00:00.000Z"}]
  ]){phase=stage;assert.deepEqual(await one(0,body,422),{error:"validation_failed"});}
  passed+=4;
  if(!config.write){phase="preflight_existing_record_snapshot";assert.deepEqual(await snapshots(),before);return {status:"preflight_passed",clientWrites:0,rateCountersMayChange:true,checks:passed};}
  phase="inventory";
  saveClientApiInventory(config.inventory,{format:1,runId,createdAt:new Date().toISOString(),database:config.target.database,
   businesses:config.businesses,clients:ids.map((id,i)=>({id,label:["A_initial_then_edited","A_concurrent_same_contacts","B_same_contacts"][i],business:i===2?"B":"A"})),
   state:"planned; API commits may persist after any interruption; reconcile before rerun"});inventorySaved=true;
  phase="forged_write_fields";
  for(const body of [{operation:"create",id:ids[0],fullName:"Synthetic",businessId:config.businesses[1]},
   {operation:"update",id:ids[0],fullName:"Synthetic",updatedAt:"2026-01-01T00:00:00.000Z"}])assert.deepEqual(await one(0,body,422),{error:"validation_failed"});
  const initial={operation:"create",id:ids[0],fullName:"Synthetic API proof "+runId};
  phase="create_name_only";const first=clientSingleReplySchema.parse(await one(0,initial)).client;assert.equal(first.phone,null);assert.equal(first.email,null);
  await readonly(async()=>{const row=(await db.query('SELECT "businessId","phone","email" FROM product."Client" WHERE "id"=$1::uuid',[ids[0]])).rows[0];assert.deepEqual(row,{businessId:config.businesses[0],phone:null,email:null});});passed++;
  phase="repeat_and_conflict";assert.deepEqual(clientSingleReplySchema.parse(await one(0,initial)).client,first);
  assert.deepEqual(await one(0,{...initial,fullName:"Conflicting synthetic details"},409),{error:"client_conflict"});passed++;
  phase="read_and_cross_business";assert.deepEqual(clientSingleReplySchema.parse(await one(0,{operation:"get",id:ids[0]})).client,first);
  for(const operation of ["get","update"]){const extra=operation==="update"?{fullName:"Forbidden synthetic update"}:{};
   const foreign=await one(1,{operation,id:ids[0],...extra},404),missing=await one(1,{operation,id:randomUUID(),...extra},404);
   assert.deepEqual(foreign,{error:"client_not_found"});assert.deepEqual(foreign,missing);
  }assert.ok(!(await list(1)).some(r=>r.id===ids[0]));passed++;
  const contact={fullName:"Synthetic shared API contact "+runId,phone:"1234567",email:"client-api-"+runId+"@example.invalid"};
  phase="edit";const edited=clientSingleReplySchema.parse(await one(0,{operation:"update",id:ids[0],...contact})).client;
  assert.equal(edited.id,first.id);assert.equal(edited.createdAt,first.createdAt);for(const key of ["fullName","phone","email"])assert.equal(edited[key],contact[key]);passed++;
  phase="concurrency_rate_refill";assert.ok(Date.now()+config.refillWait<deadline);await new Promise(r=>setTimeout(r,config.refillWait));
  phase="concurrent_create";const concurrent={operation:"create",id:ids[1],...contact};
  const pair=await Promise.all([api(0,concurrent,{retry429:false}),api(0,concurrent,{retry429:false})]);
  assert.ok(pair.every(r=>r.status===200),"Do not mistake rate-denied serial retries for concurrent proof");assert.deepEqual(pair[0].body,pair[1].body);passed++;
  phase="duplicate_contacts";clientSingleReplySchema.parse(await one(1,{operation:"create",id:ids[2],...contact}));
  phase="final_list_and_database_scope";const a=await list(0),bb=await list(1);assert.ok(a.some(r=>r.id===ids[0])&&a.some(r=>r.id===ids[1]));assert.ok(!a.some(r=>r.id===ids[2]));assert.ok(bb.some(r=>r.id===ids[2])&&!bb.some(r=>ids.slice(0,2).includes(r.id)));
  await readonly(async()=>{const rows=(await db.query('SELECT "id","businessId","fullName","phone","email" FROM product."Client" WHERE "id"=ANY($1::uuid[]) ORDER BY "id"',[ids])).rows;
   assert.equal(rows.length,3);for(const row of rows){assert.equal(row.businessId,config.businesses[row.id===ids[2]?1:0]);for(const key of ["fullName","phone","email"])assert.equal(row[key],contact[key]);}});passed++;
  phase="unchanged_existing_records";assert.deepEqual(await snapshots(),before);
  return {status:"write_proof_passed",runId,checks:passed,committedSyntheticClients:3,sessionsCreated:0,rateCountersMayChange:true,cleanupPerformed:false,
   notExercisedLive:["expired_session","account_lock","database_outage","uncertain_commit"]};
 }catch(error){return clientApiProofFailure(phase,inventorySaved,error);}
 finally{try{await db.end();}catch{throw new CleanupFailure(inventorySaved);}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await run(authorizeClientApiProof(process.argv.slice(2),process.env));}catch(error){result={status:"failed",stage:error instanceof CleanupFailure?"connection_cleanup":"authorization_or_initialization",inventorySaved:error instanceof CleanupFailure?error.inventorySaved:false,noAutomaticRetry:true};}
 console.log(JSON.stringify(result));if(result.status==="failed")process.exitCode=1;
}
