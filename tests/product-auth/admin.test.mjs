// Offline real Better Auth/session adapter with injected PostgreSQL behavior.
// No database connection, listener, assignment, email or browser is executed.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {IncomingMessage} from "node:http";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {createAdministratorService,createLocalAdminDispatcher}=await import("../../lib/product-auth/admin.server.ts");
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {createLocalSessionDispatcher}=await import("../../lib/product-auth/session-https.server.ts");
const {sessionConnectionFromSocket}=await import("../../lib/product-auth/session-http.server.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const {createNextAdminResponse}=await import("../../lib/product-auth/registration-next.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const {signupSchema}=await import("../../lib/auth/schemas.ts");
const {PRODUCT_MIGRATIONS,assertProductMigrationFiles}=await import("../../prisma/product/migration-files.ts");
const origin="http://127.0.0.1:3000",password=" Exact synthetic admin password ",encoded=await hashPassword(password);
const env={NODE_ENV:"development",ENABLE_PRODUCT_ADMIN_HTTP:"true",ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",
 PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SINGLE_ORIGIN_RUN_ID:"96550bf8-b9c4-4af0-8c6c-92d43e4dab8e",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-signing-secret-for-administrator-test-only",
 PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
async function fixture(){
 const f=fakeProduct({sessionAccess:true});let budget="allow",protectedRole=true,summaryFailure=false;const raw=f.client.$queryRaw,spent=[];
 for(const [id,isAdministrator] of [["admin",true],["tailor",false]]){
  await f.client.user.create({data:{id,name:"Synthetic "+id,email:id+"@example.invalid",emailVerified:true,isAdministrator}});
  await f.client.account.create({data:{id:id+"-credential",userId:id,accountId:id,providerId:"credential",password:encoded}});
 }
 f.client.$queryRaw=async(parts,...values)=>{
  const sql=parts.join("?");
  if(sql.includes('INSERT INTO "product"."AuthRateBucket"')){spent.push(values[0]);if(budget==="failure")throw new Error("private storage error");return [{allowed:budget!=="deny",retryAfterSeconds:4}];}
  if(sql.includes('AS "roleProtected"')){assert.equal(f.inTransaction(),true);assert.equal(f.events.at(-1),"user.lock");return f.rows().user.filter(u=>u.id===values[0]).map(u=>({isAdministrator:u.isAdministrator,roleProtected:protectedRole}));}
  if(sql.includes('AS "activeSessions"')){assert.equal(f.inTransaction(),true);if(summaryFailure)throw new Error("private database error");return [{activeSessions:f.rows().session.filter(s=>s.expiresAt>new Date()).length,pendingDeletionRequests:f.rows().user.filter(u=>u.deletionRequestedAt).length,generatedAt:new Date()}];}
  return raw(parts,...values);
 };
 const sessions=createSessionService(f.client,{mode:"test",authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY,"base64"),origin,expiresInSeconds:604800,renewal:"none"});
 const login=async(id="admin")=>{const result=await sessions.login({email:id+"@example.invalid",password});return result.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");};
 const service=createAdministratorService(f.client,sessions);
 async function call(operation="page",{cookie,body="{}",headers={},rawHeaders,method=operation==="page"?"GET":"POST",path=operation==="page"?"/admin":"/api/internal/tailor-session/admin-summary",settings=env,peer="127.0.0.1",local="127.0.0.1"}={}){
  const socket=new Socket();for(const [k,v]of Object.entries({remoteAddress:peer,localAddress:local,localPort:3000}))Object.defineProperty(socket,k,{value:v});
  const request=new IncomingMessage(socket);request.method=method;request.url=path;
  request.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3000",...(method==="POST"?{origin,"content-type":"application/json"}:{}),...(cookie?{cookie}:{}),...headers}).flat();
  // Next's synthetic headers cannot grant privilege or become transport metadata.
  request.headers={"x-forwarded-for":"127.0.0.1",role:"administrator"};
  if(method==="POST")request.push(body);request.push(null);
  try{return await createNextAdminResponse(operation,{environment:()=>settings,runtime:async e=>createLocalAdminDispatcher(f.client,e,Buffer.alloc(32,8))})(request);}
  finally{request.destroy();socket.destroy();}
 }
 return {...f,sessions,service,login,call,spent,setBudget:v=>budget=v,setProtected:v=>protectedRole=v,setFailure:v=>summaryFailure=v};
}
test("server-controlled administrator can open the exact /admin URL and request only aggregate security counts",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login();
 assert.equal((await f.call("page",{cookie})).status,200);
 const before=structuredClone(f.rows()),result=await f.call("summary",{cookie});assert.equal(result.status,200);
 const summary=await result.json();assert.deepEqual(Object.keys(summary).sort(),["activeSessions","generatedAt","pendingDeletionRequests"]);
 assert.equal(summary.activeSessions,1);assert.equal(summary.pendingDeletionRequests,0);assert.deepEqual(f.rows(),before);
 assert.equal(result.headers.get("cache-control"),"no-store");assert.equal(result.headers.has("set-cookie"),false);
 assert.ok(f.spent.every(k=>/^rl:v1:[a-f0-9]{64}$/u.test(k)));
}));
test("ordinary tailor copying the same URL or calling the API directly is refused with 403",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login("tailor");
 for(const op of ["page","summary"]){const result=await f.call(op,{cookie});assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:"forbidden"});}
}));
test("missing, revoked, expired, unverified, disabled, deletion-locked and passwordless identities cannot administer",async()=>development(async()=>{
 for(const condition of ["missing","revoked","expired","unverified","disabled","deletion","passwordless"]){
  const f=await fixture(),cookie=condition==="missing"?undefined:await f.login(),user=f.rows().user[0];
  if(condition==="revoked")f.rows().session.length=0;
  if(condition==="expired")f.rows().session[0].expiresAt=new Date(0);
  if(condition==="unverified")user.emailVerified=false;
  if(condition==="disabled")user.disabledAt=new Date();
  if(condition==="deletion")user.deletionRequestedAt=new Date();
  if(condition==="passwordless")f.rows().account=f.rows().account.filter(a=>a.userId!=="admin");
  for(const op of ["page","summary"])assert.equal((await f.call(op,{cookie})).status,401,condition);
 }
}));
test("signup, JSON, query strings, cookies, frontend and header role claims cannot grant administration",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login("tailor");
 assert.equal(signupSchema.safeParse({name:"Synthetic",email:"new@example.invalid",password,isAdministrator:true}).success,false);
 for(const body of ['{"isAdministrator":true}','{"role":"admin"}','{"userId":"admin"}'])assert.equal((await f.call("summary",{cookie,body})).status,422);
 assert.equal((await f.call("page",{cookie:cookie+"; isAdministrator=true; role=admin",headers:{"x-role":"admin","x-user-id":"admin"}})).status,403);
 assert.equal((await f.call("page",{cookie,path:"/admin?role=admin"})).status,400);
 assert.equal((await f.call("summary",{cookie,headers:{"x-role":"admin"}})).status,403);
}));
test("fresh transaction checks refuse role revocation or account locking between lookup and action",async()=>development(async()=>{
 for(const kind of ["role","locked","revoked"]){
  const f=await fixture(),cookie=await f.login(),lookup=f.sessions.lookup;
  f.sessions.lookup=async headers=>{const result=await lookup(headers);if(kind==="role")f.rows().user[0].isAdministrator=false;else if(kind==="locked")f.rows().user[0].disabledAt=new Date();else f.rows().session.length=0;return result;};
  assert.equal((await f.service.request(new Headers({cookie}),true)).status,kind==="role"?403:401);
 }
}));
test("default-off, production, development-database and unprotected role configuration fail closed",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login();
 for(const patch of [{ENABLE_PRODUCT_ADMIN_HTTP:undefined},{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_LOCAL_HTTP_CONFIRMED:undefined},{PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:undefined}])assert.ok((await f.call("page",{cookie,settings:{...env,...patch}})).status>=400);
 f.setProtected(false);assert.equal((await f.call("page",{cookie})).status,503);
 const old=process.env.NODE_ENV;process.env.NODE_ENV="production";try{assert.equal((await f.call("page",{cookie})).status,404);}finally{process.env.NODE_ENV=old;}
}));
test("socket/raw-header protections, exact method and CSRF checks apply to page and action",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login();
 for(const header of ["forwarded","x-real-ip","x-forwarded-for"])assert.equal((await f.call("page",{cookie,headers:{[header]:"127.0.0.1"}})).status,403);
 assert.equal((await f.call("page",{cookie,rawHeaders:["Host","127.0.0.1:3000","host","127.0.0.1:3000"]})).status,400);
 for(const options of [{peer:"192.0.2.1"},{local:"0.0.0.0"},{headers:{host:"outside.invalid"}}])assert.equal((await f.call("page",{cookie,...options})).status,404);
 assert.equal((await f.call("summary",{cookie,headers:{origin:"http://outside.invalid"}})).status,403);
 assert.equal((await f.call("summary",{cookie,headers:{"sec-fetch-site":"cross-site"}})).status,403);
 assert.equal((await f.call("summary",{cookie,method:"GET"})).status,405);
 assert.equal((await f.call("summary",{cookie,body:"x".repeat(16385)})).status,413);
}));
test("PostgreSQL budget, query and commit failures cannot disclose data or claim success",async t=>development(async()=>{
 const logs=[];for(const key of ["log","error","warn"])t.mock.method(console,key,(...args)=>logs.push(args));
 const f=await fixture(),cookie=await f.login(),before=structuredClone(f.rows());
 f.setBudget("deny");const denied=await f.call("summary",{cookie});assert.equal(denied.status,429);assert.equal(denied.headers.get("retry-after"),"4");
 f.setBudget("failure");assert.equal((await f.call("summary",{cookie})).status,503);f.setBudget("allow");
 f.setFailure(true);const failure=await f.call("summary",{cookie});assert.equal(failure.status,503);assert.deepEqual(await failure.json(),{error:"administration_unavailable"});f.setFailure(false);
 const transaction=f.client.$transaction;f.client.$transaction=async callback=>{await transaction(callback);throw new Error("private commit error");};
 assert.equal((await f.call("summary",{cookie})).status,503);assert.deepEqual(f.rows(),before);assert.deepEqual(logs,[]);
}));
test("existing session policy, digest storage and ordinary logout are unchanged",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login("tailor"),session=f.rows().session[0],expiry=+session.expiresAt;
 assert.match(session.token,/^hmac-sha256:v1:[a-f0-9]{64}$/u);assert.ok(Math.abs(expiry-Date.now()-604800000)<5000);
 assert.equal((await f.call("page",{cookie})).status,403);assert.ok((await f.sessions.lookup(new Headers({cookie}))).session);assert.equal(+f.rows().session[0].expiresAt,expiry);
 await f.sessions.logout(new Headers({cookie}));assert.equal((await f.call("page",{cookie})).status,401);
}));
test("migration checksums and proposals isolate the role and never grant it to runtime or signup",()=>{
 assertProductMigrationFiles();const name="20261102_user_administrator",sql=readFileSync(new URL("../../prisma/product/migrations/"+name+"/migration.sql",import.meta.url),"utf8");
 assert.equal(createHash("sha256").update(sql).digest("hex"),PRODUCT_MIGRATIONS[name]);assert.match(sql,/BOOLEAN NOT NULL DEFAULT false/);assert.doesNotMatch(sql,/stitchtrack_product_dev/);
 for(const file of ["admin-test-permissions.sql","admin-role-test.sql"]){const source=readFileSync(new URL("../../prisma/product/setup/"+file,import.meta.url),"utf8");for(const hash of Object.values(PRODUCT_MIGRATIONS))assert.ok(source.includes(hash));assert.doesNotMatch(source,/stitchtrack_product_dev/);}
 const permissions=readFileSync(new URL("../../prisma/product/setup/admin-test-permissions.sql",import.meta.url),"utf8");assert.match(permissions,/REVOKE INSERT ON product\."User"/);assert.doesNotMatch(permissions,/GRANT UPDATE/);
 const page=readFileSync(new URL("../../pages/api/internal/tailor-session/admin-page.ts",import.meta.url),"utf8");assert.match(page,/administratorPageResponse/);assert.match(page,/createNextAdminResponse\("page"\)/);assert.doesNotMatch(page,/localStorage|sessionStorage|document.cookie|userId/);
});

test("actual Prisma compiler omits the database-only role default on ordinary User creation",async()=>{
 const {default:pg}=await import("pg"),{PrismaPg}=await import("@prisma/adapter-pg"),{PrismaClient}=await import("../../prisma/product/generated/client.ts");
 const pool=new pg.Pool({host:"127.0.0.1",database:"offline-only-no-connection"});
 pool.connect=async()=>assert.fail("Admin default test must never connect");
 const sql=[];
 pool.query=async query=>{sql.push(query.text);return {fields:[{name:"id",dataTypeID:25}],rows:[["offline-created"]],rowCount:1};};
 const client=new PrismaClient({adapter:new PrismaPg(pool,{schema:"product"}),log:[]});
 try{
  await client.user.create({data:{id:"offline-created",name:"Synthetic",email:"synthetic@example.invalid"},select:{id:true}});
  assert.equal(sql.length,1);assert.match(sql[0],/INSERT INTO/);assert.doesNotMatch(sql[0].split("VALUES")[0],/"isAdministrator"/);
 }finally{await client.$disconnect();await pool.end();}
});

test("rewritten admin page and its direct API alias retain the same authorization and status",async()=>development(async()=>{
 const {administratorPageResponse}=await import("../../lib/product-auth/admin-page.server.ts");
 for(const [identity,status]of [["admin",200],["tailor",403],[null,401]]){
  const f=await fixture(),cookie=identity?await f.login(identity):undefined;
  for(const path of ["/admin","/api/internal/tailor-session/admin-page"]){
   const result=await administratorPageResponse(await f.call("page",{cookie,path}));
   assert.equal(result.status,status);assert.match(result.headers.get("content-type"),/^text\/html/);assert.equal(result.headers.get("cache-control"),"no-store");
   const html=await result.text();assert.equal(html.includes('id="refresh"'),status===200);assert.equal(html.includes('<script>'),status===200);
   assert.doesNotMatch(html,/example.invalid|hmac-sha256|offline-signing-secret/);
  }
 }
}));
test("HTML renderer fails closed on unexpected success and pins only its fixed, public script",async()=>{
 const {administratorPageResponse}=await import("../../lib/product-auth/admin-page.server.ts");
 const bad=await administratorPageResponse(Response.json({userId:"not-an-authorization"}));assert.equal(bad.status,503);
 const result=await administratorPageResponse(Response.json({authorized:true}));const html=await result.text(),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 assert.ok(result.headers.get("content-security-policy").includes("'sha256-"+createHash("sha256").update(script).digest("base64")+"'"));
 assert.match(script,/textContent/);assert.doesNotMatch(script,/innerHTML|document.cookie|localStorage|sessionStorage|import\s|PRODUCT_/);
 const config=readFileSync(new URL("../../next.config.ts",import.meta.url),"utf8");assert.match(config,/source: "\/admin", destination: "\/api\/internal\/tailor-session\/admin-page"/);
});

test("normal session lookup advertises only freshly authorized administration, and remains default-off",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login();
 async function lookup(settings=env,credential=cookie){
  const socket=new Socket();Object.defineProperty(socket,"remoteAddress",{value:"127.0.0.1"});
  try{
   const dispatch=createLocalSessionDispatcher(f.client,{env:settings,identifierKey:Buffer.alloc(32,8),policy:localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID)});
   return await dispatch(new Request(origin+"/api/internal/tailor-session/session",{headers:{host:"127.0.0.1:3000",...(credential?{cookie:credential}:{})}}),"session",sessionConnectionFromSocket(socket));
  }finally{socket.destroy();}
 }
 assert.equal((await (await lookup()).json()).administration,true);
 assert.equal((await (await lookup({...env,ENABLE_PRODUCT_ADMIN_HTTP:"false"})).json()).administration,undefined);
 const ordinary=await f.login("tailor");assert.equal((await (await lookup(env,ordinary)).json()).administration,false);
 f.rows().user[0].isAdministrator=false;assert.equal((await (await lookup()).json()).administration,false);
 assert.equal((await f.call("page",{cookie})).status,403);assert.equal((await f.call("summary",{cookie})).status,403);
 f.rows().user[0].isAdministrator=true;f.setProtected(false);assert.equal((await (await lookup()).json()).administration,false);
 f.setProtected(true);f.rows().user[0].disabledAt=new Date();assert.equal((await lookup()).status,401);
 assert.equal((await lookup(env,"")).status,401);
}));
test("admin HTML shows login navigation for 401 only among authorized and refused responses",async()=>{
 const {administratorPageResponse}=await import("../../lib/product-auth/admin-page.server.ts");
 for(const status of [200,401,403,404,503]){
  const result=await administratorPageResponse(Response.json(status===200?{authorized:true}:{error:"refused"},{status}));
  assert.equal(result.status,status);const html=await result.text();
  assert.equal(html.includes('Return to login'),![200,403].includes(status));
  if(status===403)assert.match(html,/Access refused. Administrator permission is required./);
 }
});
