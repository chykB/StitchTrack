// Real services, Better Auth and Argon2id with persistence/socket doubles only.
// No PostgreSQL, listener, email or private configuration. Mutex/rollback are NOT PG proof.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {IncomingMessage} from "node:http";
import {createHmac} from "node:crypto";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {businessNameSchema,businessWriteSchema,businessPath} from "../../lib/business-contract.ts";
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {createBusinessService}=await import("../../lib/product-auth/business.server.ts");
const {createLocalBusinessDispatcher}=await import("../../lib/product-auth/business-http.server.ts");
const {createNextBusinessResponse}=await import("../../lib/product-auth/registration-next.server.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const origin="http://127.0.0.1:3000",password=" Offline business fixture password ",hash=await hashPassword(password),key=Buffer.alloc(32,9);
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",ENABLE_LOCAL_AUTH_FRONTEND:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-business-signing-secret-not-real",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
async function fixture(){
 const f=fakeProduct({sessionAccess:true});f.rows().business=[];f.rows().businessMember=[];
 let failure=null,budget="allow",tail=Promise.resolve();const buckets=[];
 const picked=(row,select)=>row?Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])):null;
 const validate=()=>{for(const b of f.rows().business)assert.ok(f.rows().businessMember.some(m=>m.businessId===b.id&&m.userId===b.primaryOwnerUserId),"deferred owner double");};
 f.client.business={
  async findUnique({where,select}){assert.deepEqual(Object.keys(where),["primaryOwnerUserId"]);if(failure==="read")throw Error("private database diagnostic");return picked(f.rows().business.find(b=>b.primaryOwnerUserId===where.primaryOwnerUserId),select);},
  async create({data,select}){assert.ok(f.inTransaction());assert.ok(f.events.includes("user.lock"));if(failure==="business")throw Error("private insert diagnostic");assert.ok(!f.rows().business.some(b=>b.primaryOwnerUserId===data.primaryOwnerUserId));const row={...data,createdAt:new Date(),updatedAt:new Date()};f.rows().business.push(row);f.events.push("business.create");return picked(row,select);},
  async update({where,data,select}){assert.ok(f.inTransaction());assert.deepEqual(Object.keys(where),["primaryOwnerUserId"]);assert.deepEqual(Object.keys(data),["name"]);if(failure==="rename")throw Error("private update permission diagnostic");const b=f.rows().business.find(b=>b.primaryOwnerUserId===where.primaryOwnerUserId);assert.ok(b);Object.assign(b,data);return picked(b,select);},
 };
 f.client.businessMember={
  async findUnique({where,select}){if(failure==="member-read")throw Error("private permission diagnostic");const w=where.businessId_userId;return picked(f.rows().businessMember.find(m=>m.businessId===w.businessId&&m.userId===w.userId),select);},
  async create({data,select}){assert.ok(f.inTransaction());if(failure==="member")throw Error("private membership diagnostic");f.rows().businessMember.push({...data,createdAt:new Date()});f.events.push("member.create");return picked(data,select);},
 };
 const execute=f.client.$executeRaw,query=f.client.$queryRaw,transaction=f.client.$transaction;
 f.client.$executeRaw=async parts=>{
  if(parts.join("").startsWith("SET CONSTRAINTS")){assert.equal(parts.join(""),'SET CONSTRAINTS product."Business_id_primaryOwnerUserId_fkey" IMMEDIATE');assert.ok(f.inTransaction());f.events.push("owner.constraint");if(failure==="constraint")throw Error("private constraint diagnostic");validate();return 0;}
  return execute(parts);
 };
 f.client.$queryRaw=async(parts,...values)=>{
  if(parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')){
   buckets.push(values[0]);if(budget==="failure")throw Error("private rate diagnostic");
   if(budget==="missing-ip-retry")return [{allowed:true}];
   const accountDenied=budget==="account-deny"&&buckets.length%2===0;
   return [{allowed:budget!=="deny"&&!accountDenied,retryAfterSeconds:budget==="account-deny"&&!accountDenied?1:5}];
  }
  return query(parts,...values);
 };
 // Serialized transaction double makes request ordering deterministic; PG locks
 // and deferred FK behavior still require independent owner-run verification.
 f.client.$transaction=(callback,options)=>{const task=tail.then(async()=>{
  const result=await transaction(async tx=>{const value=await callback(tx);validate();if(failure==="commit")throw Error("private commit diagnostic");return value;},options);
  if(failure==="uncertain")throw Error("private lost commit acknowledgement");return result;
 });tail=task.catch(()=>{});return task;};
 for(const id of ["tailor-a","tailor-b"]){await f.client.user.create({data:{id,name:id,email:id+"@example.invalid",emailVerified:true}});await f.client.account.create({data:{id:id+"-password",accountId:id,userId:id,providerId:"credential",password:hash}});}
 const sessions=createSessionService(f.client,{mode:"test",origin,authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY,"base64"),expiresInSeconds:604800,renewal:"none"});
 const login=async(id="tailor-a")=>{const r=await sessions.login({email:id+"@example.invalid",password});return new Headers({cookie:r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});};
 const service=createBusinessService(f.client,sessions);
 async function call({headers,body,method=body===undefined?"GET":"POST",extra={},rawHeaders,settings=env,peer="127.0.0.1",path=businessPath}={}){
  const socket=new Socket();for(const [k,v]of Object.entries({remoteAddress:peer,localAddress:"127.0.0.1",localPort:3000}))Object.defineProperty(socket,k,{value:v});
  const request=new IncomingMessage(socket);request.method=method;request.url=path;request.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3000",...(headers?.get("cookie")?{cookie:headers.get("cookie")}:{}),...(method==="POST"?{origin,"content-type":"application/json"}:{}),...extra}).flat();
  request.headers={"x-forwarded-for":"127.0.0.1",ownerId:"tailor-b"};if(body!==undefined)request.push(typeof body==="string"?body:JSON.stringify(body));request.push(null);
  try{return await createNextBusinessResponse({environment:()=>settings,runtime:async e=>createLocalBusinessDispatcher(f.client,e,key)})(request);}finally{request.destroy();socket.destroy();}
 }
 return {...f,service,sessions,login,call,buckets,setFailure:value=>{failure=value;},setBudget:value=>{budget=value;}};
}
test("business names trim consistently, count Unicode code points and reject malformed/forged input",()=>{
 assert.equal(businessNameSchema.parse("  Atelier Lagos  "),"Atelier Lagos");assert.equal(businessNameSchema.parse("\uFEFF\u00a0AB\u00a0"),"AB");
 const garment=String.fromCodePoint(0x1f9f5);for(const n of [2,120])assert.equal(businessNameSchema.parse(garment.repeat(n)),garment.repeat(n));
 for(const value of ["","  ","A",garment.repeat(121),String.fromCharCode(0xd800)])assert.equal(businessNameSchema.safeParse(value).success,false);
 for(const extra of [{ownerId:"tailor-b"},{userId:"tailor-b"},{businessId:"other"},{role:"owner"},{timeZone:"UTC"}])assert.equal(businessWriteSchema.safeParse({operation:"create",name:"Studio",...extra}).success,false);
});
test("actual service creates Business and its session-derived owner member atomically without issuing a session",async()=>development(async()=>{
 const f=await fixture(),headers=await f.login(),sessionCount=f.rows().session.length;
 assert.equal(await f.service.read(headers),null);const saved=await f.service.write(headers,{operation:"create",name:"  Lagos Studio  "});
 assert.equal(saved.name,"Lagos Studio");assert.equal(saved.timeZone,"Africa/Lagos");assert.equal(f.rows().business[0].primaryOwnerUserId,"tailor-a");assert.deepEqual(f.rows().businessMember.map(m=>[m.businessId,m.userId]),[[saved.id,"tailor-a"]]);
 assert.equal(f.rows().session.length,sessionCount);assert.ok(f.events.indexOf("business.create")<f.events.indexOf("member.create"));assert.ok(f.events.indexOf("member.create")<f.events.indexOf("owner.constraint"));
 assert.deepEqual(await f.service.read(headers),saved);
}));
test("identical repeat is idempotent, a different second business conflicts and names are not globally unique",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),saved=await f.service.write(a,{operation:"create",name:"Studio"});
 assert.deepEqual(await f.service.write(a,{operation:"create",name:" Studio "}),saved);await assert.rejects(f.service.write(a,{operation:"create",name:"Another studio"}),e=>e.code==="conflict");
 assert.notEqual((await f.service.write(b,{operation:"create",name:"Studio"})).id,saved.id);assert.equal(f.rows().business.length,2);
}));
test("DOUBLE: simultaneous setup requests serialize; same details return one identity and differing details cannot overwrite",async()=>development(async()=>{
 for(const second of ["Studio","Other Studio"]){const f=await fixture(),h=await f.login();const results=await Promise.allSettled([f.service.write(h,{operation:"create",name:"Studio"}),f.service.write(h,{operation:"create",name:second})]);
  assert.equal(f.rows().business.length,1);assert.equal(f.rows().businessMember.length,1);assert.equal(f.rows().business[0].name,"Studio");
  if(second==="Studio")assert.equal(results[0].value.id,results[1].value.id);else assert.equal(results[1].reason.code,"conflict");
 }
}));
test("membership, constraint and commit failures roll back both rows and disclose no native diagnostic",async()=>development(async()=>{
 for(const failure of ["business","member","constraint","commit"]){const f=await fixture(),h=await f.login();f.setFailure(failure);await assert.rejects(f.service.write(h,{operation:"create",name:"Studio"}),e=>e.code==="unavailable"&&!e.message.includes("private"));assert.equal(f.rows().business.length,0);assert.equal(f.rows().businessMember.length,0);}
}));
test("transactional recheck refuses locks, unverified status, passwordless identities and revoked/expired cookies",async()=>development(async()=>{
 for(const kind of ["disabled","deletion","unverified","passwordless","revoked","expired"]){const f=await fixture(),h=await f.login();let changed=false;
  const sessions={...f.sessions,lookup:async headers=>{const result=await f.sessions.lookup(headers);if(!changed){changed=true;const user=f.rows().user[0];if(kind==="disabled")user.disabledAt=new Date();if(kind==="deletion")user.deletionRequestedAt=new Date();if(kind==="unverified")user.emailVerified=false;if(kind==="passwordless")f.rows().account=f.rows().account.filter(a=>a.userId!==user.id);if(kind==="revoked")f.rows().session=[];if(kind==="expired")f.rows().session[0].expiresAt=new Date(0);}return result;}};
  await assert.rejects(createBusinessService(f.client,sessions).write(h,{operation:"create",name:"Studio"}),e=>e.code==="unauthenticated",kind);assert.equal(f.rows().business.length,0);
 }
}));
test("ownership scopes retrieval and editing; foreign memberships, administrator claims and IDs cannot confer ownership",async()=>development(async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login("tailor-b"),saved=await f.service.write(a,{operation:"create",name:"Studio A"});
 f.rows().businessMember.push({businessId:saved.id,userId:"tailor-b"});f.rows().user[1].isAdministrator=true;
 assert.equal(await f.service.read(b),null);await assert.rejects(f.service.write(b,{operation:"rename",name:"Hijacked"}),e=>e.code==="conflict");
 for(const value of [undefined,{operation:"rename",name:"Hijacked",businessId:saved.id},{operation:"create",name:"Studio B",ownerId:"tailor-a"}])await assert.rejects(f.service.write(b,value),e=>e.code==="invalid_input");
 const owner=f.rows().business[0].primaryOwnerUserId;assert.equal((await f.service.write(a,{operation:"rename",name:" New Studio A "})).name,"New Studio A");assert.equal(f.rows().business[0].primaryOwnerUserId,owner);assert.equal(f.rows().business[0].timeZone,"Africa/Lagos");
}));
test("missing schema/grants stay unavailable, never onboarding-null; lost COMMIT returns no success and reads can reconcile",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();f.setFailure("read");await assert.rejects(f.service.read(h),e=>e.code==="unavailable");f.setFailure("member");await assert.rejects(f.service.write(h,{operation:"create",name:"Studio"}),e=>e.code==="unavailable");assert.equal(f.rows().business.length,0);
 f.setFailure("uncertain");await assert.rejects(f.service.write(h,{operation:"create",name:"Studio"}),e=>e.code==="unavailable");assert.equal(f.rows().business.length,1);f.setFailure(null);assert.equal((await f.service.read(h)).name,"Studio");
}));
test("real Node business route preserves raw-header/socket/Origin/body/default-off boundaries and safe statuses",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();assert.equal((await f.call()).status,401);assert.deepEqual(await(await f.call({headers:h})).json(),{business:null});
 assert.equal((await f.call({headers:h,body:{operation:"create",name:"Studio"}})).status,200);
 assert.equal((await f.call({headers:h,body:{operation:"create",name:"Other Studio"}})).status,409);
 assert.equal((await f.call({headers:h,body:{operation:"rename",name:"New Studio",ownerId:"tailor-b"}})).status,422);
 for(const extra of [{"x-forwarded-for":"127.0.0.1"},{origin:"https://outside.invalid"},{"sec-fetch-site":"cross-site"}])assert.equal((await f.call({headers:h,extra})).status,403);
 assert.equal((await f.call({headers:h,rawHeaders:["host","127.0.0.1:3000","Host","127.0.0.1:3000"]})).status,400);
 assert.equal((await f.call({headers:h,peer:"192.0.2.1"})).status,404);assert.equal((await f.call({headers:h,path:businessPath+"?userId=tailor-b"})).status,404);
 assert.equal((await f.call({headers:h,method:"PATCH"})).status,405);assert.equal((await f.call({headers:h,body:"x".repeat(16385)})).status,413);
 for(const patch of [{ENABLE_PRODUCT_SESSION_HTTP:undefined},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"}])assert.ok([404,503].includes((await f.call({headers:h,settings:{...env,...patch}})).status));
 f.setFailure("read");const unavailable=await f.call({headers:h});assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{error:"business_unavailable"});
}));
test("shared PostgreSQL limiter fails closed, emits Retry-After and uses independent business/authentication bucket keys",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.call({headers:h});await f.call({headers:h,body:{operation:"create",name:"Studio"}});
 const loginPolicy=localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID).login;
 for(const [kind,identity]of [["ip","127.0.0.1"],["account","tailor-a@example.invalid"]]){const digest="rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1","login",loginPolicy.version,kind,identity])).digest("hex");assert.ok(!f.buckets.includes(digest));}
 assert.equal(new Set(f.buckets).size,4);f.setBudget("deny");const limited=await f.call({headers:h});assert.equal(limited.status,429);assert.equal(limited.headers.get("retry-after"),"5");f.setBudget("failure");assert.equal((await f.call({headers:h})).status,503);
}));

test("rename permission/commit failures preserve the previous profile and all ownership links",async()=>development(async()=>{
 const f=await fixture(),h=await f.login();await f.service.write(h,{operation:"create",name:"Original Studio"});
 const original=structuredClone({business:f.rows().business,members:f.rows().businessMember,sessions:f.rows().session});
 for(const failure of ["rename","commit"]){f.setFailure(failure);await assert.rejects(f.service.write(h,{operation:"rename",name:"Changed Studio"}),e=>e.code==="unavailable");assert.deepEqual({business:f.rows().business,members:f.rows().businessMember,sessions:f.rows().session},original);}
 f.setFailure("member-read");await assert.rejects(f.service.read(h),e=>e.code==="unavailable");
}));

test("account denial after IP allowance returns numeric Retry-After; missing IP retry data fails closed",async()=>development(async()=>{
 const f=await fixture(),headers=await f.login();f.setBudget("account-deny");
 const limited=await f.call({headers});assert.equal(f.buckets.length,2);assert.equal(limited.status,429);
 const retry=limited.headers.get("retry-after");assert.match(retry,/^[1-9][0-9]*$/);assert.equal(Number(retry),5);
 assert.deepEqual(await limited.json(),{error:"rate_limited"});assert.equal(f.rows().business.length,0);
 const malformed=await fixture(),otherHeaders=await malformed.login();malformed.setBudget("missing-ip-retry");
 const unavailable=await malformed.call({headers:otherHeaders});assert.equal(malformed.buckets.length,1);
 assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get("retry-after"),null);
 assert.deepEqual(await unavailable.json(),{error:"business_unavailable"});assert.equal(malformed.rows().business.length,0);
}));
