import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import "../../scripts/register-server-only.mjs";
const {createLocalPasswordResetDispatcher}=await import("../../lib/product-auth/password-reset-http.server.ts");
const {sessionConnectionFromSocket}=await import("../../lib/product-auth/session-http.server.ts");
const {createNextPasswordResetHandler}=await import("../../lib/product-auth/registration-next.server.ts");
import {resetPaths} from "../../lib/auth/password-reset-contract.ts";
const env={NODE_ENV:"development",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",ENABLE_PRODUCT_PASSWORD_RESET_HTTP:"true",PRODUCT_RESET_RATE_POLICY_CONFIRMED:"true",
 PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:3000",PRODUCT_SESSION_HTTP_AUTH_SECRET:"synthetic-auth-secret-more-than-32-characters",PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_EMAIL_VERIFIER_KEY_ID:"v",PRODUCT_EMAIL_VERIFIER_KEY:Buffer.alloc(32,1).toString("base64"),PRODUCT_EMAIL_OUTBOX_KEY_ID:"o",PRODUCT_EMAIL_OUTBOX_KEY:Buffer.alloc(32,2).toString("base64"),
 PRODUCT_RESET_RATE_POLICY:JSON.stringify({version:"local-reset-offline",account:{capacity:6,refillIntervalMs:60000},ip:{capacity:20,refillIntervalMs:15000}})};
const prior=process.env.NODE_ENV;process.env.NODE_ENV="development";test.after(()=>{if(prior===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior;});
function fixture(){let decision="allow",calls=[],queries=0,spending=0;const socket=new Socket();Object.defineProperty(socket,"remoteAddress",{value:"127.0.0.1"});const peer=sessionConnectionFromSocket(socket);socket.destroy();
 const db={$queryRaw:async parts=>{queries++;if(parts.join("").includes("current_database"))return [{database:"stitchtrack_product_test",role:"stitchtrack_product_test_app",namespace:"product",safe:true}];if(decision==="failure")throw new Error("private");spending++;return [{allowed:decision==="allow"||decision==="account-deny"&&spending===1,retryAfterSeconds:decision==="account-deny"&&spending>1?1:9}];}};
 const service={request:async x=>{calls.push(["request",x]);},check:async x=>{calls.push(["check",x]);return false;},complete:async x=>{calls.push(["complete",x]);return true;}};
 const dispatch=createLocalPasswordResetDispatcher(db,env,Buffer.alloc(32,3),{service});
 const call=(op,body,headers={})=>dispatch(new Request(env.PRODUCT_SESSION_HTTP_ORIGIN+resetPaths[op],{method:"POST",headers:{host:"127.0.0.1:3000",origin:env.PRODUCT_SESSION_HTTP_ORIGIN,"content-type":"application/json",...headers},body:JSON.stringify(body)}),op,peer);
 return {call,calls,setDecision:x=>decision=x,queries:()=>queries,dispatch,peer,db,service};
}
test("request is neutral for every account; strict canonical body and no cookies; check/complete use existing contracts",async()=>{
 const f=fixture();const responses=[];for(const email of [" Known@EXAMPLE.INVALID ","unknown@example.invalid","client@example.invalid"]){const r=await f.call("request",{email});assert.equal(r.status,202);responses.push(await r.text());assert.equal(r.headers.has("set-cookie"),false);}
 assert.equal(new Set(responses).size,1);assert.equal(f.calls[0][1].email,"known@example.invalid");assert.equal((await f.call("check",{email:"known@example.invalid",otp:"000001"})).status,400);
 const password=" Exact synthetic password ";const r=await f.call("complete",{email:"known@example.invalid",otp:"000001",password});assert.equal(r.status,200);assert.equal(r.headers.has("set-cookie"),false);assert.equal(f.calls.at(-1)[1].password,password);
});
test("Origin, forwarded metadata, validation, IP denial and unavailable store fail closed before reset writes",async()=>{
 const f=fixture();assert.equal((await f.call("request",{email:"invalid"})).status,422);assert.equal((await f.call("request",{email:"a@example.invalid",extra:true})).status,422);
 assert.equal((await f.call("request",{email:"a@example.invalid"},{origin:"http://evil.invalid"})).status,403);assert.equal((await f.call("request",{email:"a@example.invalid"},{"x-forwarded-for":"127.0.0.1"})).status,403);
 f.setDecision("deny");const r=await f.call("request",{email:"a@example.invalid"});assert.equal(r.status,429);assert.equal(r.headers.get("retry-after"),"9");
 f.setDecision("failure");assert.equal((await f.call("request",{email:"a@example.invalid"})).status,503);assert.equal(f.calls.length,0);
 const request=new Request(env.PRODUCT_SESSION_HTTP_ORIGIN+resetPaths.request,{method:"POST"});assert.equal((await f.dispatch(request,"request",{...f.peer})).status,404);
});
test("missing configuration and production cannot enable reset; actual Node handler is inert when flag is off",async()=>{
 const f=fixture();for(const patch of [{PRODUCT_RESET_RATE_POLICY_CONFIRMED:undefined},{ENABLE_PRODUCT_PASSWORD_RESET_HTTP:undefined},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_LOCAL_HTTP_CONFIRMED:undefined}])assert.throws(()=>createLocalPasswordResetDispatcher(f.db,{...env,...patch},Buffer.alloc(32,3),{service:f.service}));
 let initialized=false,body="",status;const res={writableEnded:false,destroyed:false,setHeader(){},writeHead(s){status=s;},end(s){body=s;this.writableEnded=true;}};
 await createNextPasswordResetHandler("request",{environment:()=>({...env,ENABLE_PRODUCT_PASSWORD_RESET_HTTP:"false"}),runtime:async()=>{initialized=true;throw new Error();}})({},res);
 assert.equal(initialized,false);assert.equal(res.statusCode,404);assert.equal(JSON.parse(body).error,"not_found");
 process.env.NODE_ENV="production";try{assert.throws(()=>createLocalPasswordResetDispatcher(f.db,env,Buffer.alloc(32,3),{service:f.service}));}finally{process.env.NODE_ENV="development";}
});

test("account denial respects the already-spent IP refill deadline and reset errors reveal no details",async()=>{
 const f=fixture();f.setDecision("account-deny");const denied=await f.call("request",{email:"known@example.invalid"});
 assert.equal(denied.status,429);assert.equal(denied.headers.get("retry-after"),"9");assert.equal(f.calls.length,0);
 const {ProductAuthError}=await import("../../lib/product-auth/secrets.server.ts");
 const g=fixture(),body={email:"known@example.invalid",otp:"000001",password:" Exact synthetic password "};
 g.service.complete=async()=>{throw new ProductAuthError("password_rejected");};
 const breached=await g.call("complete",body);assert.equal(breached.status,422);assert.deepEqual(await breached.json(),{error:"password_rejected"});
 g.service.complete=async()=>{throw new Error("Synthetic private provider detail");};
 const failed=await g.call("complete",body);assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:"reset_unavailable"});assert.equal(failed.headers.has("set-cookie"),false);
});
