// Offline real Better Auth/Argon2id with injected persistence/socket behavior.
// No PostgreSQL connection, listener, SMTP, browser or private configuration.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {IncomingMessage} from "node:http";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {createLocalSessionDispatcher}=await import("../../lib/product-auth/session-https.server.ts");
const {createNextDashboardResponse}=await import("../../lib/product-auth/registration-next.server.ts");
const {loadDashboardAccess}=await import("../../lib/product-auth/dashboard.server.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const origin="http://127.0.0.1:3000",password=" Exact synthetic dashboard password ",hash=await hashPassword(password);
const env={NODE_ENV:"development",ENABLE_LOCAL_AUTH_FRONTEND:"true",ENABLE_PRODUCT_SESSION_HTTP:"true",ENABLE_PRODUCT_ADMIN_HTTP:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SINGLE_ORIGIN_RUN_ID:"f249a598-919d-467c-9948-8a7e67d6191f",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",
 PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-dashboard-signing-secret-not-real",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
async function fixture(){
 const f=fakeProduct({sessionAccess:true}),raw=f.client.$queryRaw;let budget="allow",runtimeCalls=0;
 for(const [id,admin]of [["tailor",false],["administrator",true]]){
  await f.client.user.create({data:{id,name:id==="tailor"?'Synthetic <script>alert("x")</script>':"Synthetic administrator",email:id+"@example.invalid",emailVerified:true,isAdministrator:admin}});
  await f.client.account.create({data:{id:id+"-credential",userId:id,accountId:id,providerId:"credential",password:hash}});
 }
 f.client.$queryRaw=async(parts,...values)=>{
  const sql=parts.join("?");
  if(sql.includes('INSERT INTO "product"."AuthRateBucket"')){if(budget==="failure")throw new Error("private store diagnostic");return [{allowed:budget!=="deny",retryAfterSeconds:5}];}
  if(sql.includes('AS "roleProtected"'))return f.rows().user.filter(u=>u.id===values[0]).map(u=>({isAdministrator:u.isAdministrator,roleProtected:true}));
  return raw(parts,...values);
 };
 const sessions=createSessionService(f.client,{mode:"test",authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY,"base64"),origin,expiresInSeconds:604800,renewal:"none"});
 const login=async(id="tailor")=>{const result=await sessions.login({email:id+"@example.invalid",password});return result.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");};
 async function call({cookie,settings=env,path="/api/internal/tailor-session/dashboard",peer="127.0.0.1",headers={},rawHeaders}={}){
  const socket=new Socket();for(const [key,value]of Object.entries({remoteAddress:peer,localAddress:"127.0.0.1",localPort:3000}))Object.defineProperty(socket,key,{value});
  const request=new IncomingMessage(socket);request.method="GET";request.url=path;
  request.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3000",...(cookie?{cookie}:{}),...headers}).flat();request.push(null);
  request.headers={role:"administrator","x-forwarded-for":"127.0.0.1"};
  try{
   const respond=createNextDashboardResponse({environment:()=>settings,runtime:async actual=>{runtimeCalls++;return createLocalSessionDispatcher(f.client,{env:actual,identifierKey:Buffer.alloc(32,9),policy:localSessionRatePolicy(actual.PRODUCT_SINGLE_ORIGIN_RUN_ID)});}});
   return respond(request);
  }finally{request.destroy();socket.destroy();}
 }
 return {...f,sessions,login,call,setBudget:value=>{budget=value;},runtimeCalls:()=>runtimeCalls};
}
test("the protected dashboard API returns only a current server-verified tailor identity without renewing sessions",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login(),before=structuredClone(f.rows()),r=await f.call({cookie}),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.user.id,"tailor");assert.notEqual(data.administration,true);
 assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.has("set-cookie"),false);assert.deepEqual(f.rows(),before);
 const seen=[];
 const access=await loadDashboardAccess("127.0.0.1:3000",cookie,{environment:env,fetch:async(url,init)=>{seen.push({url,init});return f.call({cookie:init.headers.cookie});}});
 assert.equal(access.kind,"ready");assert.equal(access.session.user.id,"tailor");assert.equal(access.origin,origin);assert.equal(access.accountDeletionEnabled,false);assert.equal(access.passwordResetEnabled,false);
 assert.equal(seen.length,1);assert.equal(seen[0].url,origin+"/api/internal/tailor-session/dashboard");assert.deepEqual(seen[0].init.headers,{cookie});assert.equal(seen[0].init.cache,"no-store");assert.equal(seen[0].init.redirect,"error");
}));
test("administration eligibility is read freshly and revoked privileges never survive a new lookup",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login("administrator");assert.equal((await(await f.call({cookie})).json()).administration,true);
 f.rows().user.find(u=>u.id==="administrator").isAdministrator=false;assert.notEqual((await(await f.call({cookie})).json()).administration,true);
 f.rows().user.find(u=>u.id==="administrator").isAdministrator=true;assert.notEqual((await(await f.call({cookie,settings:{...env,ENABLE_PRODUCT_ADMIN_HTTP:undefined}})).json()).administration,true);
}));
test("missing, expired, revoked, unverified, locked and passwordless sessions cannot populate the dashboard",async()=>development(async()=>{
 for(const kind of ["missing","expired","revoked","unverified","disabled","deletion","passwordless"]){
  const f=await fixture(),cookie=kind==="missing"?undefined:await f.login();
  if(kind==="expired")f.rows().session[0].expiresAt=new Date(0);
  if(kind==="revoked")f.rows().session.length=0;
  if(kind==="unverified")f.rows().user[0].emailVerified=false;
  if(kind==="disabled")f.rows().user[0].disabledAt=new Date();
  if(kind==="deletion")f.rows().user[0].deletionRequestedAt=new Date();
  if(kind==="passwordless")f.rows().account=f.rows().account.filter(a=>a.userId!=="tailor");
  const api=await f.call({cookie});assert.equal(api.status,401,kind);assert.equal(api.headers.has("location"),false);assert.deepEqual(await api.json(),{error:"unauthenticated"});
  let lookups=0;const access=await loadDashboardAccess("127.0.0.1:3000",cookie??null,{environment:env,fetch:async()=>{lookups++;return f.call({cookie});}});
  assert.deepEqual(access,{kind:"login"},kind);assert.equal(lookups,kind==="missing"?0:1);
 }
}));
test("the existing API retains transport, rate-limit and production refusal checks",async()=>development(async()=>{
 const f=await fixture(),cookie=await f.login();assert.equal((await f.call()).status,401);
 assert.equal((await f.call({cookie,path:"/api/internal/tailor-session/dashboard?role=admin"})).status,400);
 assert.equal((await f.call({cookie,headers:{"x-forwarded-for":"127.0.0.1"}})).status,403);
 assert.equal((await f.call({cookie,headers:{origin:"https://outside.invalid"}})).status,403);
 assert.equal((await f.call({cookie,peer:"192.0.2.1"})).status,404);
 assert.equal((await f.call({cookie,rawHeaders:["host","127.0.0.1:3000","Host","127.0.0.1:3000"]})).status,400);
 for(const patch of [{ENABLE_PRODUCT_SESSION_HTTP:undefined},{NODE_ENV:"production"}])assert.equal((await f.call({cookie,settings:{...env,...patch}})).status,404);
 const before=f.runtimeCalls();await f.call({cookie,settings:{...env,ENABLE_PRODUCT_SESSION_HTTP:undefined}});assert.equal(f.runtimeCalls(),before);
 f.setBudget("deny");const limited=await f.call({cookie});assert.equal(limited.status,429);assert.equal(limited.headers.get("retry-after"),"5");
 f.setBudget("failure");const failed=await f.call({cookie});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private store diagnostic/u);
}));
test("the server page fails closed for configuration, storage, redirects and malformed or expired data",async()=>development(async()=>{
 let calls=0;const success=()=>{calls++;return Response.json({user:{id:"synthetic",name:"Synthetic",email:"synthetic@example.invalid"},expiresAt:new Date(Date.now()+60000).toISOString()});};
 for(const patch of [{NODE_ENV:"production"},{ENABLE_PRODUCT_SESSION_HTTP:undefined},{ENABLE_LOCAL_AUTH_FRONTEND:undefined},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_LOCAL_HTTP_CONFIRMED:undefined}])
  assert.deepEqual(await loadDashboardAccess("127.0.0.1:3000","synthetic-cookie",{environment:{...env,...patch},fetch:async()=>success()}),{kind:"disabled"});
 assert.deepEqual(await loadDashboardAccess("outside.invalid","synthetic-cookie",{environment:env,fetch:async()=>success()}),{kind:"disabled"});assert.equal(calls,0);
 for(const response of [()=>Response.json({private:"not for output"},{status:503}),()=>Response.json({private:"not for output"},{status:403}),()=>Response.json({user:{name:"untrusted"}}),()=>{throw Error("private connection diagnostic");}])
  assert.deepEqual(await loadDashboardAccess("127.0.0.1:3000","synthetic-cookie",{environment:env,fetch:async()=>response()}),{kind:"unavailable"});
 assert.deepEqual(await loadDashboardAccess("127.0.0.1:3000","synthetic-cookie",{environment:env,fetch:async()=>Response.json({user:{id:"synthetic",name:"Synthetic",email:"synthetic@example.invalid"},expiresAt:new Date(0).toISOString()})}),{kind:"login"});
 const next=readFileSync(new URL("../../next.config.ts",import.meta.url),"utf8");assert.doesNotMatch(next,/source: "\/dashboard"/u);assert.match(next,/source: "\/admin"/u);
 const page=readFileSync(new URL("../../app/dashboard/page.tsx",import.meta.url),"utf8");assert.match(page,/loadDashboardAccess/u);assert.match(page,/redirect\("\/auth\?login"\)/u);assert.doesNotMatch(page,/userId|searchParams/u);
 const route=readFileSync(new URL("../../pages/api/internal/tailor-session/dashboard.ts",import.meta.url),"utf8");assert.match(route,/bodyParser:false/u);assert.match(route,/createNextDashboardResponse/u);assert.match(route,/sendHttpsResponse\(res,await respond\(req\)\)/u);
}));
