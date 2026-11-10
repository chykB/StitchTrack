// Real auth/crypto/raw transport with persistence/locking doubles. No PostgreSQL or listener.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {IncomingMessage} from "node:http";
import {randomUUID,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {measurementPath,measurementRequestSchema,measurementSingleReplySchema,measurementListReplySchema} from "../../lib/measurement-contract.ts";
const {createMeasurementService}=await import("../../lib/product-auth/measurements.server.ts");
const {createLocalMeasurementDispatcher}=await import("../../lib/product-auth/measurements-http.server.ts");
const {createNextMeasurementHandler}=await import("../../lib/product-auth/registration-next.server.ts");
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const {Prisma}=await import("../../prisma/product/generated/client.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const origin="http://127.0.0.1:3000",password=" Offline measurement fixture password ",hash=await hashPassword(password),key=Buffer.alloc(32,9);
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",ENABLE_LOCAL_AUTH_FRONTEND:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-measurement-signing-secret-not-real",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const ids={a:randomUUID(),a2:randomUUID(),b:randomUUID()};
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
const create=(patch={})=>({operation:"create",id:randomUUID(),clientId:ids.a,unit:"cm",entries:[{name:" Hip ",value:"40.25"}],...patch});
const known=(code="P2002")=>new Prisma.PrismaClientKnownRequestError("PRIVATE storage identifiers",{code,clientVersion:"offline"});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No external network permitted");test.after(()=>{globalThis.fetch=originalFetch;});
async function fixture(){
 const f=fakeProduct({sessionAccess:true});Object.assign(f.rows(),{business:[],businessMember:[],clients:[],measurementVersions:[],measurementEntries:[]});
 let failure=null,budget="allow",tail=Promise.resolve(),allocations=0;const buckets=[],scopes=[],clientReads=[],clientLocks=[];
 // ICU here only models a server oracle. Actual installed PostgreSQL semantics need a live proof.
 const collator=new Intl.Collator("und",{sensitivity:"accent"}),equal=(a,b)=>collator.compare(a,b)===0;
 const pick=(row,select)=>row?structuredClone(Object.fromEntries(Object.keys(select).map(k=>[k,row[k]]))):null;
 for(const suffix of ["a","b"]){const id="tailor-"+suffix;
  await f.client.user.create({data:{id,name:id,email:id+"@example.invalid",emailVerified:true}});
  await f.client.account.create({data:{id:id+"-password",accountId:id,userId:id,providerId:"credential",password:hash}});
  f.rows().business.push({id:"business-"+suffix,primaryOwnerUserId:id,name:"Studio "+suffix,timeZone:"Africa/Lagos"});
  f.rows().businessMember.push({businessId:"business-"+suffix,userId:id});
 }
 for(const [key,id]of Object.entries(ids))f.rows().clients.push({id,businessId:key==="b"?"business-b":"business-a"});
 f.client.business={findUnique:async({where,select})=>{assert.ok(f.inTransaction());if(failure==="business_read")throw Error("PRIVATE storage");return pick(f.rows().business.find(b=>b.primaryOwnerUserId===where.primaryOwnerUserId),select);}};
 f.client.businessMember={findUnique:async({where,select})=>{const w=where.businessId_userId;return pick(f.rows().businessMember.find(m=>m.businessId===w.businessId&&m.userId===w.userId),select);}};
 f.client.client={async findFirst({where,select}){
  assert.ok(f.inTransaction());assert.ok(f.events.lastIndexOf("user.lock")>f.events.lastIndexOf("outer.begin"));
  assert.deepEqual(Object.keys(where).sort(),["businessId","id"]);assert.deepEqual(select,{id:true});
  clientReads.push(structuredClone(where));f.events.push("client.lookup");if(failure==="client_read")throw Error("PRIVATE client read failure");
  return pick(f.rows().clients.find(r=>r.id===where.id&&r.businessId===where.businessId),select);
 }};
 const matches=(row,where)=>Object.entries(where).every(([k,v])=>v&&typeof v==="object"&&"lt" in v?row[k]<v.lt:row[k]===v);
 const scope=where=>{
  assert.ok(f.inTransaction());assert.ok(f.events.lastIndexOf("user.lock")>f.events.lastIndexOf("outer.begin"));
  assert.ok(Math.max(f.events.lastIndexOf("client.lock"),f.events.lastIndexOf("client.lookup"))>f.events.lastIndexOf("user.lock"));assert.ok(["business-a","business-b"].includes(where.businessId));
  assert.ok([ids.a,ids.a2,ids.b].includes(where.clientId));scopes.push(structuredClone(where));if(failure==="read")throw Error("PRIVATE read failure");
 };
 const record=row=>row?{id:row.id,clientId:row.clientId,unit:row.unit,versionNumber:row.versionNumber,recordedAt:new Date(row.recordedAt),
  entries:f.rows().measurementEntries.filter(e=>e.measurementVersionId===row.id).toSorted((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).slice(0,51).map(e=>({name:e.name,value:new Prisma.Decimal(e.value)}))}:null;
 f.client.measurementVersion={
  async findFirst({where,select}){scope(where);assert.equal(select.entries.take,51);return record(f.rows().measurementVersions.find(r=>matches(r,where)));},
  async findMany({where,orderBy,take,select}){scope(where);assert.deepEqual(orderBy,{versionNumber:"desc"});assert.ok(take>=2&&take<=51);assert.equal(select.entries.take,51);
   return f.rows().measurementVersions.filter(r=>matches(r,where)).toSorted((a,b)=>b.versionNumber-a.versionNumber).slice(0,take).map(record);},
  async aggregate({where,_max}){scope(where);assert.ok(f.events.lastIndexOf("client.lock")>f.events.lastIndexOf("user.lock"));assert.deepEqual(_max,{versionNumber:true});allocations++;f.events.push("measurement.allocate");
   return {_max:{versionNumber:failure==="overflow"?2147483647:Math.max(0,...f.rows().measurementVersions.filter(r=>matches(r,where)).map(r=>r.versionNumber))||null}};},
  async create({data,select}){scope(data);assert.ok(f.events.lastIndexOf("client.lock")>f.events.lastIndexOf("user.lock"));assert.deepEqual(select,{id:true});assert.deepEqual(Object.keys(data).sort(),["id","businessId","clientId","versionNumber","unit"].sort());
   if(f.rows().measurementVersions.some(r=>r.id===data.id||r.clientId===data.clientId&&r.versionNumber===data.versionNumber))throw known();
   if(failure==="create")throw Error("PRIVATE insert error");
   f.rows().measurementVersions.push({...data,recordedAt:new Date("2026-11-08T12:00:00.000Z")});f.events.push("measurement.create");return {id:data.id};},
 };
 f.client.measurementEntry={async createMany({data}){
  assert.ok(f.inTransaction());assert.ok(data.length>=1&&data.length<=50);
  for(const e of data){
   assert.deepEqual(Object.keys(e).sort(),["measurementVersionId","name","value"].sort());assert.ok(e.value instanceof Prisma.Decimal);
   if(failure==="entry_unique")throw known();
   if(f.rows().measurementEntries.some(r=>r.measurementVersionId===e.measurementVersionId&&equal(r.name,e.name)))throw known();
   f.rows().measurementEntries.push({...e,value:e.value.toString()});if(failure==="entry_partial"||failure==="entry_partial_once"){if(failure==="entry_partial_once")failure=null;throw Error("PRIVATE partial insertion");}
  }
  f.events.push("measurement.entries");return {count:failure==="entry_count"?0:data.length};
 }};
 const query=f.client.$queryRaw,transaction=f.client.$transaction;
 f.client.$queryRaw=async(parts,...values)=>{
  const sql=parts.join("?");
  if(sql.includes('INSERT INTO "product"."AuthRateBucket"')){buckets.push(values[0]);if(budget==="failure")throw Error("PRIVATE budget");if(budget==="malformed")return [{allowed:true}];
   return [{allowed:budget!=="deny"&&!(budget==="account"&&buckets.length%3===0),retryAfterSeconds:5}];}
  if(sql.includes('FROM product."Client"')){
   assert.ok(sql.includes("FOR UPDATE"));assert.ok(f.inTransaction());assert.ok(f.events.lastIndexOf("user.lock")>f.events.lastIndexOf("outer.begin"));
   if(failure==="client_lock")throw Error("PRIVATE timeout");f.events.push("client.lock");clientLocks.push({id:values[0],businessId:values[1]});return f.rows().clients.filter(r=>r.id===values[0]&&r.businessId===values[1]).map(r=>({id:r.id}));
  }
  if(sql.includes("FROM unnest(")){
   assert.ok(f.inTransaction());assert.match(sql,/GROUP BY name COLLATE product\.measurement_label_ci/u);assert.ok(f.events.lastIndexOf("client.lock")>f.events.lastIndexOf("user.lock"));
   if(failure==="collation")throw Error("PRIVATE missing collation");
   const names=values[0];return failure==="malformed_duplicate"?[{duplicate:"false"}]:[{duplicate:names.some((a,i)=>names.slice(i+1).some(b=>equal(a,b)))}];
  }
  return query(parts,...values);
 };
 // Models serialization of real User/Client row locks; it is not PostgreSQL concurrency evidence.
 f.client.$transaction=(callback,options)=>{const task=tail.then(async()=>{const result=await transaction(async tx=>{const value=await callback(tx);if(failure==="commit")throw Error("PRIVATE commit failure");return value;},options);if(failure==="uncertain")throw Error("PRIVATE lost commit acknowledgement");return result;});tail=task.catch(()=>{});return task;};
 const sessions=createSessionService(f.client,{mode:"test",origin,authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY,"base64"),expiresInSeconds:604800,renewal:"none"});
 const login=async(id="tailor-a")=>{const result=await sessions.login({email:id+"@example.invalid",password});return new Headers({cookie:result.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});};
 const service=createMeasurementService(f.client,sessions);
 async function call({headers,body={operation:"list",clientId:ids.a},method="POST",extra={},rawHeaders,settings=env,peer="127.0.0.1",path=measurementPath}={}){
  const socket=new Socket();for(const [k,v]of Object.entries({remoteAddress:peer,localAddress:"127.0.0.1",localPort:3000}))Object.defineProperty(socket,k,{value:v});
  const request=new IncomingMessage(socket);request.method=method;request.url=path;request.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3000",origin,"content-type":"application/json",...(headers?.get("cookie")?{cookie:headers.get("cookie")}:{}),...extra}).flat();
  request.headers={businessId:"business-b","x-forwarded-for":"untrusted"};request.push(typeof body==="string"?body:JSON.stringify(body));request.push(null);
  const replyHeaders=new Headers();let bytes;
  const outgoing={statusCode:200,destroyed:false,writableEnded:false,setHeader:(k,v)=>{if(Array.isArray(v))for(const item of v)replyHeaders.append(k,item);else replyHeaders.set(k,v);},end:value=>{bytes=value;}};
  try{await createNextMeasurementHandler({environment:()=>settings,runtime:async e=>createLocalMeasurementDispatcher(f.client,e,key)})(request,outgoing);return new Response(bytes,{status:outgoing.statusCode,headers:replyHeaders});}
  finally{request.destroy();socket.destroy();}
 }
 return {...f,sessions,service,login,call,scopes,buckets,clientReads,clientLocks,allocations:()=>allocations,setFailure:v=>{failure=v;},setBudget:v=>{budget=v;}};
}
test("strict contract trims flexible Unicode labels and accepts exactly 1-50 entries",()=>{
 const input=create();assert.equal(measurementRequestSchema.parse(input).entries[0].name,"Hip");
 for(const name of ["Hip","Thigh","Agbada Length","\u{1f9f5}".repeat(60),"\u00ccB\u00c0D\u00cd"])assert.equal(measurementRequestSchema.parse(create({entries:[{name,value:"1"}]})).entries[0].name,name);
 for(const name of [""," \u00a0 ","\u0085","\ud800","\u{1f9f5}".repeat(61)])assert.equal(measurementRequestSchema.safeParse(create({entries:[{name,value:"1"}]})).success,false);
 for(const count of [0,51])assert.equal(measurementRequestSchema.safeParse(create({entries:Array.from({length:count},(_,i)=>({name:"Label "+i,value:"1"}))})).success,false);
 assert.equal(measurementRequestSchema.safeParse(create({entries:Array.from({length:50},(_,i)=>({name:"Label "+i,value:"1"}))})).success,true);
 for(const unit of ["mm","CM","",null])assert.equal(measurementRequestSchema.safeParse(create({unit})).success,false);
 for(const unit of ["cm","in"])assert.equal(measurementRequestSchema.safeParse(create({unit})).success,true);
});
test("exact decimal contract rejects rounding, exponent syntax and numeric coercion",()=>{
 for(const value of ["0.01","1","40.25","999.99","1000","1000.00","00040.00"])assert.equal(measurementRequestSchema.safeParse(create({entries:[{name:"Hip",value}]})).success,true,value);
 for(const value of ["0","0.00","-1","1000.01","1.001","1.000","0.001","NaN","Infinity","1e2",".5","1.","","abc"," 1 ",1,0.01,null])
  assert.equal(measurementRequestSchema.safeParse(create({entries:[{name:"Hip",value}]})).success,false,String(value));
 assert.equal(measurementRequestSchema.parse(create({entries:[{name:"Hip",value:"40.00"}]})).entries[0].value,"40");
});
test("all operations reject forged ownership, version allocation and unsupported mutations",()=>{
 for(const body of [create(),{operation:"list",clientId:ids.a},{operation:"get",clientId:ids.a,id:randomUUID()}]){
  for(const extra of [{businessId:"business-b"},{ownerId:"tailor-b"},{isAdministrator:true},{versionNumber:7},{recordedAt:"2026-11-08T00:00:00.000Z"}])assert.equal(measurementRequestSchema.safeParse({...body,...extra}).success,false);
 }
 for(const operation of ["update","delete","copy"])assert.equal(measurementRequestSchema.safeParse({...create(),operation}).success,false);
 for(const id of [undefined,"not-uuid"])assert.equal(measurementRequestSchema.safeParse(create({id})).success,false);
 assert.equal(measurementRequestSchema.safeParse(create({entries:[{name:"Hip",value:"1",measurementVersionId:randomUUID()}]})).success,false);
});
test("atomic flexible-set creation derives business ownership and returns exact decimal strings without a new session",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),sessions=f.rows().session.length;
 const input=create({entries:[{name:"Hip",value:"0.01"},{name:"Agbada Length",value:"1000.00"},{name:"Thigh",value:"45.25"}]}),r=await f.call({headers:h,body:input});
 assert.equal(r.status,200);assert.equal(r.headers.has("set-cookie"),false);assert.equal(r.headers.get("cache-control"),"no-store");
 const saved=measurementSingleReplySchema.parse(await r.json()).version;assert.equal(saved.versionNumber,1);assert.equal(saved.clientId,ids.a);assert.equal(saved.unit,"cm");assert.equal(saved.entries.find(e=>e.name==="Agbada Length").value,"1000");
 assert.equal(f.rows().measurementVersions[0].businessId,"business-a");assert.equal(f.rows().measurementEntries.length,3);assert.equal(f.rows().session.length,sessions);
 assert.ok(f.events.lastIndexOf("user.lock")<f.events.lastIndexOf("client.lock"));assert.ok(f.events.lastIndexOf("client.lock")<f.events.lastIndexOf("measurement.allocate"));
}));
test("duplicate labels use the database oracle, including Unicode canonical and case collisions",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();
 for(const [left,right]of [["Chest"," CHEST "],["\u00c9paule","\u00e9PAULE"],["\u00ccB\u00c0D\u00cd","\u00ecb\u00e0d\u00ed"],["\u00e9paule","e\u0301paule"],["e\u0323\u0302","e\u0302\u0323"]]){
  const r=await f.call({headers:h,body:create({entries:[{name:left,value:"1"},{name:right,value:"2"}]})});assert.equal(r.status,422);assert.deepEqual(await r.json(),{error:"validation_failed"});assert.equal(f.rows().measurementVersions.length,0);
 }
 const input=create({entries:[{name:"Epaule",value:"1"},{name:"\u00e9paule",value:"2"}]}),saved=(await f.service.execute(h,input)).version;
 assert.equal(saved.entries.length,2);assert.deepEqual(saved.entries.map(e=>e.name),input.entries.map(e=>e.name).toSorted());
}));
test("list/get never expose another business or another client, including administrator claims",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),saved=(await f.service.execute(a,create())).version;
 f.rows().user[1].isAdministrator=true;f.rows().businessMember.push({businessId:"business-a",userId:"tailor-b"});
 assert.deepEqual(await f.service.execute(b,{operation:"list",clientId:ids.b}),{versions:[],nextCursor:null});
 for(const body of [{operation:"list",clientId:ids.a},{operation:"get",clientId:ids.b,id:saved.id},{operation:"get",clientId:ids.b,id:randomUUID()},create({clientId:ids.a})]){
  const r=await f.call({headers:b,body});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"measurement_not_found"});
 }
 for(const id of [saved.id,randomUUID()]){const r=await f.call({headers:a,body:{operation:"get",clientId:ids.a2,id}});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"measurement_not_found"});}
 const colliding=await f.call({headers:b,body:create({clientId:ids.b,id:saved.id})});assert.equal(colliding.status,409);assert.deepEqual(await colliding.json(),{error:"measurement_conflict"});assert.equal(f.rows().measurementVersions.length,1);
}));
test("idempotent retries tolerate entry order and equivalent decimals but never overwrite labels, values, units or client",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create({entries:[{name:"Hip",value:"40.00"},{name:"Thigh",value:"20.50"}]}),first=await f.service.execute(h,input),allocated=f.allocations();
 assert.deepEqual(await f.service.execute(h,{...input,entries:[{name:"Thigh",value:"20.5"},{name:" Hip ",value:"40"}]}),first);assert.equal(f.allocations(),allocated);
 for(const patch of [{unit:"in"},{entries:[{name:"Hip",value:"41"}]},{entries:[{name:"HIP",value:"40"},{name:"Thigh",value:"20.5"}]},{clientId:ids.a2}]){
  await assert.rejects(f.service.execute(h,{...input,...patch}),e=>e.code==="conflict");
 }
 assert.equal(f.rows().measurementVersions.length,1);assert.deepEqual(await f.service.execute(h,{operation:"get",clientId:ids.a,id:input.id}),first);
}));
test("DOUBLE concurrent creates allocate consecutive committed numbers and identical UUIDs create one version",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create();
 const repeated=await Promise.all([f.service.execute(h,input),f.service.execute(h,input)]);assert.deepEqual(repeated[0],repeated[1]);assert.equal(f.rows().measurementVersions.length,1);
 const different=await Promise.all([f.service.execute(h,create()),f.service.execute(h,create())]);assert.deepEqual(different.map(v=>v.version.versionNumber).toSorted((a,b)=>a-b),[2,3]);
 const other=(await f.service.execute(h,create({clientId:ids.a2}))).version;assert.equal(other.versionNumber,1);
 const body=create(),conflicting=await Promise.allSettled([f.service.execute(h,body),f.service.execute(h,{...body,unit:"in"})]);
 assert.equal(conflicting.filter(r=>r.status==="fulfilled").length,1);assert.equal(conflicting.filter(r=>r.status==="rejected").length,1);assert.equal(conflicting.find(r=>r.status==="rejected").reason.code,"conflict");assert.deepEqual(f.rows().measurementVersions.filter(v=>v.clientId===ids.a).map(v=>v.versionNumber),[1,2,3,4]);
}));
test("partial entry/parent/commit failures roll back completely and consume no version number",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),first=await f.service.execute(h,create()),before=structuredClone(f.rows().measurementEntries);
 for(const failure of ["create","entry_partial","entry_count","commit"]){
  f.setFailure(failure);const r=await f.call({headers:h,body:create()});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"measurement_unavailable"});
  assert.equal(f.rows().measurementVersions.length,1);assert.deepEqual(f.rows().measurementEntries,before);
 }
 f.setFailure("entry_unique");assert.equal((await f.call({headers:h,body:create()})).status,422);assert.equal(f.rows().measurementVersions.length,1);
 f.setFailure(null);assert.equal((await f.service.execute(h,create())).version.versionNumber,2);assert.deepEqual(await f.service.execute(h,{operation:"get",clientId:ids.a,id:first.version.id}),first);
}));
test("uncertain COMMIT returns unavailable without retry; same-UUID reconciliation does not allocate again",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create();f.setFailure("uncertain");
 const r=await f.call({headers:h,body:input});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"measurement_unavailable"});assert.equal(f.rows().measurementVersions.length,1);assert.equal(f.allocations(),1);
 f.setFailure(null);const saved=await f.service.execute(h,{operation:"get",clientId:ids.a,id:input.id});assert.deepEqual(await f.service.execute(h,input),saved);assert.equal(f.rows().measurementVersions.length,1);assert.equal(f.allocations(),1);
}));
test("history pagination is bounded, newest-first and stable, with complete immutable entries",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();const first=await f.service.execute(h,create());for(let i=0;i<5;i++)await f.service.execute(h,create());await f.service.execute(h,create({clientId:ids.a2}));
 const seen=[];let cursor;do{const r=measurementListReplySchema.parse(await f.service.execute(h,{operation:"list",clientId:ids.a,limit:2,...(cursor?{cursor}:{})}));assert.ok(r.versions.every(v=>v.entries.length===1));seen.push(...r.versions.map(v=>v.versionNumber));cursor=r.nextCursor;}while(cursor);
 assert.deepEqual(seen,[6,5,4,3,2,1]);assert.deepEqual(await f.service.execute(h,{operation:"get",clientId:ids.a,id:first.version.id}),first);
 for(const limit of [0,51,1.5,"2"])assert.equal(measurementRequestSchema.safeParse({operation:"list",clientId:ids.a,limit}).success,false);
 for(const cursor of [{versionNumber:0},{versionNumber:2147483648},{versionNumber:2,businessId:"forged"}])assert.equal(measurementRequestSchema.safeParse({operation:"list",clientId:ids.a,cursor}).success,false);
}));
test("active verified credential and session eligibility are rechecked after acquiring the User lock",async()=>development(async()=>{
 for(const kind of ["disabled","deletion","unverified","passwordless","revoked","expired","membership"]){
  const f=await fixture(),h=await f.login();let changed=false;
  const sessions={...f.sessions,lookup:async headers=>{const result=await f.sessions.lookup(headers);if(!changed){changed=true;const user=f.rows().user[0];if(kind==="disabled")user.disabledAt=new Date();if(kind==="deletion")user.deletionRequestedAt=new Date();if(kind==="unverified")user.emailVerified=false;if(kind==="passwordless")f.rows().account=f.rows().account.filter(a=>a.userId!==user.id);if(kind==="revoked")f.rows().session=[];if(kind==="expired")f.rows().session[0].expiresAt=new Date(0);if(kind==="membership")f.rows().businessMember=[];}return result;}};
  const service=createMeasurementService(f.client,sessions);
  for(const body of [create(),{operation:"list",clientId:ids.a},{operation:"get",clientId:ids.a,id:randomUUID()}])await assert.rejects(service.execute(h,body),e=>e.code===(kind==="membership"?"unavailable":"unauthenticated"),kind);
  assert.equal(f.rows().measurementVersions.length,0);
 }
 const f=await fixture();assert.equal((await f.call()).status,401);assert.equal((await f.call({headers:new Headers({cookie:"better-auth.session_token=invalid"})})).status,401);const h=await f.login();f.rows().session[0].expiresAt=new Date(0);assert.equal((await f.call({headers:h})).status,401);
}));
test("missing onboarding and database/lock/collation failures are safe, distinct responses",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();for(const failure of ["business_read","client_lock","read","collation","malformed_duplicate","overflow"]){f.setFailure(failure);const r=await f.call({headers:h,body:create()});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"measurement_unavailable"});assert.equal(f.rows().measurementVersions.length,0);}
 f.setFailure(null);f.rows().business=[];const r=await f.call({headers:h});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"business_required"});
}));
test("raw Next transport preserves Origin, body limits, method, forwarding and default-off guards",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();assert.equal((await f.call({headers:h})).status,200);
 for(const extra of [{origin:"https://outside.invalid"},{"x-forwarded-for":"127.0.0.1"},{"sec-fetch-site":"cross-site"}])assert.equal((await f.call({headers:h,extra})).status,403);
 assert.equal((await f.call({headers:h,rawHeaders:["host","127.0.0.1:3000","Host","127.0.0.1:3000"]})).status,400);
 assert.equal((await f.call({headers:h,peer:"192.0.2.1"})).status,404);assert.equal((await f.call({headers:h,method:"GET"})).status,405);assert.equal((await f.call({headers:h,path:measurementPath+"?businessId=forged"})).status,404);
 assert.equal((await f.call({headers:h,body:"x".repeat(16385)})).status,413);assert.equal((await f.call({headers:h,body:"{"})).status,400);
 assert.equal((await f.call({headers:h,body:create({businessId:"forged"})})).status,422);
 for(const patch of [{ENABLE_PRODUCT_SESSION_HTTP:undefined},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"}])assert.ok([404,503].includes((await f.call({headers:h,settings:{...env,...patch}})).status));
 assert.match(readFileSync(new URL("../../pages/api/internal/tailor-measurements.ts",import.meta.url),"utf8"),/bodyParser:false/u);
}));
test("rate limiting fails closed and returns numeric Retry-After without changing authentication buckets",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.call({headers:h});await f.call({headers:h,body:create()});
 const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID);
 for(const [operation,version]of [["login",policy.login.version],["client-read",policy.session.version+"-c"],["client-write",policy.login.version+"-c"]]){
  const digest="rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1",operation,version,"account","tailor-a@example.invalid"])).digest("hex");assert.equal(f.buckets.includes(digest),false);
 }
 assert.ok(new Set(f.buckets).size>=4);
 for(const budget of ["deny","failure","malformed"]){f.setBudget(budget);const r=await f.call({headers:h});assert.equal(r.status,budget==="deny"?429:503);if(budget==="deny")assert.match(r.headers.get("retry-after"),/^[1-9][0-9]*$/u);else assert.deepEqual(await r.json(),{error:"measurement_unavailable"});}
 const account=await fixture(),headers=await account.login();account.setBudget("account");const r=await account.call({headers,body:create()});assert.equal(r.status,429);assert.match(r.headers.get("retry-after"),/^[1-9][0-9]*$/u);assert.equal(account.rows().measurementVersions.length,0);
}));
test("immutable service contains no measurement UPDATE/DELETE/upsert or insecure SQL interpolation",()=>{
 const source=readFileSync(new URL("../../lib/product-auth/measurements.server.ts",import.meta.url),"utf8");assert.doesNotMatch(source,/measurement(?:Version|Entry)\.(?:update|delete|upsert)|\$queryRawUnsafe|\$executeRawUnsafe/u);
 assert.match(source,/COLLATE product\.measurement_label_ci/u);assert.doesNotMatch(source,/toLowerCase\(|normalize\(/u);
});

test("maximum complete sets persist atomically and older exact stored spellings survive later recordings",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),name="e\u0301paule",input=create({unit:"in",entries:Array.from({length:50},(_,i)=>({name:i===0?name:"Label "+i,value:"01.20"}))});
 const first=(await f.service.execute(h,input)).version;assert.equal(first.entries.length,50);assert.equal(first.entries.find(e=>e.name===name).value,"1.2");assert.equal(first.unit,"in");
 await f.service.execute(h,create());const saved=(await f.service.execute(h,{operation:"get",clientId:ids.a,id:input.id})).version;
 assert.deepEqual(saved,first);assert.ok(saved.entries.some(e=>e.name===name));assert.equal(f.rows().measurementVersions.length,2);
}));
test("incomplete or oversized out-of-band history fails safely rather than returning truncated measurements",async()=>development(async()=>{
 for(const count of [0,51]){
  const f=await fixture(),h=await f.login(),saved=(await f.service.execute(h,create())).version;
  f.rows().measurementEntries=Array.from({length:count},(_,i)=>({measurementVersionId:saved.id,name:"Historical "+i,value:"1"}));
  for(const body of [{operation:"get",id:saved.id,clientId:ids.a},{operation:"list",clientId:ids.a}]){
   const r=await f.call({headers:h,body});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"measurement_unavailable"});
  }
  assert.equal(f.rows().measurementEntries.length,count);
 }
}));

test("DOUBLE a failed concurrent submission does not consume the next committed client version",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();f.setFailure("entry_partial_once");
 const results=await Promise.allSettled([f.service.execute(h,create()),f.service.execute(h,create())]);
 // Concurrent callers need not finish session lookup in their invocation order.
 assert.equal(results.filter(r=>r.status==="rejected").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.code,"unavailable");
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="fulfilled").value.version.versionNumber,1);
 assert.equal(f.rows().measurementVersions.length,1);assert.equal(f.rows().measurementEntries.length,1);
}));

test("labels accept flexible wording and SQL whitespace, preserve contents, and reject NUL before database work",async()=>development(async()=>{
 const parse=name=>measurementRequestSchema.safeParse(create({entries:[{name,value:"1"}]}));
 for(const name of ["A","Waist (Round)","Agbada Width","e\u0301paule","\u00c9paule","Waist\u0085(Round)"]){
  const result=parse(name);assert.equal(result.success,true);assert.equal(result.data.entries[0].name,name);
 }
 // Read the existing CHECK's trim set independently. U+0085 is additionally in its blank set.
 const sql=readFileSync(new URL("../../prisma/product/migrations/20261108_measurement_history/migration.sql",import.meta.url),"utf8");
 const trim=sql.match(/btrim\("name", U&'([^']+)'\)/u)[1];
 const whitespace=[...trim.matchAll(/\\([0-9A-Fa-f]{4})/gu)].map(m=>String.fromCodePoint(parseInt(m[1],16)));
 whitespace.push("\u0085");assert.ok(whitespace.length>=26);
 for(const space of whitespace){
  assert.equal(parse(space+"Waist (Round)"+space).data.entries[0].name,"Waist (Round)");
  assert.equal(parse(space).success,false);
 }
 const maximum="\u{1f9f5}".repeat(60);assert.equal(parse("\u0085"+maximum+"\u00a0").data.entries[0].name,maximum);assert.equal(parse(maximum+"A").success,false);
 const f=await fixture(),h=await f.login();
 for(const name of ["A\u0000B","\u0000"," \u0000 ",""," \u0085\u00a0 "]){
  assert.equal(parse(name).success,false);
  const body=create({entries:[{name,value:"1"}]});
  await assert.rejects(f.service.execute(h,body),e=>e.code==="invalid_input");
  const r=await f.call({headers:h,body});assert.equal(r.status,422);assert.deepEqual(await r.json(),{error:"validation_failed"});
 }
 assert.equal(f.allocations(),0);assert.equal(f.clientLocks.length,0);assert.equal(f.rows().measurementVersions.length,0);
}));
test("list/get use scoped Client reads while create retains exclusive User-to-Client locking",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create(),saved=await f.service.execute(h,input);
 assert.deepEqual(f.clientLocks,[{id:ids.a,businessId:"business-a"}]);assert.deepEqual(f.clientReads,[]);
 const before=f.events.length;
 assert.equal((await f.service.execute(h,{operation:"list",clientId:ids.a})).versions.length,1);
 assert.deepEqual(await f.service.execute(h,{operation:"get",clientId:ids.a,id:input.id}),saved);
 assert.deepEqual(f.clientLocks,[{id:ids.a,businessId:"business-a"}]);
 assert.deepEqual(f.clientReads,[{id:ids.a,businessId:"business-a"},{id:ids.a,businessId:"business-a"}]);
 assert.equal(f.events.slice(before).includes("client.lock"),false);
 for(const kind of ["client.lookup","client.lock"])assert.ok(f.events.indexOf(kind)>f.events.indexOf("user.lock"));
 f.setFailure("client_read");for(const body of [{operation:"list",clientId:ids.a},{operation:"get",clientId:ids.a,id:input.id}]){
  const r=await f.call({headers:h,body});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"measurement_unavailable"});
 }
 assert.equal(f.rows().measurementVersions.length,1);
}));
