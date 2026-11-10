// Real auth/crypto/transport with persistence and socket doubles. No PostgreSQL or listener.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {IncomingMessage} from "node:http";
import {randomUUID,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {clientRequestSchema,clientRecordPath,clientSingleReplySchema,clientListReplySchema} from "../../lib/client-record-contract.ts";
const {createClientRecordService}=await import("../../lib/product-auth/client-records.server.ts");
const {createLocalClientRecordDispatcher}=await import("../../lib/product-auth/client-records-http.server.ts");
const {createNextClientRecordHandler}=await import("../../lib/product-auth/registration-next.server.ts");
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const {Prisma}=await import("../../prisma/product/generated/client.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const origin="http://127.0.0.1:3000",password=" Offline client fixture password ",hash=await hashPassword(password),key=Buffer.alloc(32,9);
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",ENABLE_LOCAL_AUTH_FRONTEND:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-client-signing-secret-not-real",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
const create=(patch={})=>({operation:"create",id:randomUUID(),fullName:" Synthetic client ",...patch});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No external network permitted");test.after(()=>{globalThis.fetch=originalFetch;});
async function fixture(){
 const f=fakeProduct({sessionAccess:true});f.rows().business=[];f.rows().businessMember=[];f.rows().clients=[];
 let failure=null,budget="allow",tail=Promise.resolve(),time=Date.parse("2026-11-07T12:00:00.000Z");const buckets=[],queries=[];
 const pick=(row,select)=>row?structuredClone(Object.fromEntries(Object.keys(select).map(k=>[k,row[k]]))):null;
 for(const suffix of ["a","b"]){const id="tailor-"+suffix;
  await f.client.user.create({data:{id,name:id,email:id+"@example.invalid",emailVerified:true}});
  await f.client.account.create({data:{id:id+"-password",accountId:id,userId:id,providerId:"credential",password:hash}});
  f.rows().business.push({id:"business-"+suffix,primaryOwnerUserId:id,name:"Studio "+suffix,timeZone:"Africa/Lagos"});
  f.rows().businessMember.push({businessId:"business-"+suffix,userId:id});
 }
 f.client.business={findUnique:async({where,select})=>{assert.ok(f.inTransaction());if(failure==="business_read")throw Error("private business storage error");return pick(f.rows().business.find(b=>b.primaryOwnerUserId===where.primaryOwnerUserId),select);}};
 f.client.businessMember={findUnique:async({where,select})=>{const w=where.businessId_userId;return pick(f.rows().businessMember.find(m=>m.businessId===w.businessId&&m.userId===w.userId),select);}};
 const matches=(row,where)=>Object.entries(where).every(([k,v])=>k==="OR"?v.some(w=>matches(row,w)):v instanceof Date?row[k].getTime()===v.getTime():v&&typeof v==="object"&&"gt" in v?row[k]>v.gt:row[k]===v);
 const scope=where=>{assert.ok(f.inTransaction());assert.ok(f.events.includes("user.lock"));assert.ok(["business-a","business-b"].includes(where.businessId));queries.push(structuredClone(where));if(failure==="client_read")throw Error("private client read error");};
 f.client.client={
  async findFirst({where,select}){scope(where);return pick(f.rows().clients.find(r=>matches(r,where)),select);},
  async findMany({where,orderBy,take,select}){scope(where);assert.deepEqual(orderBy,[{createdAt:"asc"},{id:"asc"}]);assert.ok(take>=2&&take<=51);
   return f.rows().clients.filter(r=>matches(r,where)).toSorted((a,b)=>a.createdAt-b.createdAt||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,take).map(r=>pick(r,select));},
  async create({data,select}){scope({businessId:data.businessId});if(failure==="create")throw Error("private insert error");
   if(f.rows().clients.some(r=>r.id===data.id))throw new Prisma.PrismaClientKnownRequestError("private collision",{code:"P2002",clientVersion:"offline"});
   const row={...data,createdAt:new Date(time),updatedAt:new Date(time)};f.rows().clients.push(row);f.events.push("client.create");return pick(row,select);},
  async update({where,data,select}){scope(where);assert.deepEqual(Object.keys(where).sort(),["businessId","id"]);assert.ok(Object.keys(data).every(k=>["fullName","phone","email"].includes(k)));
   if(failure==="update")throw Error("private update permission error");const row=f.rows().clients.find(r=>matches(r,where));assert.ok(row);Object.assign(row,data,{updatedAt:new Date(++time)});f.events.push("client.update");return pick(row,select);},
 };
 const query=f.client.$queryRaw,transaction=f.client.$transaction;
 f.client.$queryRaw=async(parts,...values)=>{
  if(parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')){buckets.push(values[0]);if(budget==="failure")throw Error("private rate storage error");if(budget==="malformed")return [{allowed:true}];
   return [{allowed:budget!=="deny"&&!(budget==="account"&&buckets.length%3===0),retryAfterSeconds:5}];}
  return query(parts,...values);
 };
 f.client.$transaction=(callback,options)=>{const task=tail.then(async()=>{const result=await transaction(async tx=>{const value=await callback(tx);if(failure==="commit")throw Error("private commit failure");return value;},options);if(failure==="uncertain")throw Error("private lost commit acknowledgement");return result;});tail=task.catch(()=>{});return task;};
 const sessions=createSessionService(f.client,{mode:"test",origin,authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY,"base64"),expiresInSeconds:604800,renewal:"none"});
 const login=async(id="tailor-a")=>{const result=await sessions.login({email:id+"@example.invalid",password});return new Headers({cookie:result.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});};
 const service=createClientRecordService(f.client,sessions);
 async function call({headers,body={operation:"list"},method="POST",extra={},rawHeaders,settings=env,peer="127.0.0.1",path=clientRecordPath}={}){
  const socket=new Socket();for(const [k,v]of Object.entries({remoteAddress:peer,localAddress:"127.0.0.1",localPort:3000}))Object.defineProperty(socket,k,{value:v});
  const request=new IncomingMessage(socket);request.method=method;request.url=path;request.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3000",origin,"content-type":"application/json",...(headers?.get("cookie")?{cookie:headers.get("cookie")}:{}),...extra}).flat();
  request.headers={"x-forwarded-for":"untrusted",businessId:"business-b"};request.push(typeof body==="string"?body:JSON.stringify(body));request.push(null);
  const replyHeaders=new Headers();let bytes;
  const outgoing={statusCode:200,destroyed:false,writableEnded:false,setHeader:(k,v)=>{if(Array.isArray(v))for(const item of v)replyHeaders.append(k,item);else replyHeaders.set(k,v);},end:value=>{bytes=value;}};
  try{await createNextClientRecordHandler({environment:()=>settings,runtime:async e=>createLocalClientRecordDispatcher(f.client,e,key)})(request,outgoing);return new Response(bytes,{status:outgoing.statusCode,headers:replyHeaders});}
  finally{request.destroy();socket.destroy();}
 }
 return {...f,service,sessions,login,call,buckets,queries,setFailure:v=>{failure=v;},setBudget:v=>{budget=v;}};
}
test("strict Client contract trims names, counts Unicode and validates optional contact normalization",()=>{
 const input=create();assert.deepEqual(clientRequestSchema.parse(input),{...input,fullName:input.fullName.trim(),phone:null,email:null});
 for(const value of ["A","\u{1f9f5}".repeat(120)])assert.equal(clientRequestSchema.parse(create({fullName:value})).fullName,value);
 for(const value of [""," \u00a0","\u0085","\u{1f9f5}".repeat(121),"\ud800"])assert.equal(clientRequestSchema.safeParse(create({fullName:value})).success,false);
 for(const phone of [null,undefined,""," \u00a0 ","1234567","123456789012345"," +234 (803) 123-4567 ","1234567"+"-".repeat(25)])assert.ok(clientRequestSchema.safeParse(create({phone})).success);
 for(const phone of ["123456","1234567890123456","1234567"+"-".repeat(26),"123a4567","123\t4567","\uff11\uff12\uff13\uff14\uff15\uff16\uff17","123+4567",true])assert.equal(clientRequestSchema.safeParse(create({phone})).success,false);
 assert.equal(clientRequestSchema.parse(create({email:" Mixed@EXAMPLE.INVALID "})).email,"mixed@example.invalid");
 for(const email of [null,undefined,""," \u00a0 "])assert.equal(clientRequestSchema.parse(create({email})).email,null);
 assert.ok(clientRequestSchema.parse(create({email:"a".repeat(300)+"@example.invalid"})).email.length>254);
 for(const email of ["invalid","\u00f3la@example.invalid",true])assert.equal(clientRequestSchema.safeParse(create({email})).success,false);
 const update=clientRequestSchema.parse({operation:"update",id:input.id,fullName:"Edited"});assert.equal("phone" in update,false);assert.equal("email" in update,false);
 for(const extra of [{businessId:"business-b"},{ownerId:"tailor-b"},{userId:"tailor-b"},{role:"administrator"},{createdAt:"2026-01-01T00:00:00.000Z"},{updatedAt:"2026-01-01T00:00:00.000Z"},{password:"private"}])assert.equal(clientRequestSchema.safeParse({...input,...extra}).success,false);
 assert.equal(clientRequestSchema.safeParse({operation:"update",id:input.id}).success,false);
});
test("create derives ownership, stores normalized values and returns only the minimal typed record",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),count=f.rows().session.length;
 const saved=await f.service.execute(h,create({phone:" +234 803 123 4567 ",email:" Mixed@EXAMPLE.INVALID "}));assert.ok(clientSingleReplySchema.safeParse(saved).success);
 assert.deepEqual(Object.keys(saved.client).sort(),["id","fullName","phone","email","createdAt","updatedAt"].sort());
 assert.equal(f.rows().clients[0].businessId,"business-a");assert.equal(saved.client.fullName,"Synthetic client");assert.equal(saved.client.phone,"+234 803 123 4567");assert.equal(saved.client.email,"mixed@example.invalid");assert.equal(f.rows().session.length,count);
 assert.ok(f.events.indexOf("user.lock")<f.events.indexOf("client.create"));
}));
test("list/get/update are scoped; another business and an administrator receive the same not-found as missing",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),saved=(await f.service.execute(a,create())).client;
 f.rows().user[1].isAdministrator=true;f.rows().businessMember.push({businessId:"business-a",userId:"tailor-b"});
 assert.deepEqual(await f.service.execute(b,{operation:"list"}),{clients:[],nextCursor:null});
 for(const operation of ["get","update"]){const response=[];for(const id of [saved.id,randomUUID()]){const r=await f.call({headers:b,body:{operation,id,...(operation==="update"?{fullName:"Forged"}:{})}});response.push({status:r.status,body:await r.json()});}assert.deepEqual(response,[{status:404,body:{error:"client_not_found"}},{status:404,body:{error:"client_not_found"}}]);}
 assert.equal((await f.service.execute(a,{operation:"get",id:saved.id})).client.id,saved.id);assert.equal(f.rows().clients[0].fullName,saved.fullName);
 assert.equal(f.queries.every(q=>["business-a","business-b"].includes(q.businessId)),true);
}));
test("update preserves omitted fields and immutable identity; null and blank contacts explicitly clear",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),saved=(await f.service.execute(h,create({phone:"1234567",email:"first@example.invalid"}))).client;
 const name=(await f.service.execute(h,{operation:"update",id:saved.id,fullName:" New name "})).client;
 assert.equal(name.fullName,"New name");assert.equal(name.phone,saved.phone);assert.equal(name.email,saved.email);assert.equal(name.createdAt,saved.createdAt);assert.equal(name.id,saved.id);assert.equal(f.rows().clients[0].businessId,"business-a");
 const cleared=(await f.service.execute(h,{operation:"update",id:saved.id,phone:"  ",email:null})).client;assert.equal(cleared.phone,null);assert.equal(cleared.email,null);assert.equal(cleared.fullName,"New name");
}));
test("missing onboarding is distinct from unavailable schema and a successful empty client list",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();assert.deepEqual(await f.service.execute(h,{operation:"list"}),{clients:[],nextCursor:null});
 f.rows().business=f.rows().business.filter(b=>b.primaryOwnerUserId!=="tailor-a");let r=await f.call({headers:h});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"business_required"});
 f.setFailure("business_read");r=await f.call({headers:h});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"client_unavailable"});
}));
test("all operations revalidate active verified credential owners, account locks and sessions under the User lock",async()=>development(async()=>{
 for(const kind of ["disabled","deletion","unverified","passwordless","revoked","expired","membership"]){
  const f=await fixture(),h=await f.login();let changed=false;
  const sessions={...f.sessions,lookup:async headers=>{const result=await f.sessions.lookup(headers);if(!changed){changed=true;const user=f.rows().user[0];if(kind==="disabled")user.disabledAt=new Date();if(kind==="deletion")user.deletionRequestedAt=new Date();if(kind==="unverified")user.emailVerified=false;if(kind==="passwordless")f.rows().account=f.rows().account.filter(a=>a.userId!==user.id);if(kind==="revoked")f.rows().session=[];if(kind==="expired")f.rows().session[0].expiresAt=new Date(0);if(kind==="membership")f.rows().businessMember=[];}return result;}};
  const service=createClientRecordService(f.client,sessions);
  for(const input of [{operation:"list"},{operation:"get",id:randomUUID()},{operation:"update",id:randomUUID(),fullName:"Changed"},create()])
   await assert.rejects(service.execute(h,input),e=>e.code===(kind==="membership"?"unavailable":"unauthenticated"),kind);
  assert.equal(f.rows().clients.length,0);
 }
 const f=await fixture();assert.equal((await f.call()).status,401);
}));
test("same UUID and normalized details are idempotent; conflicting details and other-business UUIDs never overwrite",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),input=create({email:" One@EXAMPLE.INVALID "});
 const first=await f.service.execute(a,input);assert.deepEqual(await f.service.execute(a,{...input,fullName:input.fullName.trim(),email:"one@example.invalid"}),first);assert.equal(f.rows().clients.length,1);
 for(const [h,body]of [[a,{...input,fullName:"Different"}],[b,input]]){const r=await f.call({headers:h,body});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"client_conflict"});}
 assert.equal(f.rows().clients.length,1);assert.equal(f.rows().clients[0].businessId,"business-a");
 const other=await f.service.execute(a,{...input,id:randomUUID()});assert.notEqual(other.client.id,first.client.id);await f.service.execute(b,{...input,id:randomUUID()});assert.equal(f.rows().clients.length,3);
}));
test("DOUBLE: concurrent creates serialize without duplicate rows, conflicting overwrites or dropped ownership",async()=>development(async()=>{
 for(const conflict of [false,true]){const f=await fixture(),h=await f.login(),input=create(),results=await Promise.allSettled([f.service.execute(h,input),f.service.execute(h,{...input,...(conflict?{fullName:"Other"}:{})})]);
  assert.equal(f.rows().clients.length,1);assert.equal(results[0].status,"fulfilled");assert.equal(results[1].status,conflict?"rejected":"fulfilled");if(conflict)assert.equal(results[1].reason.code,"conflict");else assert.equal(results[0].value.client.id,results[1].value.client.id);
 }
}));
test("failed writes roll back and uncertain commit stays unavailable; get/retry with the original UUID reconciles safely",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create();
 for(const failure of ["create","commit"]){f.setFailure(failure);const r=await f.call({headers:h,body:input});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"client_unavailable"});assert.equal(f.rows().clients.length,0);}
 f.setFailure("uncertain");assert.equal((await f.call({headers:h,body:input})).status,503);assert.equal(f.rows().clients.length,1);
 f.setFailure(null);const saved=(await f.service.execute(h,{operation:"get",id:input.id})).client;assert.equal(saved.id,input.id);assert.equal((await f.service.execute(h,input)).client.id,saved.id);assert.equal(f.rows().clients.length,1);
 const before=structuredClone(f.rows().clients);for(const failure of ["update","commit"]){f.setFailure(failure);await assert.rejects(f.service.execute(h,{operation:"update",id:input.id,phone:"1234567"}),e=>e.code==="unavailable");assert.deepEqual(f.rows().clients,before);}
}));
test("cursor pagination is bounded/deterministic, handles timestamp ties, and cannot cross business boundaries",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),ids=[];
 for(let i=0;i<5;i++)ids.push((await f.service.execute(a,create())).client.id);await f.service.execute(b,create());
 const seen=[];let cursor;do{const reply=await f.service.execute(a,{operation:"list",limit:2,...(cursor?{cursor}:{})});assert.ok(clientListReplySchema.safeParse(reply).success);assert.ok(reply.clients.length<=2);seen.push(...reply.clients.map(c=>c.id));cursor=reply.nextCursor;}while(cursor);
 assert.deepEqual(seen,ids.toSorted());assert.equal(new Set(seen).size,5);
 for(const limit of [0,51,-1,1.5,"2"])assert.equal(clientRequestSchema.safeParse({operation:"list",limit}).success,false);
 for(const cursor of [{id:randomUUID(),createdAt:"invalid"},{id:"forged",createdAt:"2026-11-07T00:00:00.000Z"}])assert.equal(clientRequestSchema.safeParse({operation:"list",cursor}).success,false);
 const page=await f.service.execute(b,{operation:"list",cursor:{createdAt:"2026-11-07T11:00:00.000Z",id:ids[0]}});assert.equal(page.clients.length,1);assert.ok(!ids.includes(page.clients[0].id));
}));
test("actual Node handler enforces raw socket/Origin/framing/body/default-off boundaries without trusting Next headers",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();assert.deepEqual(await(await f.call({headers:h})).json(),{clients:[],nextCursor:null});
 for(const extra of [{origin:"https://outside.invalid"},{"x-forwarded-for":"127.0.0.1"},{"sec-fetch-site":"cross-site"}])assert.equal((await f.call({headers:h,extra})).status,403);
 assert.equal((await f.call({headers:h,rawHeaders:["host","127.0.0.1:3000","Host","127.0.0.1:3000"]})).status,400);
 assert.equal((await f.call({headers:h,peer:"192.0.2.1"})).status,404);assert.equal((await f.call({headers:h,method:"GET"})).status,405);assert.equal((await f.call({headers:h,path:clientRecordPath+"?businessId=business-b"})).status,404);
 assert.equal((await f.call({headers:h,body:"x".repeat(16385)})).status,413);assert.equal((await f.call({headers:h,body:"{"})).status,400);
 for(const patch of [{ENABLE_PRODUCT_SESSION_HTTP:undefined},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"}])assert.ok([404,503].includes((await f.call({headers:h,settings:{...env,...patch}})).status));
 const forged=await f.call({headers:h,body:create({businessId:"business-b"})});assert.equal(forged.status,422);assert.deepEqual(await forged.json(),{error:"validation_failed"});assert.equal(f.rows().clients.length,0);
 assert.match(readFileSync(new URL("../../pages/api/internal/tailor-clients.ts",import.meta.url),"utf8"),/bodyParser:false/u);
}));
test("shared rate limits fail closed with numeric Retry-After and independent Client/authentication keys",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.call({headers:h});await f.call({headers:h,body:create()});
 assert.ok(new Set(f.buckets).size>=4);
 const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID).login;
 const loginDigest="rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1","login",policy.version,"account","tailor-a@example.invalid"])).digest("hex");assert.ok(!f.buckets.includes(loginDigest));
 for(const budget of ["deny","failure","malformed"]){f.setBudget(budget);const r=await f.call({headers:h});assert.equal(r.status,budget==="deny"?429:503);if(budget==="deny")assert.match(r.headers.get("retry-after"),/^[1-9][0-9]*$/u);else assert.deepEqual(await r.json(),{error:"client_unavailable"});}
 const account=await fixture(),headers=await account.login();account.setBudget("account");const r=await account.call({headers,body:create()});assert.equal(r.status,429);assert.match(r.headers.get("retry-after"),/^[1-9][0-9]*$/u);assert.equal(account.rows().clients.length,0);
}));


test("the mounted handler completes create/list/get/update with strict typed responses and no new session",async()=>development(async()=>{
 const f=await fixture(),headers=await f.login(),sessions=f.rows().session.length,input=create();
 const created=await f.call({headers,body:input});assert.equal(created.status,200);assert.equal(created.headers.has("set-cookie"),false);assert.equal(created.headers.get("cache-control"),"no-store");
 const original=clientSingleReplySchema.parse(await created.json()).client;
 const listed=await f.call({headers,body:{operation:"list",limit:1}});assert.equal(listed.status,200);assert.deepEqual(clientListReplySchema.parse(await listed.json()).clients,[original]);
 const got=await f.call({headers,body:{operation:"get",id:original.id}});assert.equal(got.status,200);assert.deepEqual(clientSingleReplySchema.parse(await got.json()).client,original);
 const updated=await f.call({headers,body:{operation:"update",id:original.id,email:" Updated@EXAMPLE.INVALID ",phone:""}});assert.equal(updated.status,200);
 const record=clientSingleReplySchema.parse(await updated.json()).client;assert.equal(record.email,"updated@example.invalid");assert.equal(record.phone,null);assert.equal(record.fullName,original.fullName);assert.equal(record.id,original.id);assert.equal(record.createdAt,original.createdAt);assert.equal(f.rows().session.length,sessions);
 for(const operation of ["list","get","create","update"]){const body=operation==="list"?{operation}:{operation,id:randomUUID(),...(operation==="create"||operation==="update"?{fullName:"Synthetic"}:{})};
  for(const extra of [{businessId:"business-b"},{isAdministrator:true},{updatedAt:"2026-11-07T00:00:00.000Z"}])assert.equal((await f.call({headers,body:{...body,...extra}})).status,422);
 }
}));
