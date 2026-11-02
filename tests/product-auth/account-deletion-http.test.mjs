// Offline boundary/Node-stream tests; actual Better Auth, socket and persistence doubles.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {Readable} from "node:stream";
import {createHmac} from "node:crypto";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const externalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("External requests forbidden in offline deletion tests");
test.after(()=>{globalThis.fetch=externalFetch;});
import {accountDeletionPath} from "../../lib/auth/account-deletion-contract.ts";
const {createLocalAccountDeletionDispatcher}=await import("../../lib/product-auth/account-deletion-http.server.ts");
const {createNextAccountDeletionHandler}=await import("../../lib/product-auth/registration-next.server.ts");
const {sessionConnectionFromSocket}=await import("../../lib/product-auth/session-http.server.ts");
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const origin="http://127.0.0.1:3000",password=" Exact synthetic deletion password ",hash=await hashPassword(password),key=Buffer.alloc(32,7);
const env={NODE_ENV:"development",ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP:"true",ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",
 PRODUCT_SESSION_HTTP_ORIGIN:origin,PRODUCT_SINGLE_ORIGIN_RUN_ID:"a1ca284a-18e6-4d5f-a41e-c0257a623e2f",PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-deletion-http-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,8).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const prior=process.env.NODE_ENV;process.env.NODE_ENV="development";test.after(()=>{if(prior===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior;});
function socket(){const s=new Socket();Object.defineProperties(s,{remoteAddress:{value:"127.0.0.1"},localAddress:{value:"127.0.0.1"},localPort:{value:3000}});return s;}
async function fixture(){
 const f=fakeProduct({sessionAccess:true});await f.client.user.create({data:{id:"synthetic-deletion-user",email:"deletion@example.invalid",name:"Synthetic deletion account",emailVerified:true}});
 await f.client.account.create({data:{id:"synthetic-deletion-account",userId:"synthetic-deletion-user",accountId:"synthetic-deletion-user",providerId:"credential",password:hash}});
 const query=f.client.$queryRaw,buckets=[];let decision="allow",spends=0;
 f.client.$queryRaw=async(parts,...values)=>{if(parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')){buckets.push(values[0]);spends++;if(decision==="error")throw new Error("synthetic private database error");return [{allowed:decision==="allow"||decision==="account-deny"&&spends===1,retryAfterSeconds:decision==="account-deny"&&spends>1?1:9}];}return query(parts,...values);};
 const sessions=createSessionService(f.client,{mode:"test",origin,authSecret:env.PRODUCT_SESSION_HTTP_AUTH_SECRET,sessionTokenKey:Buffer.alloc(32,8),expiresInSeconds:604800,renewal:"none"});
 const login=await sessions.login({email:"deletion@example.invalid",password}),cookie=login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
 const s=socket(),connection=sessionConnectionFromSocket(s);s.destroy();const dispatch=createLocalAccountDeletionDispatcher(f.client,env,key);
 const call=(body={password},headers={},path=accountDeletionPath)=>dispatch(new Request(origin+path,{method:"POST",headers:{host:"127.0.0.1:3000",origin,"content-type":"application/json",cookie,...headers},body:JSON.stringify(body)}),connection);
 return {...f,sessions,cookie,connection,dispatch,buckets,call,decision:value=>{decision=value;spends=0;}};
}
test("real deletion boundary issues only a confirmation and clearing cookie; rate keys use the authenticated email and existing login policy",async()=>{
 const f=await fixture(),r=await f.call();assert.equal(r.status,200);assert.deepEqual(await r.json(),{requested:true});assert.match(r.headers.get("set-cookie"),/Max-Age=0/);assert.equal(r.headers.get("cache-control"),"no-store");
 const digest="rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1","login",localSessionRatePolicy(env.PRODUCT_SINGLE_ORIGIN_RUN_ID).login.version,"account","deletion@example.invalid"])).digest("hex");assert.ok(f.buckets.includes(digest));
 const repeat=await f.call();assert.equal(repeat.status,401);assert.deepEqual(await repeat.json(),{error:"invalid_credentials"});assert.equal(f.rows().session.length,0);
});
test("CSRF, forwarding metadata, browser targets, oversized bodies and untrusted connections cannot reach a deletion write",async()=>{
 const f=await fixture();assert.equal((await f.call({password},{host:"evil.invalid"})).status,404);assert.equal((await f.call({password},{origin:"http://evil.invalid"})).status,403);assert.equal((await f.call({password},{"x-forwarded-for":"127.0.0.1"})).status,403);
 assert.equal((await f.call({password,userId:"some-other-user"})).status,422);assert.equal((await f.call({password,authorized:true})).status,422);
 assert.equal((await f.call({password:"x".repeat(20000)})).status,413);assert.equal((await f.call({password},{},accountDeletionPath+"?userId=other")).status,404);
 assert.equal((await f.dispatch(new Request(origin+accountDeletionPath,{method:"POST"}),{...f.connection})).status,404);assert.equal(f.rows().user[0].deletionRequestedAt,null);
});
test("wrong password and missing session have generic refusals; shared-store failures/denials cannot bypass protection",async()=>{
 const f=await fixture();for(const [body,headers]of [[{password:"wrong synthetic password"},{}],[{password},{cookie:""}]]){const r=await f.call(body,headers);assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:"invalid_credentials"});}
 for(const decision of ["deny","account-deny","error"]){f.decision(decision);const r=await f.call();assert.equal(r.status,decision==="error"?503:429);if(decision!=="error")assert.equal(r.headers.get("retry-after"),"9");assert.equal(r.headers.has("set-cookie"),false);}
 assert.equal(f.rows().user[0].deletionRequestedAt,null);assert.equal(f.rows().session.length,1);
});
function response(){const headers=new Map();let text="";const res={destroyed:false,writableEnded:false,statusCode:0,setHeader(k,v){headers.set(k,v);},end(data){text=Buffer.from(data??"").toString();res.writableEnded=true;}};return {res,headers,text:()=>text};}
test("actual Node API wrapper is default-off, production-refused and forwards separate clearing cookies only on a successful guarded POST",async()=>{
 for(const patch of [{ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP:"false"},{ENABLE_PRODUCT_SESSION_HTTP:"false"},{PRODUCT_DATABASE_MODE:"development"},
  {PRODUCT_LOCAL_HTTP_CONFIRMED:"false"},{PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:4000",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true"}])
  assert.throws(()=>createLocalAccountDeletionDispatcher(fakeProduct().client,{...env,...patch},key));
 let initialized=0;let out=response();await createNextAccountDeletionHandler({environment:()=>({...env,ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP:"false"}),runtime:async()=>{initialized++;throw new Error();}})({},out.res);assert.equal(out.res.statusCode,404);assert.equal(initialized,0);
 const f=await fixture(),request=Readable.from([Buffer.from(JSON.stringify({password}))]),s=socket();Object.assign(request,{socket:s,method:"POST",url:accountDeletionPath,rawHeaders:["Host","127.0.0.1:3000","Origin",origin,"Content-Type","application/json","Cookie",f.cookie]});
 out=response();await createNextAccountDeletionHandler({environment:()=>env,runtime:async()=>f.dispatch})(request,out.res);s.destroy();assert.equal(out.res.statusCode,200);assert.ok(Array.isArray(out.headers.get("set-cookie")));assert.deepEqual(JSON.parse(out.text()),{requested:true});
 process.env.NODE_ENV="production";try{out=response();await createNextAccountDeletionHandler({environment:()=>env,runtime:async()=>{throw new Error();}})({},out.res);assert.equal(out.res.statusCode,404);assert.throws(()=>createLocalAccountDeletionDispatcher(f.client,env,key));}finally{process.env.NODE_ENV="development";}
});
