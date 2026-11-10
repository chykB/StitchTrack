// OWNER ONLY. Inert import. Read-only app-role observer; API writes commit independently.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFileSync,lstatSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {authorizeClientApiProof} from "./client-api.integration.mjs";
import {saveMeasurementApiInventory,measurementApiSnapshotTables,measurementApiProofRequest,measurementApiProofFailure} from "./measurement-api.integration.mjs";
import {orderSchemaMetadata,orderApplicationPrivileges} from "./order-constraints.integration.mjs";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {measurementSingleReplySchema,measurementListReplySchema} from "../../lib/measurement-contract.ts";
import {clientIdSchema} from "../../lib/client-record-contract.ts";
import {orderPath,orderRequestSchema,orderSingleReplySchema,orderListReplySchema,ORDER_BODY_LIMIT} from "../../lib/order-contract.ts";
const origin="http://127.0.0.1:3000",tables=[...measurementApiSnapshotTables,"Order","OrderItem"].sort();
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cleanupPath=new URL("../../prisma/product/setup/order-api-cleanup.md",import.meta.url);
export const orderMeasurementFixtureCleanupDigest=()=>createHash("sha256").update(readFileSync(new URL("../../prisma/product/setup/order-api-verification.md",import.meta.url))).digest("hex");
export const orderItemEditCleanupDigest=()=>createHash("sha256").update(readFileSync(new URL("../../prisma/product/setup/order-item-edit-verification.md",import.meta.url))).digest("hex");
export const orderCleanupProposalDigest=()=>createHash("sha256").update(readFileSync(cleanupPath)).digest("hex");
const stages=new Set(["authorization","connection","database_identity","schema_tables","schema_metadata","application_privileges","fixture_a_owner","fixture_b_owner","fixture_a_client","fixture_other_client","fixture_b_client","fixture_a_session","fixture_b_session","distinct_owners","measurement_fixtures","fresh_ids","baseline","http_session_a","http_session_b","list_a","list_b","invalid_session","preflight_snapshot","inventory","refill_initial","refill_invalid","refill_references","refill_large","initial","get","retry","conflict","cross_get","cross_create","invalid_blank","invalid_501","invalid_zero","invalid_51","wrong_client_version","wrong_business_version","large","oversized_body","late_item_conflict","late_item_conflict_transport","late_item_conflict_headers","late_item_conflict_status","late_item_conflict_content_type","late_item_conflict_json","late_item_conflict_body","invalid_absence","stored_orders","stored_items","final_lists","unrelated_snapshot","observer_rollback","connection_cleanup","finish_receipt","fixture_setup_history_a","fixture_setup_history_b","fixture_setup_refill","fixture_setup_create_a","fixture_setup_create_b","fixture_setup_get_a","fixture_setup_get_b","fixture_setup_versions","fixture_setup_entries","edit_refill_initial","edit_refill_competing","edit_refill_selection","edit_measurement","edit_create","edit_description","edit_noop","edit_stale","edit_competing","edit_get","edit_selection","edit_clear","edit_duplicate","edit_database","edit_history","internal"]);
const states=new Set(["08000","08001","08003","08006","08007","08P01","42501","42P01","42703","42704","42883","23503","23505","23514","25P02","57014","55P03","40P01","40001","53300"]);
class StatusFailure extends Error{constructor(actual,expected){super("Unexpected HTTP status.");this.actual=actual;this.expected=expected;}}
class RollbackFailure extends Error{}
export function orderApiProofFailure(stage,inventorySaved,attempted,error){return {status:"failed",stage:stages.has(stage)?stage:"internal",inventorySaved,possibleCommittedOrders:attempted.orders.size,possibleCommittedItems:attempted.items.size,noAutomaticRetry:true,...(states.has(error?.code)?{sqlstate:error.code}:{}),...(error instanceof StatusFailure?{actualHttpStatus:error.actual,expectedHttpStatus:error.expected}:{})};}
export function authorizeOrderApiProof(args,env){
 assert.equal(args.length,1);assert.ok(["--owner-order-api-preflight","--owner-order-api-write-proof","--owner-order-measurement-fixture-preflight","--owner-order-measurement-fixture-create","--owner-order-item-edit-preflight","--owner-order-item-edit-write-proof"].includes(args[0]));
 const editSetup=args[0]==="--owner-order-item-edit-preflight"||args[0]==="--owner-order-item-edit-write-proof";
 const fixtureSetup=args[0]==="--owner-order-measurement-fixture-preflight"||args[0]==="--owner-order-measurement-fixture-create";
 assert.equal(editSetup?env.PRODUCT_ORDER_ITEM_EDIT_PROOF_CONFIRMED:env.PRODUCT_ORDER_API_PROOF_CONFIRMED,"true");assert.equal(env.PRODUCT_ORDER_API_FIXTURES_CONFIRMED,"true");
 if(!editSetup)assert.equal(fixtureSetup?env.PRODUCT_ORDER_MEASUREMENT_FIXTURE_SETUP_CONFIRMED:env.PRODUCT_ORDER_API_MEASUREMENT_FIXTURES_CONFIRMED,"true");
 const write=args[0]==="--owner-order-api-write-proof"||args[0]==="--owner-order-measurement-fixture-create"||args[0]==="--owner-order-item-edit-write-proof";
 const base=authorizeClientApiProof([write?"--owner-client-api-write-proof":"--owner-client-api-preflight"],{...env,
  PRODUCT_CLIENT_API_PROOF_CONFIRMED:editSetup?env.PRODUCT_ORDER_ITEM_EDIT_PROOF_CONFIRMED:env.PRODUCT_ORDER_API_PROOF_CONFIRMED,PRODUCT_CLIENT_API_FIXTURES_CONFIRMED:env.PRODUCT_ORDER_API_FIXTURES_CONFIRMED,
  PRODUCT_CLIENT_API_WRITES_CONFIRMED:editSetup?env.PRODUCT_ORDER_ITEM_EDIT_WRITES_CONFIRMED:fixtureSetup?env.PRODUCT_ORDER_MEASUREMENT_FIXTURE_WRITES_CONFIRMED:env.PRODUCT_ORDER_API_WRITES_CONFIRMED,PRODUCT_CLIENT_API_INVENTORY:editSetup?env.PRODUCT_ORDER_ITEM_EDIT_INVENTORY:fixtureSetup?env.PRODUCT_ORDER_MEASUREMENT_FIXTURE_INVENTORY:env.PRODUCT_ORDER_API_INVENTORY,
  PRODUCT_CLIENT_API_BUSINESS_A_ID:env.PRODUCT_ORDER_API_BUSINESS_A_ID,PRODUCT_CLIENT_API_BUSINESS_B_ID:env.PRODUCT_ORDER_API_BUSINESS_B_ID,PRODUCT_CLIENT_API_COOKIE_A:env.PRODUCT_ORDER_API_COOKIE_A,PRODUCT_CLIENT_API_COOKIE_B:env.PRODUCT_ORDER_API_COOKIE_B});
 const clients=["CLIENT_A_ID","OTHER_CLIENT_A_ID","CLIENT_B_ID"].map(key=>clientIdSchema.parse(env["PRODUCT_ORDER_API_"+key]));assert.equal(new Set(clients).size,3);
 const versions=fixtureSetup||editSetup?{valid:null,wrongClient:null,wrongBusiness:null}:{valid:env.PRODUCT_ORDER_API_MEASUREMENT_ID?clientIdSchema.parse(env.PRODUCT_ORDER_API_MEASUREMENT_ID):null,wrongClient:clientIdSchema.parse(env.PRODUCT_ORDER_API_WRONG_CLIENT_MEASUREMENT_ID),wrongBusiness:clientIdSchema.parse(env.PRODUCT_ORDER_API_WRONG_BUSINESS_MEASUREMENT_ID)};
 const values=Object.values(versions).filter(Boolean);assert.equal(new Set(values).size,values.length);
 const excludedMeasurementId=clientIdSchema.parse(env.PRODUCT_ORDER_API_EXCLUDED_MEASUREMENT_ID);assert.ok(!values.includes(excludedMeasurementId));
 const cleanupDigest=editSetup?orderItemEditCleanupDigest():fixtureSetup?orderMeasurementFixtureCleanupDigest():orderCleanupProposalDigest();
 if(editSetup)assert.ok(env.PRODUCT_ORDER_ITEM_EDIT_DUPLICATE_PROBE_CONFIRMED===undefined||["true","false"].includes(env.PRODUCT_ORDER_ITEM_EDIT_DUPLICATE_PROBE_CONFIRMED));
 if(write){assert.equal(editSetup?env.PRODUCT_ORDER_ITEM_EDIT_CLEANUP_CONFIRMED:fixtureSetup?env.PRODUCT_ORDER_MEASUREMENT_FIXTURE_CLEANUP_CONFIRMED:env.PRODUCT_ORDER_API_CLEANUP_PROPOSAL_CONFIRMED,"true");assert.equal(editSetup?env.PRODUCT_ORDER_ITEM_EDIT_CLEANUP_SHA256:fixtureSetup?env.PRODUCT_ORDER_MEASUREMENT_FIXTURE_CLEANUP_SHA256:env.PRODUCT_ORDER_API_CLEANUP_PROPOSAL_SHA256,cleanupDigest);
  for(const path of [base.inventory,base.inventory+".result.json"]){let present=false;try{lstatSync(path);present=true;}catch(e){assert.equal(e.code,"ENOENT");}assert.equal(present,false);}
 }
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);assert.equal(Object.keys(PRODUCT_MIGRATIONS).at(-1),"20261109_order_items");
 return {...base,clients,versions,cleanupDigest,fixtureSetup,editSetup,duplicateProbe:editSetup&&env.PRODUCT_ORDER_ITEM_EDIT_DUPLICATE_PROBE_CONFIRMED==="true",...(fixtureSetup||editSetup?{excludedMeasurementId}:{})};
}
export function orderMeasurementFixturePlan(config){
 return [1,2].map((clientIndex,actor)=>({purpose:actor===0?"fixture_setup_create_a":"fixture_setup_create_b",actor,expectedVersionNumber:1,
  body:{operation:"create",id:randomUUID(),clientId:config.clients[clientIndex],unit:"cm",entries:[{name:"Orders proof fixture",value:"1.25"}]}}));
}
export function orderItemEditPlan(config){
 const first={purpose:"edit_create",actor:0,expectedStatus:200,body:{operation:"create",id:randomUUID(),clientId:config.clients[1],items:[{id:randomUUID(),description:"Synthetic edit-proof outfit",measurementVersionId:null}]}};
 const measurement={purpose:"edit_measurement",actor:0,expectedVersionNumber:1,body:{operation:"create",id:randomUUID(),clientId:config.clients[1],unit:"cm",entries:[{name:"Edit proof width",value:"1.25"}]}};
 return [first,measurement,...(config.duplicateProbe?[{purpose:"edit_duplicate",actor:0,expectedStatus:409,body:{operation:"create",id:randomUUID(),clientId:config.clients[1],items:[{id:randomUUID(),description:"Fresh duplicate-probe item",measurementVersionId:null},{...first.body.items[0],description:"Existing UUID probe"}]}}]:[])];
}
export function orderApiPlan(config){
 const item=(description,measurementVersionId=null)=>({id:randomUUID(),description,measurementVersionId});
 const make=(purpose,items,expectedStatus=200,actor=0,extra={})=>({purpose,actor,expectedStatus,body:{operation:"create",id:randomUUID(),clientId:config.clients[0],items},...extra});
 const first=make("initial",[item("Synthetic Agbada with inside pocket"),item("Synthetic two-piece outfit",config.versions.valid)]);
 return [first,make("large",Array.from({length:9},()=>item("\u{1f9f5}".repeat(500)))),
  make("invalid_blank",[item(" \u0085 ")],422),make("invalid_501",[item("A".repeat(501))],422),make("invalid_zero",[],422),
  make("invalid_51",Array.from({length:51},()=>item("Synthetic clothing item")),422),
  make("wrong_client_version",[item("Wrong Client measurement",config.versions.wrongClient)],404),make("wrong_business_version",[item("Wrong Business measurement",config.versions.wrongBusiness)],404),
  make("oversized_body",[item("Oversized transport probe")],413,0,{wireTargetBytes:ORDER_BODY_LIMIT+1}),
  make("late_item_conflict",[item("Fresh item before intentional conflict"),{...first.body.items[0],description:"Intentional existing item UUID collision"}],409),
  make("cross_create",[item("Cross-Business refusal probe")],404,1)];
}
export async function orderApiProofRequest(cookie,body,{request=fetch,expectedStatus=200,wireTargetBytes,deadline=Date.now()+900000,stage=()=>{},includeConflict=false}={}){
 stage("transport");assert.ok(Date.now()<deadline);let wire=JSON.stringify(body);
 if(wireTargetBytes!==undefined){assert.equal(wireTargetBytes,ORDER_BODY_LIMIT+1);wire+=" ".repeat(wireTargetBytes-Buffer.byteLength(wire));}
 const response=await request(origin+orderPath,{method:"POST",headers:{origin,"content-type":"application/json",cookie},body:wire,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(Math.min(15000,deadline-Date.now()))});
 stage("headers");assert.equal(response.redirected,false);assert.equal(response.headers.has("set-cookie"),false);
 stage("status");if(response.status!==expectedStatus&&!(includeConflict&&expectedStatus===200&&response.status===409)){try{await response.body?.cancel();}catch{/* Preserve the known status if stream cleanup fails. */}throw new StatusFailure(response.status,expectedStatus);}
 stage("content_type");assert.ok(response.headers.get("content-type")?.startsWith("application/json"));stage("json");const value=await response.json();return includeConflict?{status:response.status,body:value}:value;
}
export async function orderApiSnapshot(db,orderIds,itemIds,versionIds=[]){
 const result=[];
 for(const table of tables){
  const measurement=versionIds.length>0&&["MeasurementVersion","MeasurementEntry"].includes(table);
  const column=table==="Order"||table==="OrderItem"||measurement&&table==="MeasurementVersion"?"id":measurement?"measurementVersionId":null;
  const ids=measurement?versionIds:table==="Order"?orderIds:itemIds;
  const exclusion=column?' WHERE "'+column+'"<>ALL($1::uuid[])':"",params=column?[ids]:[];
  const count=(await db.query('SELECT count(*)::int AS count FROM product."'+table+'"'+exclusion,params)).rows[0].count;assert.ok(Number.isInteger(count)&&count>=0&&count<=10000);
  const hash=(await db.query('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text COLLATE "C"),\'\')) AS digest FROM product."'+table+'" t'+exclusion,params)).rows[0].digest;
  assert.equal(typeof hash,"string");result.push({table,count,digest:hash});
 }return result;
}

const content=items=>items.map(({id,description,measurementVersionId})=>({id,description,measurementVersionId})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const inspectOrders=async(db,setStage)=>{setStage("schema_metadata");await orderSchemaMetadata(db);setStage("application_privileges");await orderApplicationPrivileges(db);};
export async function runOrderApiProof(config,{db,request=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),save=saveMeasurementApiInventory,tokenDigest,inspect=inspectOrders,report=()=>{}}={}){
 let phase="connection",inventorySaved=false,alive=true,outcome,inventory,baseline,savedOrders,savedVersions,editTrace=[];
 const runId=randomUUID(),deadline=Date.now()+900000,attempted={orders:new Set(),items:new Set(),versions:new Set()},plan=config.editSetup?orderItemEditPlan(config):config.fixtureSetup?orderMeasurementFixturePlan(config):orderApiPlan(config);
 const versionIds=config.editSetup?[plan[1].body.id]:config.fixtureSetup?plan.map(p=>p.body.id):[],orderPlans=config.fixtureSetup?[]:config.editSetup?plan.filter(p=>p.body.items):plan,orderIds=orderPlans.map(p=>p.body.id),itemIds=[...new Set(orderPlans.flatMap(p=>p.body.items.map(i=>i.id)))];
 const failure=(stage,error)=>{
  if(config.editSetup){const safe=orderApiProofFailure(stage,inventorySaved,attempted,error),measurementSafe=measurementApiProofFailure("create",inventorySaved,attempted.versions.size>0,error);return {...safe,possibleCommittedVersions:attempted.versions.size,possibleCommittedEntries:attempted.versions.size,editsMayHaveCommitted:editTrace.length>0,...(measurementSafe.actualHttpStatus!==undefined?{actualHttpStatus:measurementSafe.actualHttpStatus,expectedHttpStatus:measurementSafe.expectedHttpStatus}:{})};}
  if(!config.fixtureSetup)return orderApiProofFailure(stage,inventorySaved,attempted,error);
  const safe=measurementApiProofFailure("create",inventorySaved,attempted.versions.size>0,error);
  return {status:"failed",stage:stages.has(stage)?stage:"internal",inventorySaved,possibleCommittedVersions:attempted.versions.size,possibleCommittedEntries:attempted.versions.size,noAutomaticRetry:true,...(safe.sqlstate?{sqlstate:safe.sqlstate}:{}),...(safe.actualHttpStatus!==undefined?{actualHttpStatus:safe.actualHttpStatus,expectedHttpStatus:safe.expectedHttpStatus}:{})};
 };
 const read=async fn=>{assert.ok(alive);let value,error;try{await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='7s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30s'");value=await fn();}catch(e){error=e;}
  try{assert.equal((await db.query("ROLLBACK")).command,"ROLLBACK");}catch{throw new RollbackFailure();}if(error)throw error;return value;};
 const one=(actor,body,status=200,extra={})=>{assert.ok(alive);return orderApiProofRequest(config.cookies[actor],body,{request,expectedStatus:status,deadline,...extra});};
 const measurementOne=(actor,body)=>{assert.ok(alive);return measurementApiProofRequest(config.cookies[actor],body,{request,deadline});};
 const snapshot=()=>read(()=>orderApiSnapshot(db,orderIds,itemIds,versionIds));
 const refill=async stage=>{phase=stage;assert.ok(Date.now()+config.refillWait<deadline);for(let left=config.refillWait;left>0;left-=Math.min(left,30000)){report({status:"waiting_for_rate_refill",runId,stage,remainingSeconds:Math.ceil(left/1000)});await wait(Math.min(left,30000));assert.ok(alive);}};
 const list=async actor=>{
  if(config.editSetup){const reply=orderListReplySchema.parse(await one(actor,{operation:"list",limit:1}));assert.ok(reply.orders.length<=1);
   const expected=await read(async()=>(await db.query('SELECT "id" FROM product."Order" WHERE "businessId"=$1 ORDER BY "createdAt" DESC,"id" DESC LIMIT 2',[config.businesses[actor]])).rows);
   assert.deepEqual(reply.orders.map(o=>o.id),expected.slice(0,1).map(o=>o.id));assert.equal(!!reply.nextCursor,expected.length>1);return reply.orders;}

  if(config.fixtureSetup){const clientId=config.clients[actor===0?1:2],reply=measurementListReplySchema.parse(await measurementOne(actor,{operation:"list",clientId,limit:2}));assert.equal(reply.nextCursor,null);assert.ok(reply.versions.length<=1);
   const expected=await read(async()=>(await db.query('SELECT "id","versionNumber" FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid ORDER BY "versionNumber" DESC LIMIT 2',[config.businesses[actor],clientId])).rows);
   assert.deepEqual(reply.versions.map(v=>({id:v.id,versionNumber:v.versionNumber})),expected);return reply.versions;
  }
  const all=[];let cursor;for(let page=0;page<16;page++){
  const reply=orderListReplySchema.parse(await one(actor,{operation:"list",limit:2,...(cursor?{cursor}:{})}));assert.ok(reply.orders.length<=2);all.push(...reply.orders);
  if(!reply.nextCursor){assert.equal(new Set(all.map(o=>o.id)).size,all.length);for(let i=1;i<all.length;i++){const a=all[i-1],b=all[i];assert.ok(a.createdAt>b.createdAt||a.createdAt===b.createdAt&&a.id>b.id);}
   const expected=await read(async()=>(await db.query('SELECT "id" FROM product."Order" WHERE "businessId"=$1 ORDER BY "createdAt" DESC,"id" DESC LIMIT 32',[config.businesses[actor]])).rows.map(r=>r.id));assert.deepEqual(all.map(o=>o.id),expected);return all;}
  cursor=reply.nextCursor;
 }throw Error("Bounded listing exhausted.");};
 const checkOrder=(value,p)=>{const order=orderSingleReplySchema.parse(value).order,input=orderRequestSchema.parse(p.body);assert.equal(order.id,input.id);assert.equal(order.clientId,input.clientId);assert.deepEqual(content(order.items),content(input.items));return order;};
 const absent=async p=>{phase="invalid_absence";const freshItems=p.body.items.map(i=>i.id).filter(id=>!plan[0].body.items.some(i=>i.id===id));await read(async()=>{
  assert.equal((await db.query('SELECT 1 FROM product."Order" WHERE "id"=$1::uuid',[p.body.id])).rowCount,0);
  assert.equal((await db.query('SELECT 1 FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) OR "orderId"=$2::uuid',[freshItems,p.body.id])).rowCount,0);
 });};
 const send=async p=>{phase=p.purpose;assert.ok(inventorySaved);attempted.orders.add(p.body.id);for(const i of p.body.items)attempted.items.add(i.id);
  const value=await one(p.actor,p.body,p.expectedStatus,{...(p.wireTargetBytes?{wireTargetBytes:p.wireTargetBytes}:{}),...(p.purpose==="late_item_conflict"?{stage:value=>{phase="late_item_conflict_"+value;}}:{})});
  if(p.expectedStatus!==200){if(p.purpose==="late_item_conflict")phase="late_item_conflict_body";assert.deepEqual(value,{error:p.expectedStatus===422?"validation_failed":p.expectedStatus===404?"order_not_found":p.expectedStatus===413?"body_too_large":"order_conflict"});await absent(p);}return value;};
 try{
  if(!db){const {Client}=await import("pg");db=new Client({connectionString:config.target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:7000});}
  db.on?.("error",()=>{alive=false;});await db.connect();report({status:"started",runId,mode:config.editSetup?(config.write?"item_edit_write_proof":"item_edit_preflight"):config.fixtureSetup?(config.write?"measurement_fixture_create":"measurement_fixture_preflight"):(config.write?"write_proof":"preflight")});
  if(!tokenDigest){await import("../../scripts/register-server-only.mjs");const {sessionTokenDigester}=await import("../../lib/product-auth/session-adapter.server.ts");tokenDigest=sessionTokenDigester(config.tokenKey);}
  const owners=[],references=[];
  await read(async()=>{
   phase="database_identity";const {rows:[identity]}=await db.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS host,host(inet_client_addr()) AS peer,current_setting('port') AS port,current_setting('TimeZone') AS timezone,to_regnamespace('product')::text AS namespace,current_setting('server_encoding') AS encoding,current_setting('server_version_num')::int AS version,NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
   assert.ok(identity.version>=160000&&identity.version<170000);const {version,...rest}=identity;assert.deepEqual(rest,{database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",session_role:"stitchtrack_product_test_app",host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",namespace:"product",encoding:"UTF8",safe:true});
   phase="schema_tables";const {rows:actual}=await db.query(`SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname COLLATE "C"`);
   assert.deepEqual(actual,[...tables,"AuthRateBucket","_prisma_migrations"].sort().map(name=>({name,kind:"r",owner:"stitchtrack_product_test_migrator"})));
   const {rows:[schema]}=await db.query(`SELECT pg_get_userbyid(nspowner) AS owner,NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='_prisma_migrations') AS isolated_history FROM pg_catalog.pg_namespace WHERE nspname='product'`);assert.deepEqual(schema,{owner:"stitchtrack_product_test_migrator",isolated_history:true});
   phase="schema_metadata";await inspect(db,value=>{assert.ok(stages.has(value));phase=value;});
   for(const actor of [0,1]){
    phase=actor===0?"fixture_a_owner":"fixture_b_owner";
    const {rows}=await db.query(`SELECT b."primaryOwnerUserId" AS id FROM product."Business" b JOIN product."BusinessMember" m ON m."businessId"=b."id" AND m."userId"=b."primaryOwnerUserId" JOIN product."User" u ON u."id"=b."primaryOwnerUserId" WHERE b."id"=$1 AND u."emailVerified" AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL AND EXISTS(SELECT 1 FROM product."Account" a WHERE a."userId"=u."id" AND a."accountId"=u."id" AND a."providerId"='credential' AND a."password" IS NOT NULL)`,[config.businesses[actor]]);assert.equal(rows.length,1);assert.equal(typeof rows[0].id,"string");owners.push(rows[0].id);
    phase=actor===0?"fixture_a_session":"fixture_b_session";const raw=decodeURIComponent(config.cookies[actor].slice("better-auth.session_token=".length)).split(".")[0];
    const {rows:sessions}=await db.query('SELECT "userId","expiresAt">clock_timestamp()+INTERVAL \'16 minutes\' AS sufficient FROM product."Session" WHERE "token"=$1',[tokenDigest(raw)]);assert.deepEqual(sessions,[{userId:rows[0].id,sufficient:true}]);
    if(!config.fixtureSetup){const count=(await db.query('SELECT count(*)::int AS count FROM product."Order" WHERE "businessId"=$1',[config.businesses[actor]])).rows[0].count;assert.ok(Number.isInteger(count)&&count>=0&&count<=20);}
   }
   phase="distinct_owners";assert.notEqual(owners[0],owners[1]);
   for(const [i,phaseName]of [[0,"fixture_a_client"],[1,"fixture_other_client"],[2,"fixture_b_client"]]){phase=phaseName;assert.deepEqual((await db.query('SELECT "id","businessId" FROM product."Client" WHERE "id"=$1::uuid AND "businessId"=$2',[config.clients[i],config.businesses[i===2?1:0]])).rows,[{id:config.clients[i],businessId:config.businesses[i===2?1:0]}]);}
   phase="measurement_fixtures";
   if(config.fixtureSetup||config.editSetup){
    const protectedRows=(await db.query('SELECT "id","businessId","clientId","versionNumber" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[config.excludedMeasurementId])).rows;
    assert.deepEqual(protectedRows,[{id:config.excludedMeasurementId,businessId:config.businesses[0],clientId:config.clients[0],versionNumber:1}]);
    assert.ok(!versionIds.includes(config.excludedMeasurementId));
    for(const actor of config.editSetup?[0]:[0,1]){phase=actor===0?"fixture_setup_history_a":"fixture_setup_history_b";
     assert.equal((await db.query('SELECT count(*)::int AS count FROM product."MeasurementVersion" WHERE "businessId"=$1 AND "clientId"=$2::uuid',[config.businesses[actor],config.clients[actor===0?1:2]])).rows[0].count,0);
    }
   }
   for(const [purpose,id,client]of [["valid",config.versions.valid,config.clients[0]],["wrongClient",config.versions.wrongClient,config.clients[1]],["wrongBusiness",config.versions.wrongBusiness,config.clients[2]]]){
    if(!id)continue;const rows=(await db.query('SELECT "id","businessId","clientId","versionNumber" FROM product."MeasurementVersion" WHERE "id"=$1::uuid',[id])).rows;
    assert.equal(rows.length,1);assert.deepEqual({id:rows[0].id,businessId:rows[0].businessId,clientId:rows[0].clientId},{id,businessId:config.businesses[purpose==="wrongBusiness"?1:0],clientId:client});
    assert.ok(Number.isInteger(rows[0].versionNumber)&&rows[0].versionNumber>=1);references.push({purpose,...rows[0]});
   }
   phase="fresh_ids";if(config.fixtureSetup||config.editSetup){
    assert.equal((await db.query('SELECT 1 FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[versionIds])).rowCount,0);assert.equal((await db.query('SELECT 1 FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[])',[versionIds])).rowCount,0);
   }
   if(!config.fixtureSetup){assert.equal((await db.query('SELECT 1 FROM product."Order" WHERE "id"=ANY($1::uuid[])',[orderIds])).rowCount,0);assert.equal((await db.query('SELECT 1 FROM product."OrderItem" WHERE "id"=ANY($1::uuid[])',[itemIds])).rowCount,0);}
  });
  phase="baseline";baseline=await snapshot();
  for(const actor of [0,1]){phase=actor===0?"http_session_a":"http_session_b";const r=await request(origin+"/api/internal/tailor-session/session",{headers:{origin,cookie:config.cookies[actor]},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});if(r.status!==200){await r.body?.cancel();throw new StatusFailure(r.status,200);}assert.equal(r.redirected,false);assert.equal(r.headers.has("set-cookie"),false);assert.equal((await r.json()).user.id,owners[actor]);}
  phase="list_a";await list(0);phase="list_b";await list(1);phase="invalid_session";assert.deepEqual(await (config.fixtureSetup?measurementApiProofRequest("better-auth.session_token=invalid",{operation:"list",clientId:config.clients[1]},{request,expectedStatus:401,deadline}):orderApiProofRequest("better-auth.session_token=invalid",{operation:"list"},{request,expectedStatus:401,deadline})),{error:"unauthenticated"});
  if(!config.write){phase="preflight_snapshot";assert.deepEqual(await snapshot(),baseline);outcome=config.editSetup?{status:"item_edit_preflight_passed",runId,orderWrites:0,measurementWrites:0,rateCountersMayChange:true,cleanupProposalDigest:config.cleanupDigest,duplicateProbe:config.duplicateProbe}:config.fixtureSetup?{status:"measurement_fixture_preflight_passed",runId,measurementWrites:0,expectedVersions:2,expectedEntries:2,rateCountersMayChange:true,cleanupProposalDigest:config.cleanupDigest}:{status:"preflight_passed",runId,orderWrites:0,rateCountersMayChange:true,cleanupProposalDigest:config.cleanupDigest,explicitMeasurementCase:config.versions.valid?"available":"not_configured"};}
  else{
   phase="inventory";inventory={format:1,kind:config.editSetup?"order_item_edit_proof":config.fixtureSetup?"order_measurement_fixtures":"order_api_write_proof",runId,createdAt:new Date().toISOString(),database:config.target.database,role:config.target.user,businesses:config.businesses,clients:config.clients,references,migrationChecksums:PRODUCT_MIGRATIONS,migrationVerification:"local_manifest_and_prior_owner_tenth_integrity_proof",cleanupProposalDigest:config.cleanupDigest,baseline,plan,...(config.fixtureSetup||config.editSetup?{protectedMeasurementId:config.excludedMeasurementId}:{}),...(config.editSetup?{duplicateProbe:config.duplicateProbe}:{}),state:"independent API commits; preserve all IDs and reconcile before any retry or cleanup"};
   save(config.inventory,inventory);inventorySaved=true;
   if(config.editSetup){
    const initial=plan[0],measurement=plan[1];let current,initialTimestamp;
    const verified=async order=>{phase="edit_database";await read(async()=>{
     const orders=(await db.query('SELECT "id","businessId","clientId","createdAt","updatedAt" FROM product."Order" WHERE "id"=ANY($1::uuid[])',[orderIds])).rows;
     assert.deepEqual(orders,[{id:order.id,businessId:config.businesses[0],clientId:config.clients[1],createdAt:new Date(order.createdAt),updatedAt:new Date(order.updatedAt)}]);
     const items=(await db.query('SELECT "id","orderId","clientId",encode(convert_to("description",\'UTF8\'),\'hex\') AS description_hex,"measurementVersionId","createdAt","updatedAt" FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) OR "orderId"=ANY($2::uuid[])',[itemIds,orderIds])).rows;
     assert.deepEqual(items,order.items.map(item=>({id:item.id,orderId:order.id,clientId:order.clientId,description_hex:Buffer.from(item.description,"utf8").toString("hex"),measurementVersionId:item.measurementVersionId,createdAt:new Date(item.createdAt),updatedAt:new Date(item.updatedAt)})));
     phase="edit_history";const v=savedVersions[0],versions=(await db.query('SELECT "id","businessId","clientId","versionNumber","unit","recordedAt" FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[versionIds])).rows;
     assert.deepEqual(versions,[{id:v.id,businessId:config.businesses[0],clientId:v.clientId,versionNumber:1,unit:"cm",recordedAt:new Date(v.recordedAt)}]);
     const entries=(await db.query('SELECT "measurementVersionId",encode(convert_to("name",\'UTF8\'),\'hex\') AS name_hex,"value"::text AS value FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[])',[versionIds])).rows;
     assert.deepEqual(entries,[{measurementVersionId:v.id,name_hex:Buffer.from("Edit proof width","utf8").toString("hex"),value:"1.25"}]);
     assert.deepEqual(await orderApiSnapshot(db,orderIds,itemIds,versionIds),baseline);
    });};
    const changed=(reply,previous,description,measurementVersionId)=>{const next=orderSingleReplySchema.parse(reply).order,old=previous.items[0],item=next.items[0];
     assert.equal(next.items.length,1);assert.deepEqual({...next,items:[]},{...previous,items:[]});assert.equal(item.id,old.id);assert.equal(item.createdAt,old.createdAt);
     assert.equal(item.description,description);assert.equal(item.measurementVersionId,measurementVersionId);assert.ok(Date.parse(item.updatedAt)>Date.parse(old.updatedAt));return next;};
    const editBody=(order,patch)=>({operation:"update_item",id:order.id,itemId:order.items[0].id,expectedUpdatedAt:order.items[0].updatedAt,...patch});
    const submit=async(stage,body,status=200,includeConflict=false)=>{phase=stage;editTrace.push({stage,body});return one(0,body,status,{includeConflict});};
    await refill("edit_refill_initial");phase="edit_measurement";attempted.versions.add(measurement.body.id);
    const version=measurementSingleReplySchema.parse(await measurementOne(0,measurement.body)).version;
    assert.equal(version.id,measurement.body.id);assert.equal(version.clientId,config.clients[1]);assert.equal(version.versionNumber,1);assert.equal(version.unit,"cm");assert.deepEqual(version.entries,measurement.body.entries);savedVersions=[version];
    current=checkOrder(await send(initial),initial);initialTimestamp=current.items[0].updatedAt;await verified(current);
    current=changed(await submit("edit_description",editBody(current,{description:"Synthetic edited lining"})),current,"Synthetic edited lining",null);await verified(current);
    assert.deepEqual(orderSingleReplySchema.parse(await submit("edit_noop",editBody(current,{description:current.items[0].description}))).order,current);await verified(current);
    await refill("edit_refill_competing");assert.deepEqual(await submit("edit_stale",editBody(current,{expectedUpdatedAt:initialTimestamp,description:"Stale edit must not persist"}),409),{error:"order_conflict"});await verified(current);
    const original=current,choices=["Synthetic competing choice A","Synthetic competing choice B"];
    // Settle both requests before inspecting either: a rejected promise must not leave an unobserved write running.
    const competing=await Promise.allSettled(choices.map(description=>submit("edit_competing",editBody(original,{description}),200,true)));
    phase="edit_competing";for(const result of competing)if(result.status==="rejected")throw result.reason;
    const replies=competing.map(result=>result.value);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
    for(const [i,r]of replies.entries()){if(r.status===409)assert.deepEqual(r.body,{error:"order_conflict"});else current=changed(r.body,original,choices[i],null);}await verified(current);
    phase="edit_get";assert.deepEqual(orderSingleReplySchema.parse(await one(0,{operation:"get",id:current.id})).order,current);
    await refill("edit_refill_selection");current=changed(await submit("edit_selection",editBody(current,{measurementVersionId:version.id})),current,current.items[0].description,version.id);await verified(current);
    current=changed(await submit("edit_clear",editBody(current,{measurementVersionId:null})),current,current.items[0].description,null);await verified(current);
    if(config.duplicateProbe){const duplicate=plan[2];phase="edit_duplicate";attempted.orders.add(duplicate.body.id);duplicate.body.items.forEach(i=>attempted.items.add(i.id));assert.deepEqual(await one(0,duplicate.body,409),{error:"order_conflict"});await verified(current);}
    savedOrders=[current];phase="unrelated_snapshot";assert.deepEqual(await snapshot(),baseline);
    outcome={status:"item_edit_write_proof_passed",runId,committedSyntheticOrders:1,committedSyntheticItems:1,committedSyntheticVersions:1,committedSyntheticEntries:1,inventorySaved:true,cleanupPerformed:false,duplicateProbe:config.duplicateProbe?"passed":"not_requested"};
   }else if(config.fixtureSetup){
    await refill("fixture_setup_refill");savedVersions=[];
    for(const p of plan){phase=p.purpose;attempted.versions.add(p.body.id);const version=measurementSingleReplySchema.parse(await measurementOne(p.actor,p.body)).version;
     assert.equal(version.id,p.body.id);assert.equal(version.clientId,p.body.clientId);assert.equal(version.versionNumber,1);assert.equal(version.unit,"cm");assert.deepEqual(version.entries,p.body.entries);
     phase=p.actor===0?"fixture_setup_get_a":"fixture_setup_get_b";assert.deepEqual(measurementSingleReplySchema.parse(await measurementOne(p.actor,{operation:"get",id:p.body.id,clientId:p.body.clientId})).version,version);savedVersions.push(version);
    }
    phase="fixture_setup_versions";await read(async()=>{
     const rows=(await db.query('SELECT "id","businessId","clientId","versionNumber","unit","recordedAt" FROM product."MeasurementVersion" WHERE "id"=ANY($1::uuid[])',[versionIds])).rows;assert.equal(rows.length,2);
     for(const row of rows){const p=plan.find(p=>p.body.id===row.id),v=savedVersions.find(v=>v.id===row.id);assert.ok(p&&v);assert.deepEqual({...row,recordedAt:row.recordedAt.toISOString()},{id:v.id,businessId:config.businesses[p.actor],clientId:v.clientId,versionNumber:1,unit:"cm",recordedAt:v.recordedAt});}
     phase="fixture_setup_entries";const rows2=(await db.query('SELECT "measurementVersionId",encode(convert_to("name",\'UTF8\'),\'hex\') AS name_hex,"value"::text AS value FROM product."MeasurementEntry" WHERE "measurementVersionId"=ANY($1::uuid[])',[versionIds])).rows;assert.equal(rows2.length,2);
     for(const v of savedVersions)assert.deepEqual(rows2.filter(e=>e.measurementVersionId===v.id),[{measurementVersionId:v.id,name_hex:Buffer.from("Orders proof fixture","utf8").toString("hex"),value:"1.25"}]);
    });
    phase="final_lists";await list(0);await list(1);phase="unrelated_snapshot";assert.deepEqual(await snapshot(),baseline);
    outcome={status:"measurement_fixtures_created",runId,committedSyntheticVersions:2,committedSyntheticEntries:2,inventorySaved:true,cleanupPerformed:false};
   }else{
   const p=purpose=>plan.find(p=>p.purpose===purpose);
   await refill("refill_initial");const first=checkOrder(await send(p("initial")),p("initial"));
   phase="get";assert.deepEqual(orderSingleReplySchema.parse(await one(0,{operation:"get",id:first.id})).order,first);
   phase="retry";assert.deepEqual(checkOrder(await one(0,p("initial").body),p("initial")),first);
   phase="conflict";assert.deepEqual(await one(0,{...p("initial").body,items:p("initial").body.items.map((i,n)=>n===0?{...i,description:"Changed content for same Order UUID"}:i)},409),{error:"order_conflict"});
   phase="cross_get";assert.deepEqual(await one(1,{operation:"get",id:first.id},404),{error:"order_not_found"});await send(p("cross_create"));
   await refill("refill_invalid");for(const purpose of ["invalid_blank","invalid_501","invalid_zero"])await send(p(purpose));
   await refill("refill_references");for(const purpose of ["invalid_51","wrong_client_version","wrong_business_version"])await send(p(purpose));
   await refill("refill_large");const largeBody=Buffer.byteLength(JSON.stringify(p("large").body));assert.ok(largeBody>16384&&largeBody<ORDER_BODY_LIMIT);const large=checkOrder(await send(p("large")),p("large"));await send(p("oversized_body"));await send(p("late_item_conflict"));
   savedOrders=[first,large];phase="stored_orders";
   await read(async()=>{
    const rows=(await db.query('SELECT "id","businessId","clientId","createdAt","updatedAt" FROM product."Order" WHERE "id"=ANY($1::uuid[])',[orderIds])).rows;assert.equal(rows.length,2);
    for(const row of rows){const wanted=savedOrders.find(o=>o.id===row.id);assert.ok(wanted);assert.deepEqual({...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()},{id:wanted.id,businessId:config.businesses[0],clientId:config.clients[0],createdAt:wanted.createdAt,updatedAt:wanted.updatedAt});}
    phase="stored_items";const entries=(await db.query('SELECT "id","orderId","clientId",encode(convert_to("description",\'UTF8\'),\'hex\') AS description_hex,"measurementVersionId","createdAt","updatedAt" FROM product."OrderItem" WHERE "id"=ANY($1::uuid[]) OR "orderId"=ANY($2::uuid[])',[itemIds,orderIds])).rows;assert.equal(entries.length,11);
    for(const row of entries){const parent=savedOrders.find(o=>o.id===row.orderId),wanted=parent?.items.find(i=>i.id===row.id);assert.ok(wanted);assert.deepEqual({...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()},{id:wanted.id,orderId:parent.id,clientId:config.clients[0],description_hex:Buffer.from(wanted.description,"utf8").toString("hex"),measurementVersionId:wanted.measurementVersionId,createdAt:wanted.createdAt,updatedAt:wanted.updatedAt});}
   });
   phase="final_lists";const a=await list(0),b=await list(1);assert.ok(savedOrders.every(o=>a.some(r=>r.id===o.id)));assert.ok(b.every(o=>!orderIds.includes(o.id)));
   phase="unrelated_snapshot";assert.deepEqual(await snapshot(),baseline);outcome={status:"write_proof_passed",runId,committedSyntheticOrders:2,committedSyntheticItems:11,inventorySaved:true,cleanupPerformed:false,explicitMeasurementCase:config.versions.valid?"tested":"not_configured"};
   }
  }
 }catch(error){outcome=failure(error instanceof RollbackFailure?"observer_rollback":phase,error);}
 finally{if(db)try{await db.end();}catch(error){outcome=failure("connection_cleanup",error);}}
 if(!alive&&outcome.status!=="failed")outcome=failure("connection");
 if(["write_proof_passed","measurement_fixtures_created","item_edit_write_proof_passed"].includes(outcome.status))try{save(config.inventory+".result.json",{format:1,kind:config.editSetup?"order_item_edit_result":config.fixtureSetup?"order_measurement_fixture_result":"order_api_write_result",runId,inventoryCreatedAt:inventory.createdAt,inventoryDigest:digest(inventory),...(config.editSetup?{versions:savedVersions,orders:savedOrders,editTrace}:config.fixtureSetup?{versions:savedVersions}:{orders:savedOrders}),cleanupPerformed:false});}catch(error){outcome=failure("finish_receipt",error);}
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await runOrderApiProof(authorizeOrderApiProof(process.argv.slice(2),process.env),{report:value=>console.log(JSON.stringify(value))});}catch(error){result=["--owner-order-item-edit-preflight","--owner-order-item-edit-write-proof"].includes(process.argv[2])?{status:"failed",stage:"authorization",inventorySaved:false,possibleCommittedOrders:0,possibleCommittedItems:0,possibleCommittedVersions:0,possibleCommittedEntries:0,editsMayHaveCommitted:false,noAutomaticRetry:true}:["--owner-order-measurement-fixture-preflight","--owner-order-measurement-fixture-create"].includes(process.argv[2])?{status:"failed",stage:"authorization",inventorySaved:false,possibleCommittedVersions:0,possibleCommittedEntries:0,noAutomaticRetry:true}:orderApiProofFailure("authorization",false,{orders:new Set(),items:new Set()},error);}
 if(result.status==="failed"){console.error(JSON.stringify(result));process.exitCode=1;}else console.log(JSON.stringify(result));
}
