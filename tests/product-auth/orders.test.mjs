// Actual auth, crypto and raw Node transport with the existing transaction double. No DB/listener.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {IncomingMessage} from "node:http";
import {randomUUID,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {orderPath,orderRequestSchema,orderSingleReplySchema,orderListReplySchema,ORDER_BODY_LIMIT} from "../../lib/order-contract.ts";
const {createOrderService}=await import("../../lib/product-auth/orders.server.ts");
const {createLocalOrderDispatcher}=await import("../../lib/product-auth/orders-http.server.ts");
const {createNextOrderHandler}=await import("../../lib/product-auth/registration-next.server.ts");
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const {Prisma}=await import("../../prisma/product/generated/client.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const {decodeAuthRequest}=await import("../../lib/auth/request.server.ts");
const origin="http://127.0.0.1:3000",password=" Offline Orders fixture password ",hash=await hashPassword(password),key=Buffer.alloc(32,9);
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",ENABLE_LOCAL_AUTH_FRONTEND:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-order-signing-secret-not-real",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const ids={a:randomUUID(),a2:randomUUID(),b:randomUUID(),ma:randomUUID(),ma2:randomUUID(),mb:randomUUID()};
const create=(patch={})=>({operation:"create",id:randomUUID(),clientId:ids.a,items:[{id:randomUUID(),description:" Agbada with inside pocket "}],...patch});
const known=(code="P2002")=>new Prisma.PrismaClientKnownRequestError("PRIVATE storage data",{code,clientVersion:"offline"});
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No external network");test.after(()=>{globalThis.fetch=originalFetch;});
async function fixture(){
 const f=fakeProduct({sessionAccess:true});Object.assign(f.rows(),{business:[],businessMember:[],clients:[],measurementVersions:[],orders:[],orderItems:[]});
 let failure=null,budget="allow",tail=Promise.resolve(),time=new Date("2026-11-09T12:00:00.000Z");const buckets=[],scopes=[],locks=[],versionQueries=[],updates=[];
 const pick=(row,select)=>row?structuredClone(Object.fromEntries(Object.keys(select).map(k=>[k,row[k]]))):null;
 for(const s of ["a","b"]){const id="tailor-"+s;await f.client.user.create({data:{id,name:id,email:id+"@example.invalid",emailVerified:true}});await f.client.account.create({data:{id:id+"-password",accountId:id,userId:id,providerId:"credential",password:hash}});f.rows().business.push({id:"business-"+s,primaryOwnerUserId:id,name:"Studio "+s,timeZone:"Africa/Lagos"});f.rows().businessMember.push({businessId:"business-"+s,userId:id});}
 for(const id of [ids.a,ids.a2,ids.b])f.rows().clients.push({id,businessId:id===ids.b?"business-b":"business-a"});
 for(const [id,clientId]of [[ids.ma,ids.a],[ids.ma2,ids.a2],[ids.mb,ids.b]])f.rows().measurementVersions.push({id,clientId,businessId:clientId===ids.b?"business-b":"business-a",versionNumber:1,unit:"cm"});
 f.client.business={findUnique:async({where,select})=>{assert.ok(f.inTransaction());if(failure==="business")throw Error("PRIVATE");return pick(f.rows().business.find(b=>b.primaryOwnerUserId===where.primaryOwnerUserId),select);}};
 f.client.businessMember={findUnique:async({where,select})=>{const w=where.businessId_userId;return pick(f.rows().businessMember.find(m=>m.businessId===w.businessId&&m.userId===w.userId),select);}};
 const matches=(row,where)=>Object.entries(where).every(([k,v])=>k==="OR"?v.some(w=>matches(row,w)):v instanceof Date?row[k].getTime()===v.getTime():v&&typeof v==="object"?"in" in v?v.in.includes(row[k]):row[k]<v.lt:row[k]===v);
 const scope=where=>{assert.ok(f.inTransaction());assert.ok(f.events.lastIndexOf("user.lock")>f.events.lastIndexOf("outer.begin"));assert.ok(["business-a","business-b"].includes(where.businessId));scopes.push(structuredClone(where));if(failure==="read")throw Error("PRIVATE read");};
 const record=(row,select)=>row?{...pick(row,Object.fromEntries(Object.entries(select).filter(([k])=>k!=="items"))),...(select.items?{items:f.rows().orderItems.filter(i=>i.orderId===row.id).toSorted((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,select.items.take).map(i=>pick(i,select.items.select))}:{})}:null;
 f.client.order={
  async findFirst({where,select}){scope(where);assert.deepEqual(Object.keys(where).sort(),["businessId","id"]);assert.equal(select.items.take,51);return record(f.rows().orders.find(r=>matches(r,where)),select);},
  async findMany({where,orderBy,take,select}){scope(where);assert.deepEqual(orderBy,[{createdAt:"desc"},{id:"desc"}]);assert.ok(take>=2&&take<=51);assert.equal(select.items,undefined);return f.rows().orders.filter(r=>matches(r,where)).toSorted((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?1:a.id>b.id?-1:0)).slice(0,take).map(r=>record(r,select));},
  async create({data,select}){scope({businessId:data.businessId});assert.ok(locks.some(l=>l.id===data.clientId&&l.businessId===data.businessId));assert.deepEqual(select,{id:true});assert.deepEqual(Object.keys(data).sort(),["id","businessId","clientId","createdAt","updatedAt"].sort());assert.equal(data.createdAt.getTime(),time.getTime());assert.equal(data.updatedAt.getTime(),time.getTime());
   if(f.rows().orders.some(r=>r.id===data.id))throw known();if(failure==="order_insert")throw Error("PRIVATE insert");f.rows().orders.push(structuredClone(data));f.events.push("order.create");return {id:data.id};},
 };
 f.client.orderItem={async updateMany({where,data}){
  assert.ok(f.inTransaction());scope({businessId:where.order.businessId});assert.deepEqual(Object.keys(where).sort(),["id","orderId","clientId","order","updatedAt"].sort());assert.deepEqual(Object.keys(data).sort(),["description","measurementVersionId","updatedAt"].sort());
  assert.ok(where.updatedAt instanceof Date&&data.updatedAt instanceof Date);assert.ok(data.updatedAt>where.updatedAt);updates.push(structuredClone({where,data}));
  const item=f.rows().orderItems.find(i=>i.id===where.id&&i.orderId===where.orderId&&i.clientId===where.clientId&&i.updatedAt.getTime()===where.updatedAt.getTime()&&f.rows().orders.some(o=>o.id===i.orderId&&o.businessId===where.order.businessId));
  if(failure==="update_permission")throw known("P2010");if(failure==="update_zero"||!item)return {count:0};
  Object.assign(item,structuredClone(data));f.events.push("item.update");if(failure==="update_partial")throw Error("PRIVATE failed update");if(failure==="update_corrupt")item.description="PRIVATE corrupt readback";
  return {count:failure==="update_count"?2:1};
 },async createMany({data}){assert.ok(f.inTransaction());assert.ok(data.length>=1&&data.length<=50);for(const i of data){assert.deepEqual(Object.keys(i).sort(),["id","orderId","clientId","description","measurementVersionId","createdAt","updatedAt"].sort());assert.ok(f.rows().orders.some(o=>o.id===i.orderId&&o.clientId===i.clientId));assert.equal(i.updatedAt.getTime(),time.getTime());if(f.rows().orderItems.some(r=>r.id===i.id))throw known();f.rows().orderItems.push(structuredClone(i));if(failure==="item_partial"||failure==="item_partial_once"){if(failure==="item_partial_once")failure=null;throw Error("PRIVATE partial insert");}}
  f.events.push("order.items");return {count:failure==="item_count"?0:data.length};}};
 f.client.measurementVersion={async findMany({where,select,take}){scope(where);assert.equal(select.id,true);assert.ok([1,50].includes(take));assert.ok(Array.isArray(where.id.in)&&where.id.in.length<=take);versionQueries.push(structuredClone(where));if(failure==="versions")throw Error("PRIVATE versions");return f.rows().measurementVersions.filter(r=>matches(r,where)).map(r=>pick(r,select));}};
 const query=f.client.$queryRaw,transaction=f.client.$transaction;
 const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID),accountKeys=["order-read","order-write"].map(operation=>"rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1",operation,(operation==="order-read"?policy.session.version:policy.login.version)+"-ord","account","tailor-a@example.invalid"])).digest("hex"));
 f.client.$queryRaw=async(parts,...values)=>{const sql=parts.join("?");
  if(sql.includes('INSERT INTO "product"."AuthRateBucket"')){buckets.push(values[0]);if(budget==="failure")throw Error("PRIVATE rate");if(budget==="malformed")return [{allowed:true}];return [{allowed:budget!=="deny"&&budget!=="key:"+values[0]&&!(budget==="account"&&accountKeys.includes(values[0])),retryAfterSeconds:5}];}
  if(sql.includes('FROM product."Client"')){assert.match(sql,/FOR UPDATE/u);assert.ok(f.inTransaction());assert.ok(f.events.lastIndexOf("user.lock")>f.events.lastIndexOf("outer.begin"));if(failure==="client_lock")throw Error("PRIVATE lock");locks.push({id:values[0],businessId:values[1]});f.events.push("client.lock");return f.rows().clients.filter(r=>r.id===values[0]&&r.businessId===values[1]).map(r=>({id:r.id}));}
  if(sql.includes('transaction_timestamp()')){assert.ok(f.inTransaction());return failure==="clock"?[{time:"invalid"}]:[{time:new Date(time)}];}
  return query(parts,...values);
 };
 f.client.$transaction=(callback,options)=>{const task=tail.then(async()=>{const r=await transaction(async tx=>{const value=await callback(tx);if(failure==="commit")throw Error("PRIVATE commit");return value;},options);if(failure==="uncertain")throw Error("PRIVATE lost acknowledgement");return r;});tail=task.catch(()=>{});return task;};
 const sessions=createSessionService(f.client,{mode:"test",origin,authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY,"base64"),expiresInSeconds:604800,renewal:"none"});
 const login=async(id="tailor-a")=>{const result=await sessions.login({email:id+"@example.invalid",password});return new Headers({cookie:result.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});};
 const service=createOrderService(f.client,sessions);
 async function call({headers,body={operation:"list"},method="POST",extra={},rawHeaders,settings=env,peer="127.0.0.1",path=orderPath}={}){
  const socket=new Socket();for(const [k,v]of Object.entries({remoteAddress:peer,localAddress:"127.0.0.1",localPort:3000}))Object.defineProperty(socket,k,{value:v});
  const request=new IncomingMessage(socket);request.method=method;request.url=path;request.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3000",origin,"content-type":"application/json",...(headers?.get("cookie")?{cookie:headers.get("cookie")}:{}),...extra}).flat();request.headers={businessId:"business-b","x-forwarded-for":"untrusted"};request.push(typeof body==="string"?body:JSON.stringify(body));request.push(null);
  const replyHeaders=new Headers();let bytes;const outgoing={statusCode:200,destroyed:false,writableEnded:false,setHeader:(k,v)=>{if(Array.isArray(v))for(const item of v)replyHeaders.append(k,item);else replyHeaders.set(k,v);},end:value=>{bytes=value;}};
  try{await createNextOrderHandler({environment:()=>settings,runtime:async e=>createLocalOrderDispatcher(f.client,e,key)})(request,outgoing);return new Response(bytes,{status:outgoing.statusCode,headers:replyHeaders});}finally{request.destroy();socket.destroy();}
 }
 return {...f,service,sessions,login,call,buckets,scopes,locks,versionQueries,updates,setFailure:v=>{failure=v;},setBudget:v=>{budget=v;},setTime:v=>{time=new Date(v);}};
}
test("strict create contract requires 1-50 distinct stable item IDs and flexible trimmed Unicode descriptions",()=>{
 const input=create();assert.equal(orderRequestSchema.parse(input).items[0].measurementVersionId,null);
 for(const text of ["A","Agbada Width","Two-piece outfit (lining)","\u{1f9f5}".repeat(500),"\u0085 description\u00a0\ufeff"]){const p=orderRequestSchema.parse(create({items:[{id:randomUUID(),description:text}]}));assert.equal(p.items[0].description,text.replace(/^[\s\p{White_Space}]+|[\s\p{White_Space}]+$/gu,""));}
 for(const text of [""," \u0085 ","\u{1f9f5}".repeat(501),"A\u0000B","\ud800"] )assert.equal(orderRequestSchema.safeParse(create({items:[{id:randomUUID(),description:text}]})).success,false);
 for(const count of [0,51])assert.equal(orderRequestSchema.safeParse(create({items:Array.from({length:count},()=>({id:randomUUID(),description:"A"}))})).success,false);
 const item={id:randomUUID(),description:"A"};assert.equal(orderRequestSchema.safeParse(create({items:[item,item]})).success,false);
 for(const patch of [{id:"invalid"},{clientId:"invalid"},{items:[{description:"A"}]},{items:[{...item,measurementVersionId:"invalid"}]}])assert.equal(orderRequestSchema.safeParse(create(patch)).success,false);
});
test("requests reject forged ownership, timestamps, workflow fields and unsupported operations",()=>{
 for(const body of [create(),{operation:"list"},{operation:"get",id:randomUUID()}])for(const patch of [{businessId:"forged"},{ownerId:"forged"},{role:"administrator"},{createdAt:"2026-11-09T00:00:00.000Z"}])assert.equal(orderRequestSchema.safeParse({...body,...patch}).success,false);
 for(const extra of [{orderId:randomUUID()},{clientId:ids.b},{price:"1000"},{status:"READY"},{updatedAt:"2026-11-09T00:00:00.000Z"}])assert.equal(orderRequestSchema.safeParse(create({items:[{id:randomUUID(),description:"A",...extra}]})).success,false);
 for(const operation of ["update","delete","add-item"])assert.equal(orderRequestSchema.safeParse({...create(),operation}).success,false);
});
test("atomic multiple-item creation derives ownership, uses only explicit columns and returns no private identity data",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),sessionCount=f.rows().session.length,baseline=structuredClone(f.rows().measurementVersions);
 const input=create({items:[{id:randomUUID(),description:" Agbada ",measurementVersionId:ids.ma},{id:randomUUID(),description:"Shirt"}]}),r=await f.call({headers:h,body:input});assert.equal(r.status,200);assert.equal(r.headers.has("set-cookie"),false);assert.equal(r.headers.get("cache-control"),"no-store");
 const saved=orderSingleReplySchema.parse(await r.json()).order;assert.equal(saved.clientId,ids.a);assert.equal(saved.items.length,2);assert.ok(saved.items.some(i=>i.description==="Agbada"&&i.measurementVersionId===ids.ma));assert.ok(saved.items.some(i=>i.measurementVersionId===null));assert.equal(f.rows().orders[0].businessId,"business-a");assert.equal(f.rows().session.length,sessionCount);assert.deepEqual(f.rows().measurementVersions,baseline);
 assert.ok(f.events.lastIndexOf("user.lock")<f.events.lastIndexOf("client.lock"));assert.ok(f.events.lastIndexOf("client.lock")<f.events.lastIndexOf("order.create"));assert.ok(f.events.lastIndexOf("order.create")<f.events.lastIndexOf("order.items"));assert.doesNotMatch(JSON.stringify(saved),/businessId|email|password|tailor-a/);
}));
test("null measurements never select latest; explicit references are scoped to the same Business and Client",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.service.execute(h,create());assert.equal(f.versionQueries.length,0);
 await f.service.execute(h,create({items:[{id:randomUUID(),description:"A",measurementVersionId:ids.ma},{id:randomUUID(),description:"B",measurementVersionId:ids.ma}]}));assert.equal(f.versionQueries.length,1);assert.deepEqual(f.versionQueries[0],{businessId:"business-a",clientId:ids.a,id:{in:[ids.ma]}});
 const before=f.rows().orders.length;
 for(const id of [ids.ma2,ids.mb,randomUUID()]){const r=await f.call({headers:h,body:create({items:[{id:randomUUID(),description:"Invalid",measurementVersionId:id}]})});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"order_not_found"});}
 assert.equal(f.rows().orders.length,before);
}));
test("another Business and administrator cannot create for, retrieve or list another owner's orders",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),saved=(await f.service.execute(a,create())).order;f.rows().user[1].isAdministrator=true;f.rows().businessMember.push({businessId:"business-a",userId:"tailor-b"});
 assert.deepEqual(await f.service.execute(b,{operation:"list"}),{orders:[],nextCursor:null});
 for(const body of [{operation:"get",id:saved.id},{operation:"get",id:randomUUID()},create({clientId:ids.a})]){const r=await f.call({headers:b,body});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"order_not_found"});}
 assert.equal((await f.service.execute(a,{operation:"get",id:saved.id})).order.id,saved.id);
 const own=await f.service.execute(b,create({clientId:ids.b}));assert.equal(own.order.clientId,ids.b);assert.equal(f.rows().orders.length,2);
}));
test("identical retries tolerate item ordering/trim only and preserve exact IDs, contents and timestamps",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create({items:[{id:randomUUID(),description:" A "},{id:randomUUID(),description:"B",measurementVersionId:ids.ma}]}),first=await f.service.execute(h,input);
 const same={...input,items:input.items.toReversed().map(i=>({...i,description:i.description.trim(),measurementVersionId:i.measurementVersionId??null}))};assert.deepEqual(await f.service.execute(h,same),first);
 for(const patch of [{clientId:ids.a2},{items:[{...input.items[0],description:"Changed"},input.items[1]]},{items:[{...input.items[0],id:randomUUID()},input.items[1]]},{items:[{...input.items[0],measurementVersionId:ids.ma},input.items[1]]}])await assert.rejects(f.service.execute(h,{...input,...patch}),e=>e.code==="conflict");
 assert.equal(f.rows().orders.length,1);assert.equal(f.rows().orderItems.length,2);
}));
test("Order or item UUID collisions never overwrite or disclose other businesses' records",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),input=create();await f.service.execute(a,input);
 for(const body of [create({clientId:ids.b,id:input.id}),create({clientId:ids.b,items:input.items})]){const r=await f.call({headers:b,body});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"order_conflict"});}
 assert.equal(f.rows().orders.length,1);assert.equal(f.rows().orderItems.length,1);
}));
test("same-owner late createMany item UUID collision returns sanitized 409 and rolls back the new parent and fresh item",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),first=create();await f.service.execute(h,first);
 const before={orders:structuredClone(f.rows().orders),items:structuredClone(f.rows().orderItems)};
 const late=create({items:[{id:randomUUID(),description:"Fresh item before intentional conflict"},{...first.items[0],description:"Intentional existing item UUID collision"}]});
 const r=await f.call({headers:h,body:late});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"order_conflict"});
 assert.deepEqual(f.rows().orders,before.orders);assert.deepEqual(f.rows().orderItems,before.items);
 assert.equal(f.rows().orders.some(o=>o.id===late.id),false);assert.equal(f.rows().orderItems.some(o=>o.id===late.items[0].id),false);
}));
test("DOUBLE concurrent duplicate/conflicting creates serialize with one committed identity and no partial Orders",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create();const results=await Promise.all([f.service.execute(h,input),f.service.execute(h,input)]);assert.deepEqual(results[0],results[1]);assert.equal(f.rows().orders.length,1);
 const request=create(),conflict=await Promise.allSettled([f.service.execute(h,request),f.service.execute(h,{...request,items:[{...request.items[0],description:"Changed"}]})]);assert.equal(conflict.filter(r=>r.status==="fulfilled").length,1);assert.equal(conflict.find(r=>r.status==="rejected").reason.code,"conflict");assert.equal(f.rows().orders.length,2);assert.equal(f.rows().orderItems.length,2);
}));
test("failed parent, partial items, count mismatch and failed commit restore all records",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.service.execute(h,create());const before={orders:structuredClone(f.rows().orders),items:structuredClone(f.rows().orderItems),clients:structuredClone(f.rows().clients),measurements:structuredClone(f.rows().measurementVersions)};
 for(const failure of ["order_insert","item_partial","item_count","commit"]){f.setFailure(failure);const r=await f.call({headers:h,body:create()});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"order_unavailable"});assert.deepEqual(f.rows().orders,before.orders);assert.deepEqual(f.rows().orderItems,before.items);assert.deepEqual(f.rows().clients,before.clients);assert.deepEqual(f.rows().measurementVersions,before.measurements);}
}));
test("uncertain committed creation reconciles through get with the original UUID and never automatically retries",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create();f.setFailure("uncertain");const r=await f.call({headers:h,body:input});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"order_unavailable"});assert.equal(f.rows().orders.length,1);assert.equal(f.events.filter(e=>e==="order.create").length,1);
 f.setFailure(null);const saved=await f.service.execute(h,{operation:"get",id:input.id});assert.deepEqual(await f.service.execute(h,input),saved);assert.equal(f.events.filter(e=>e==="order.create").length,1);
 const absent=create();f.setFailure("item_partial");assert.equal((await f.call({headers:h,body:absent})).status,503);f.setFailure(null);assert.equal((await f.call({headers:h,body:{operation:"get",id:absent.id}})).status,404);await f.service.execute(h,absent);assert.equal(f.rows().orders.length,2);
}));
test("bounded newest-first listing handles timestamp ties, cursor boundaries and returns summaries without items",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();for(let i=0;i<6;i++)await f.service.execute(h,create());f.setTime("2026-11-09T12:01:00.000Z");await f.service.execute(h,create());
 const wanted=f.rows().orders.toSorted((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?1:-1)).map(o=>o.id),seen=[];let cursor;
 do{const reply=orderListReplySchema.parse(await f.service.execute(h,{operation:"list",limit:2,...(cursor?{cursor}:{})}));assert.ok(reply.orders.every(o=>!("items" in o)));seen.push(...reply.orders.map(o=>o.id));cursor=reply.nextCursor;}while(cursor);
 assert.deepEqual(seen,wanted);assert.equal(new Set(seen).size,7);assert.equal((await f.service.execute(h,{operation:"list",limit:50})).orders.length,7);
 for(const limit of [0,51,1.5,"2"])assert.equal(orderRequestSchema.safeParse({operation:"list",limit}).success,false);
 for(const cursor of [{id:"invalid",createdAt:"now"},{id:randomUUID(),createdAt:"2026-11-09T12:00:00.000Z",businessId:"forged"}])assert.equal(orderRequestSchema.safeParse({operation:"list",cursor}).success,false);
}));
test("session, verification, credentials, account locks and owner membership are rechecked under User lock",async()=>development(async()=>{
 for(const kind of ["disabled","deletion","unverified","passwordless","revoked","expired","membership"]){const f=await fixture(),h=await f.login();let changed=false;
  const sessions={...f.sessions,lookup:async headers=>{const r=await f.sessions.lookup(headers);if(!changed){changed=true;const u=f.rows().user[0];if(kind==="disabled")u.disabledAt=new Date();if(kind==="deletion")u.deletionRequestedAt=new Date();if(kind==="unverified")u.emailVerified=false;if(kind==="passwordless")f.rows().account=[];if(kind==="revoked")f.rows().session=[];if(kind==="expired")f.rows().session[0].expiresAt=new Date(0);if(kind==="membership")f.rows().businessMember=[];}return r;}};
  const service=createOrderService(f.client,sessions);for(const body of [create(),{operation:"list"},{operation:"get",id:randomUUID()}])await assert.rejects(service.execute(h,body),e=>e.code===(kind==="membership"?"unavailable":"unauthenticated"));assert.equal(f.rows().orders.length,0);
 }
 const f=await fixture();assert.equal((await f.call()).status,401);assert.equal((await f.call({headers:new Headers({cookie:"better-auth.session_token=invalid"})})).status,401);const h=await f.login();f.rows().session[0].expiresAt=new Date(0);assert.equal((await f.call({headers:h})).status,401);
}));
test("missing onboarding and unavailable database/locks/clock stay generic and do not retain Orders",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();for(const failure of ["business","client_lock","read","clock","versions"]){f.setFailure(failure);const r=await f.call({headers:h,body:create({items:[{id:randomUUID(),description:"A",measurementVersionId:ids.ma}]})});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"order_unavailable"});assert.equal(f.rows().orders.length,0);}
 f.setFailure(null);f.rows().business=[];assert.deepEqual(await (await f.call({headers:h})).json(),{error:"business_required"});
}));
test("raw transport keeps Origin, socket, header, method and default-off guards",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();
 for(const extra of [{origin:"https://outside.invalid"},{"x-forwarded-for":"127.0.0.1"},{"sec-fetch-site":"cross-site"}])assert.equal((await f.call({headers:h,extra})).status,403);
 assert.equal((await f.call({headers:h,peer:"192.0.2.1"})).status,404);assert.equal((await f.call({headers:h,method:"GET"})).status,405);assert.equal((await f.call({headers:h,path:orderPath+"?businessId=forged"})).status,404);
 assert.equal((await f.call({headers:h,rawHeaders:["host","127.0.0.1:3000","Host","127.0.0.1:3000"]})).status,400);assert.equal((await f.call({headers:h,body:"{"})).status,400);assert.equal((await f.call({headers:h,body:create({businessId:"forged"})})).status,422);
 for(const patch of [{ENABLE_PRODUCT_SESSION_HTTP:undefined},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"}])assert.ok([404,503].includes((await f.call({headers:h,settings:{...env,...patch}})).status));
 assert.match(readFileSync(new URL("../../pages/api/internal/tailor-orders.ts",import.meta.url),"utf8"),/bodyParser:false/u);
}));
test("Orders alone accept a maximum complete escaped-Unicode request while shared authentication keeps its 16 KiB default",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),input=create({items:Array.from({length:50},()=>({id:randomUUID(),description:"\u{1f9f5}".repeat(500)}))});
 const body=JSON.stringify(input).replaceAll("\u{1f9f5}","\\ud83e\\uddf5");assert.ok(Buffer.byteLength(body)>16*1024&&Buffer.byteLength(body)<ORDER_BODY_LIMIT);const r=await f.call({headers:h,body});assert.equal(r.status,200);assert.equal((await r.json()).order.items.length,50);
 assert.equal((await f.call({headers:h,body:" ".repeat(ORDER_BODY_LIMIT+1)})).status,413);
 const auth=await decodeAuthRequest(new Request(origin+"/auth",{method:"POST",headers:{"content-type":"application/json",origin},body}));assert.equal(auth.ok,false);assert.equal(auth.response.status,413);
}));
test("rate budgets are bounded, independent and fail closed with numeric Retry-After",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.call({headers:h});await f.call({headers:h,body:create()});assert.ok(new Set(f.buckets).size>=4);
 const policy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID);
 for(const [operation,version]of [["login",policy.login.version],["measurement-read",policy.session.version+"-m"],["client-read",policy.session.version+"-c"]]){const digest="rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1",operation,version,"account","tailor-a@example.invalid"])).digest("hex");assert.equal(f.buckets.includes(digest),false);}
 for(const budget of ["deny","account","failure","malformed"]){f.setBudget(budget);const r=await f.call({headers:h});assert.equal(r.status,["deny","account"].includes(budget)?429:503);if(r.status===429)assert.match(r.headers.get("retry-after"),/^[1-9][0-9]*$/u);else assert.deepEqual(await r.json(),{error:"order_unavailable"});}
}));
test("reads do not lock Orders or history, and corrupt/incomplete oversized details fail safely",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),saved=(await f.service.execute(h,create())).order,lockCount=f.locks.length;
 await f.service.execute(h,{operation:"list"});assert.equal((await f.service.execute(h,{operation:"get",id:saved.id})).order.items.length,1);assert.equal(f.locks.length,lockCount);
 for(const count of [0,51]){f.rows().orderItems=Array.from({length:count},()=>({id:randomUUID(),orderId:saved.id,clientId:ids.a,description:"A",measurementVersionId:null,createdAt:new Date(),updatedAt:new Date()}));const r=await f.call({headers:h,body:{operation:"get",id:saved.id}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"order_unavailable"});}
 const code=readFileSync(new URL("../../lib/product-auth/orders.server.ts",import.meta.url),"utf8");assert.doesNotMatch(code.replace(/\/\/[^\n]*/gu,""),/(?:order|client|measurementVersion|measurementEntry)\.(?:update|delete|upsert)|orderItem\.(?:delete|upsert)|\$queryRawUnsafe|\$executeRawUnsafe|skipDuplicates|FOR UPDATE.*Order/u);
}));
test("DOUBLE one failed concurrent request leaves only the other complete Order",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();f.setFailure("item_partial_once");const r=await Promise.allSettled([f.service.execute(h,create()),f.service.execute(h,create())]);assert.equal(r.filter(v=>v.status==="fulfilled").length,1);assert.equal(r.filter(v=>v.status==="rejected").length,1);assert.equal(f.rows().orders.length,1);assert.equal(f.rows().orderItems.length,1);
}));

const edit=(order,patch={})=>({operation:"update_item",id:order.id,itemId:order.items[0].id,expectedUpdatedAt:order.items[0].updatedAt,...patch});
test("strict update_item contract distinguishes omission/null and rejects empty patches, forged fields, UUIDs, descriptions and timestamps",()=>{
 const base={operation:"update_item",id:randomUUID(),itemId:randomUUID(),expectedUpdatedAt:"2026-11-09T12:00:00.000Z"};
 for(const patch of [{description:" A "},{measurementVersionId:null},{measurementVersionId:ids.ma},{description:"Shirt",measurementVersionId:null}])assert.equal(orderRequestSchema.safeParse({...base,...patch}).success,true);
 const name=orderRequestSchema.parse({...base,description:" A "});assert.equal(name.description,"A");assert.equal(Object.hasOwn(name,"measurementVersionId"),false);
 const cleared=orderRequestSchema.parse({...base,measurementVersionId:null});assert.equal(cleared.measurementVersionId,null);assert.equal(Object.hasOwn(cleared,"description"),false);
 for(const patch of [{},{description:""},{description:" \u0085 "},{description:"A\u0000B"},{description:"\u{1f9f5}".repeat(501)},{description:null},{description:"A",id:"bad"},{description:"A",itemId:"bad"},{measurementVersionId:"bad"},
  ...[undefined,"invalid","2026-11-09T12:00:00Z","2026-11-09T12:00:00.0000Z","2026-02-30T12:00:00.000Z","2026-11-09T12:00:00.000+01:00"].map(expectedUpdatedAt=>({description:"A",expectedUpdatedAt})),
  ...[{businessId:"forged"},{clientId:ids.b},{ownerId:"forged"},{createdAt:base.expectedUpdatedAt},{updatedAt:base.expectedUpdatedAt},{orderId:base.id},{role:"admin"}].map(extra=>({description:"A",...extra}))])assert.equal(orderRequestSchema.safeParse({...base,...patch}).success,false,JSON.stringify(patch));
});
test("description-only Unicode edit preserves measurement, identity, createdAt, other items, parent and all history",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),saved=(await f.service.execute(h,create({items:[{id:randomUUID(),description:"First",measurementVersionId:ids.ma},{id:randomUUID(),description:"Second"}]}))).order;
 const before={orders:structuredClone(f.rows().orders),versions:structuredClone(f.rows().measurementVersions)},r=await f.call({headers:h,body:edit(saved,{description:" \u0085Agbada \u{1f9f5}\u00a0"})});
 assert.equal(r.status,200);assert.equal(r.headers.has("set-cookie"),false);const result=orderSingleReplySchema.parse(await r.json()).order;
 assert.equal(result.items[0].description,"Agbada \u{1f9f5}");assert.equal(result.items[0].measurementVersionId,saved.items[0].measurementVersionId);assert.equal(result.items[0].createdAt,saved.items[0].createdAt);assert.equal(result.items[0].updatedAt,"2026-11-09T12:00:00.001Z");assert.deepEqual(result.items[1],saved.items[1]);assert.deepEqual(f.rows().orders,before.orders);assert.deepEqual(f.rows().measurementVersions,before.versions);
 assert.equal(f.versionQueries.length,1);assert.equal(f.updates.length,1);assert.deepEqual(f.updates[0].where,{id:saved.items[0].id,orderId:saved.id,clientId:saved.clientId,order:{businessId:"business-a"},updatedAt:new Date(saved.items[0].updatedAt)});
}));
test("measurement-only selection, explicit clearing and combined edits preserve omitted fields atomically",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();let order=(await f.service.execute(h,create())).order;
 const selected=(await f.service.execute(h,edit(order,{measurementVersionId:ids.ma}))).order;
 assert.equal(selected.items[0].description,order.items[0].description);assert.equal(selected.items[0].measurementVersionId,ids.ma);assert.deepEqual(f.versionQueries.at(-1),{businessId:"business-a",clientId:ids.a,id:{in:[ids.ma]}});
 order=(await f.service.execute(h,edit(selected,{measurementVersionId:null}))).order;assert.equal(order.items[0].measurementVersionId,null);assert.equal(order.items[0].description,selected.items[0].description);
 const both=(await f.service.execute(h,edit(order,{description:"New lining",measurementVersionId:ids.ma}))).order;assert.equal(both.items[0].description,"New lining");assert.equal(both.items[0].measurementVersionId,ids.ma);assert.equal(both.items[0].updatedAt,"2026-11-09T12:00:00.003Z");assert.equal(both.updatedAt,order.updatedAt);assert.equal(both.items[0].createdAt,order.items[0].createdAt);
}));
test("current no-op preserves every timestamp and performs no UPDATE, but stale matching values still conflict",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order;
 for(const patch of [{description:" "+order.items[0].description+" "},{measurementVersionId:null},{description:order.items[0].description,measurementVersionId:null}])assert.deepEqual((await f.service.execute(h,edit(order,patch))).order,order);
 assert.equal(f.updates.length,0);const changed=(await f.service.execute(h,edit(order,{description:"Changed"}))).order,before=structuredClone(f.rows().orderItems);
 const r=await f.call({headers:h,body:edit(order,{description:changed.items[0].description})});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"order_conflict"});assert.deepEqual(f.rows().orderItems,before);assert.equal(f.updates.length,1);
}));
test("two competing same-timestamp edits have one winner and one 409; successful tokens advance despite same/backward clocks",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order;
 const results=await Promise.all([f.call({headers:h,body:edit(order,{description:"First choice"})}),f.call({headers:h,body:edit(order,{description:"Second choice"})})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.updates.length,1);
 const current=(await f.service.execute(h,{operation:"get",id:order.id})).order;f.setTime("2026-11-09T11:59:00.000Z");const next=(await f.service.execute(h,edit(current,{description:"Third choice"}))).order;assert.equal(Date.parse(next.items[0].updatedAt),Date.parse(current.items[0].updatedAt)+1);
}));
test("a conditional UPDATE affecting zero rows is a conflict, not success or an automatic retry",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order,before=structuredClone(f.rows().orderItems);f.setFailure("update_zero");
 const r=await f.call({headers:h,body:edit(order,{description:"Changed"})});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:"order_conflict"});assert.deepEqual(f.rows().orderItems,before);assert.equal(f.updates.length,1);
}));
test("items in another Order, missing IDs and another Business remain indistinguishable 404s",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),first=(await f.service.execute(a,create())).order,second=(await f.service.execute(a,create())).order,before=structuredClone(f.rows().orderItems);
 for(const [headers,body]of [[a,edit(first,{itemId:second.items[0].id,description:"No"})],[a,edit(first,{itemId:randomUUID(),description:"No"})],[a,edit(first,{id:randomUUID(),description:"No"})],[b,edit(first,{description:"No"})]]){const r=await f.call({headers,body});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"order_not_found"});}
 assert.deepEqual(f.rows().orderItems,before);assert.equal(f.updates.length,0);
}));
test("wrong-Client and cross-Business measurement references reject the entire combined edit",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order,before=structuredClone(f.rows().orderItems);
 for(const id of [ids.ma2,ids.mb,randomUUID()]){const r=await f.call({headers:h,body:edit(order,{description:"Must not persist",measurementVersionId:id})});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"order_not_found"});}
 assert.deepEqual(f.rows().orderItems,before);assert.equal(f.updates.length,0);
}));
test("update_item reuses session, verified credential, account lock, owner and environment restrictions",async()=>development(async()=>{
 for(const kind of ["missing","expired","revoked","unverified","disabled","deletion","passwordless","membership"]){
  const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order,body=edit(order,{description:"Changed"}),before=structuredClone(f.rows().orderItems);
  if(kind==="expired")f.rows().session[0].expiresAt=new Date(0);if(kind==="revoked")f.rows().session=[];
  if(kind==="unverified")f.rows().user[0].emailVerified=false;if(kind==="disabled")f.rows().user[0].disabledAt=new Date();if(kind==="deletion")f.rows().user[0].deletionRequestedAt=new Date();
  if(kind==="passwordless")f.rows().account[0].password=null;if(kind==="membership")f.rows().businessMember=[];
  const r=await f.call({headers:kind==="missing"?undefined:h,body});assert.equal(r.status,kind==="membership"?503:401,kind);assert.deepEqual(f.rows().orderItems,before);assert.equal(f.updates.length,0);
 }
 const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order,body=edit(order,{description:"Changed"});
 const sessions={...f.sessions,lookup:async headers=>{const current=await f.sessions.lookup(headers);f.rows().user[0].disabledAt=new Date();return current;}};
 await assert.rejects(createOrderService(f.client,sessions).execute(h,body),e=>e.code==="unauthenticated");assert.equal(f.updates.length,0);
 const prior=process.env.NODE_ENV;process.env.NODE_ENV="production";try{await assert.rejects(f.service.execute(h,body),e=>e.code==="unavailable");}finally{process.env.NODE_ENV=prior;}
}));
test("update_item consumes the same write IP/account budgets as create and preserves transport guards",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),r=await f.call({headers:h,body:create()}),order=(await r.json()).order,createBuckets=f.buckets.splice(0),body=edit(order,{description:"Changed"});
 assert.equal((await f.call({headers:h,body})).status,200);assert.deepEqual(f.buckets,createBuckets);assert.equal(f.buckets.length,3);
 for(const budget of ["deny","account","key:"+createBuckets[1],"key:"+createBuckets[2],"failure","malformed"]){f.setBudget(budget);const r=await f.call({headers:h,body});assert.equal(r.status,["failure","malformed"].includes(budget)?503:429);if(r.status===429)assert.match(r.headers.get("retry-after"),/^[1-9][0-9]*$/u);}
 f.setBudget("allow");assert.equal((await f.call({headers:h,body,extra:{origin:"https://outside.invalid"}})).status,403);assert.equal((await f.call({headers:h,body,peer:"192.0.2.1"})).status,404);assert.equal((await f.call({headers:h,body:{...body,businessId:"forged"}})).status,422);
}));
test("permission errors, partial writes, corrupt readback and failed COMMIT roll back; ambiguous COMMIT reconciles without retry",async()=>development(async()=>{
 const f=await fixture(),h=await f.login(),order=(await f.service.execute(h,create())).order,before={items:structuredClone(f.rows().orderItems),orders:structuredClone(f.rows().orders)};
 for(const failure of ["update_permission","update_partial","update_corrupt","update_count","commit","clock","versions"]){f.setFailure(failure);const attempts=f.updates.length,r=await f.call({headers:h,body:edit(order,{description:"Changed",measurementVersionId:ids.ma})});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"order_unavailable"});assert.deepEqual(f.rows().orderItems,before.items);assert.deepEqual(f.rows().orders,before.orders);assert.ok(f.updates.length-attempts<=1);}
 f.setFailure("uncertain");const attempts=f.updates.length,r=await f.call({headers:h,body:edit(order,{description:"Committed but uncertain"})});assert.equal(r.status,503);assert.equal(f.updates.length,attempts+1);assert.equal(f.rows().orderItems[0].description,"Committed but uncertain");
 f.setFailure(null);const current=(await f.service.execute(h,{operation:"get",id:order.id})).order;assert.equal(current.items[0].description,"Committed but uncertain");assert.equal((await f.call({headers:h,body:edit(order,{description:"Committed but uncertain"})})).status,409);assert.equal(f.updates.length,attempts+1);
}));
