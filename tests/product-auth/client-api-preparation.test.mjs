// Offline only: no PostgreSQL client, localhost HTTP or private configuration is used.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,chmodSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {authorizeClientApiProof,clientApiProofRequest,saveClientApiInventory,clientApiProofList,clientApiProofFailure} from "./client-api.integration.mjs";
const source=readFileSync(new URL("./client-api.integration.mjs",import.meta.url),"utf8");
const cookieA="better-auth.session_token=synthetic-a.signature",cookieB="better-auth.session_token=synthetic-b.signature";
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_CLIENT_API_PROOF_CONFIRMED:"true",PRODUCT_CLIENT_API_FIXTURES_CONFIRMED:"true",
 PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:3000",PRODUCT_CLIENT_API_BUSINESS_A_ID:"disposable-a",PRODUCT_CLIENT_API_BUSINESS_B_ID:"disposable-b",
 PRODUCT_CLIENT_API_COOKIE_A:cookieA,PRODUCT_CLIENT_API_COOKIE_B:cookieB,PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("Live HTTP is forbidden in preparation tests");test.after(()=>{globalThis.fetch=originalFetch;});
test("proof import is inert; preflight and writes require exact separate owner approvals",()=>{
 assert.equal(authorizeClientApiProof(["--owner-client-api-preflight"],env).write,false);
 assert.throws(()=>authorizeClientApiProof(["--owner-client-api-write-proof"],env));
 assert.equal(authorizeClientApiProof(["--owner-client-api-write-proof"],{...env,PRODUCT_CLIENT_API_WRITES_CONFIRMED:"true",PRODUCT_CLIENT_API_INVENTORY:"/tmp/private-owner-proof.json"}).write,true);
 for(const patch of [{PRODUCT_CLIENT_API_PROOF_CONFIRMED:undefined},{PRODUCT_CLIENT_API_FIXTURES_CONFIRMED:undefined},{PRODUCT_CLIENT_API_BUSINESS_B_ID:env.PRODUCT_CLIENT_API_BUSINESS_A_ID},
  {PRODUCT_CLIENT_API_COOKIE_B:cookieA},{PRODUCT_CLIENT_API_COOKIE_A:cookieA+"; other=value"},{PRODUCT_CLIENT_API_COOKIE_A:"bad\r\nCookie"},
  {PRODUCT_SESSION_HTTP_ORIGIN:"http://192.0.2.1:3000"},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{NODE_OPTIONS:"private"},
  {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("_app:","_migrator:")},
  {PRODUCT_TEST_DATABASE_URL:env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?","/stitchtrack_product_dev?")}])assert.throws(()=>authorizeClientApiProof(["--owner-client-api-preflight"],{...env,...patch}));
});
test("request helper uses fixed localhost API and retries only a definite 429 with identical UUID/body",async()=>{
 const calls=[],waits=[],body={operation:"create",id:"00000000-0000-4000-8000-000000000001",fullName:"Synthetic"};
 const result=await clientApiProofRequest(cookieA,body,{wait:async ms=>waits.push(ms),request:async(url,options)=>{
  calls.push({url,options});return calls.length===1?Response.json({error:"rate_limited"},{status:429,headers:{"retry-after":"5"}}):Response.json({client:{}});
 }});
 assert.equal(result.status,200);assert.deepEqual(waits,[6000]);assert.equal(calls.length,2);assert.equal(calls[0].url,"http://127.0.0.1:3000/api/internal/tailor-clients");
 assert.equal(calls[0].options.body,calls[1].options.body);assert.equal(calls[0].options.redirect,"error");assert.equal(calls[0].options.headers.cookie,cookieA);
});
test("network failure and 503 never retry mutations; concurrency probes do not retry 429",async()=>{
 let count=0;const input={operation:"create",id:"00000000-0000-4000-8000-000000000002",fullName:"Synthetic"};
 await assert.rejects(clientApiProofRequest(cookieA,input,{request:async()=>{count++;throw Error("synthetic network failure");}}));assert.equal(count,1);
 count=0;const unavailable=await clientApiProofRequest(cookieA,input,{request:async()=>{count++;return Response.json({error:"client_unavailable"},{status:503});}});assert.equal(unavailable.status,503);assert.equal(count,1);
 count=0;const limited=await clientApiProofRequest(cookieA,input,{retry429:false,request:async()=>{count++;return Response.json({error:"rate_limited"},{status:429,headers:{"retry-after":"1"}});},wait:async()=>assert.fail("No serial retry during concurrency proof")});assert.equal(limited.status,429);assert.equal(count,1);
 await assert.rejects(clientApiProofRequest(cookieA,input,{request:async()=>Response.json({error:"rate_limited"},{status:429,headers:{"retry-after":"private"}}),wait:async()=>assert.fail("No unbounded wait")}));
});
test("private inventory is outside Git, owner-only, exclusive and never overwrites a prior proof",()=>{
 const dir=mkdtempSync(join(tmpdir(),"stitchtrack-client-api-inventory-"));
 try{
  chmodSync(dir,0o700);const path=join(dir,"proof.json"),data={format:1,runId:"synthetic-run",clients:[{id:"synthetic-id",business:"A"}]};
  saveClientApiInventory(path,data);assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),data);assert.equal(statSync(path).mode&0o777,0o600);
  assert.throws(()=>saveClientApiInventory(path,{overwritten:true}));assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),data);
  chmodSync(dir,0o755);assert.throws(()=>saveClientApiInventory(join(dir,"unsafe.json"),data));assert.throws(()=>saveClientApiInventory("relative.json",data));
 }finally{assert.ok(dir.startsWith(join(tmpdir(),"stitchtrack-client-api-inventory-")));rmSync(dir,{recursive:true});}
});
test("database access is app-role/read-only; HTTP commits and retained records are explicit",()=>{
 assert.match(source,/productDatabaseConfig\(env\)/u);assert.doesNotMatch(source,/productMigrationConfig|new PrismaClient|\.login\(|signUpEmail|\.logout\(/u);
 assert.match(source,/db\.query\("BEGIN READ ONLY"\)/u);assert.match(source,/db\.query\("ROLLBACK"\)/u);
 assert.doesNotMatch(source,/\b(?:INSERT INTO|DELETE FROM|UPDATE product\.|TRUNCATE|GRANT |ALTER TABLE|CREATE TABLE)\b/u);
 for(const token of ['committedSyntheticClients:3','sessionsCreated:0','rateCountersMayChange:true','possibleCommittedClients:inventorySaved?3:0','cleanupPerformed:false',
  'session.expiresAt.getTime()>deadline+60000','saveClientApiInventory(config.inventory','retry429:false','assert.deepEqual(await snapshots(),before)'])assert.ok(source.includes(token),token);
 assert.ok(source.indexOf('saveClientApiInventory(config.inventory')<source.indexOf('phase="create_name_only"'));
 const preflight=source.slice(source.indexOf('phase="non_client_write_checks"'),source.indexOf('saveClientApiInventory(config.inventory'));
 assert.doesNotMatch(preflight,/operation:"create"|operation:"update"/u,"Even rejected mutation probes require a durable inventory first");
 const inventory=source.slice(source.indexOf('saveClientApiInventory(config.inventory'),source.indexOf('inventorySaved=true'));
 assert.doesNotMatch(inventory,/cookies|tokenKey|target\.url|password/u);
});

const record=(n,createdAt="2026-01-01T00:00:00.000Z")=>({id:"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),
 fullName:"Synthetic",phone:null,email:null,createdAt,updatedAt:createdAt});
test("paginated A/B reads retain exact limit, cursor, ordering and database-scope assertions",async()=>{
 for(const index of [0,1]){
  const a=record(1),b=record(2),cursor={createdAt:a.createdAt,id:a.id},calls=[],stages=[];
  const rows=await clientApiProofList(index,{setStage:s=>stages.push(s),readIds:async i=>{assert.equal(i,index);return [a.id,b.id];},
   one:async(i,body)=>{assert.equal(i,index);calls.push(body);return calls.length===1?{clients:[a],nextCursor:cursor}:{clients:[b],nextCursor:null};}});
  assert.deepEqual(rows,[a,b]);assert.deepEqual(calls,[{operation:"list",limit:1},{operation:"list",limit:1,cursor}]);
  const prefix=index===0?"client_list_a":"client_list_b";
  assert.deepEqual(stages,[prefix+"_http",prefix+"_response",prefix+"_page_size",prefix+"_http",prefix+"_response",prefix+"_page_size",
   prefix+"_ordering",prefix+"_unique_ids",prefix+"_database_scope"]);
 }
});
test("list failures distinguish each business, malformed pages, ordering, database comparison and page bound",async()=>{
 const a=record(1),b=record(2),cursor={createdAt:a.createdAt,id:a.id};
 for(const scenario of [
  {index:0,suffix:"http",one:async()=>{throw Error("private response");}},
  {index:1,suffix:"response",one:async()=>({private:"unpublished payload"})},
  {index:0,suffix:"page_size",one:async()=>({clients:[a,b],nextCursor:null})},
  {index:1,suffix:"ordering",pages:[{clients:[b],nextCursor:cursor},{clients:[a],nextCursor:null}]},
  {index:0,suffix:"database_scope",one:async()=>({clients:[a],nextCursor:null}),readIds:async()=>[b.id]},
  {index:1,suffix:"page_bound",one:async()=>({clients:[a],nextCursor:cursor})}
 ]){
  let stage,calls=0;
  await assert.rejects(clientApiProofList(scenario.index,{setStage:s=>{stage=s;},readIds:scenario.readIds??(async()=>[]),
   one:scenario.one??(async()=>scenario.pages[calls++])}));
  assert.equal(stage,(scenario.index===0?"client_list_a":"client_list_b")+"_"+scenario.suffix);
 }
});
test("unexpected HTTP status is safe numeric output, including non-JSON errors, without body or header disclosure",async()=>{
 for(const [actual,expected] of [[503,200],[403,401],[200,422]]){
  let error,calls=0;
  try{await clientApiProofRequest(cookieA,{operation:"list"},{expectedStatus:expected,request:async()=>{
   calls++;return new Response("PRIVATE_BODY",{status:actual,headers:{"content-type":"text/html","x-private":"PRIVATE_HEADER"}});
  }});}catch(e){error=e;}
  assert.ok(error);assert.equal(calls,1);
  const result=clientApiProofFailure("invalid_list_limit_zero",false,error);
  assert.deepEqual(result,{status:"failed",stage:"invalid_list_limit_zero",inventorySaved:false,possibleCommittedClients:0,noAutomaticRetry:true,
   actualHttpStatus:actual,expectedHttpStatus:expected});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|cookie|synthetic-a|stack|body|headers/u);
 }
 const unsafe=Object.assign(Error("PRIVATE_BODY"),{actual:503,expected:200,body:"PRIVATE",cookie:cookieA});
 assert.deepEqual(clientApiProofFailure("client_list_b_response",true,unsafe),{status:"failed",stage:"client_list_b_response",inventorySaved:true,
  possibleCommittedClients:3,noAutomaticRetry:true});
});
test("preflight stages identify every rejection probe and existing-record comparison without introducing writes",()=>{
 for(const token of ['phase="invalid_session_http"','expectedStatus:401','phase="invalid_session_response"',
  '["invalid_list_limit_zero",{operation:"list",limit:0}]','["invalid_list_limit_above_max",{operation:"list",limit:51}]',
  '["invalid_list_ownership_field",{operation:"list",businessId:config.businesses[1]}]',
  '["invalid_get_timestamp",{operation:"get",id:ids[0],updatedAt:"2026-01-01T00:00:00.000Z"}]',
  'phase=stage;assert.deepEqual(await one(0,body,422),{error:"validation_failed"})',
  'phase="preflight_existing_record_snapshot";assert.deepEqual(await snapshots(),before)',
  'catch(error){return clientApiProofFailure(phase,inventorySaved,error);}',
  'const r=await api(index,body,{expectedStatus:status})'])assert.ok(source.includes(token),token);
});

// Execute only the existing fixture-check block with synthetic query results: no pg import or HTTP.
const fixtureStart=source.indexOf('phase="fixture_and_session_preflight"');
const fixtureEnd=source.indexOf('\n  });\n  phase="existing_record_baseline"',fixtureStart);
assert.ok(fixtureStart>=0&&fixtureEnd>fixtureStart);
const fixtureBlock=source.slice(fixtureStart,fixtureEnd);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const fixtureChecks=new AsyncFunction("config","db","sessionTokenDigester","deadline","ids","assert",
 'let phase;try{const result=await(async()=>{'+fixtureBlock+'})();return {phase,result};}catch(error){return {phase,error};}');
async function fixtureScenario(failure,duplicateOwners=false){
 const deadline=Date.now()+900000,owners=["synthetic-owner-a",duplicateOwners?"synthetic-owner-a":"synthetic-owner-b"],calls=[];
 let index=-1;
 const db={query:async(sql,params)=>{
  calls.push(sql);
  if(sql.includes('SELECT b."primaryOwnerUserId"')){
   index++;assert.equal(params[0],env[index===0?"PRODUCT_CLIENT_API_BUSINESS_A_ID":"PRODUCT_CLIENT_API_BUSINESS_B_ID"]);
   return {rows:failure===`fixture_${index===0?"a":"b"}_owner_eligibility`?[]:[{id:owners[index]}]};
  }
  const prefix=index===0?"fixture_a":"fixture_b";
  if(sql.includes('FROM product."Session"')){
   if(failure===prefix+"_session_lookup")throw Error("PRIVATE_QUERY_ERROR");
   return {rows:[{userId:failure===prefix+"_session_owner_match"?"synthetic-other":owners[index],
    expiresAt:new Date(deadline+(failure===prefix+"_session_lifetime"?60000:60001))}]};
  }
  if(sql.includes('count(*)'))return {rows:[{count:failure===prefix+"_client_count"?21:20}]};
  assert.ok(sql.includes('WHERE "id"=ANY($1::uuid[])'));return {rowCount:failure==="fixture_client_uuid_absence"?1:0};
 }};
 const outcome=await fixtureChecks({businesses:[env.PRODUCT_CLIENT_API_BUSINESS_A_ID,env.PRODUCT_CLIENT_API_BUSINESS_B_ID],
  cookies:[cookieA,cookieB],tokenKey:Buffer.alloc(32,7)},db,()=>raw=>{assert.ok(raw.startsWith("synthetic-"));return "synthetic-digest";},
 deadline,["synthetic-unused-uuid"],assert);
 assert.ok(calls.every(sql=>sql.startsWith("SELECT ")),"Fixture checks remain reads only");return {outcome,calls,owners};
}
test("each fixture eligibility/session/count failure reports its fixed A/B stage without private data",async()=>{
 for(const business of ["a","b"])for(const check of ["owner_eligibility","session_lookup","session_owner_match","session_lifetime","client_count"]){
  const stage=`fixture_${business}_${check}`,{outcome,calls}=await fixtureScenario(stage);
  assert.ok(outcome.error);assert.equal(outcome.phase,stage);
  assert.ok(calls.length<7,"Failure stops subsequent fixture checks");
  const published=clientApiProofFailure(outcome.phase,false,outcome.error);
  assert.deepEqual(published,{status:"failed",stage,inventorySaved:false,possibleCommittedClients:0,noAutomaticRetry:true});
  assert.doesNotMatch(JSON.stringify(published),/synthetic|PRIVATE|userId|businessId|cookie|token|query|stack/u);
 }
});
test("fixture diagnostics preserve distinct owners, unused UUID assertion and original strict lifetime/count boundaries",async()=>{
 const good=await fixtureScenario();assert.deepEqual(good.outcome.result,good.owners);assert.equal(good.outcome.error,undefined);
 assert.equal(good.calls.length,7); // Two owner, session and count queries, then UUID absence.
 const duplicate=await fixtureScenario(undefined,true);assert.ok(duplicate.outcome.error);assert.equal(duplicate.outcome.phase,"fixture_distinct_owners");
 assert.equal(duplicate.calls.length,6);
 const collision=await fixtureScenario("fixture_client_uuid_absence");assert.ok(collision.outcome.error);assert.equal(collision.outcome.phase,"fixture_client_uuid_absence");
 assert.match(fixtureBlock,/session\.expiresAt\.getTime\(\)>deadline\+60000/u);
 assert.match(fixtureBlock,/assert\.ok\(count<=20\)/u);
 for(const token of ['u."emailVerified"','u."disabledAt" IS NULL','u."deletionRequestedAt" IS NULL',
  'm."userId"=b."primaryOwnerUserId"',"a.\"providerId\"='credential'",'a."password" IS NOT NULL'])assert.ok(fixtureBlock.includes(token),token);
});
