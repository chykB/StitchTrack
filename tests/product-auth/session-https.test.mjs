// OFFLINE ONLY: IncomingMessage/TLS doubles and deterministic DB time; no listen/connect.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {TLSSocket} from "node:tls";
import {IncomingMessage} from "node:http";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {createLocalSessionHttpsHandler,createLocalSessionHttpsServer}=await import("../../lib/product-auth/session-https.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const password=" Exact synthetic HTTPS password ",encoded=await hashPassword(password);
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",
  PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:"https://127.0.0.1:3443",
  PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-https-cookie-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
  PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
// Proposed LOCAL-TEST numbers, never factory defaults or approved production policy.
const ip={capacity:10,refillIntervalMs:15000};
const policy={login:{version:"local-offline-login",ip,account:{capacity:3,refillIntervalMs:60000}},
  session:{version:"local-offline-session",ip},logout:{version:"local-offline-logout",ip}};
const options={env,policy,identifierKey:Buffer.alloc(32,19)};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("No external requests allowed");
test.after(()=>{globalThis.fetch=originalFetch;});
async function fixture(currentOptions=options) {
  const f=fakeProduct({sessionAccess:true}),buckets=new Map();let now=0,fail=false;const raw=f.client.$queryRaw;
  f.client.$queryRaw=async(parts,...values)=>{
    if(!parts.join("").includes('INSERT INTO "product"."AuthRateBucket"'))return raw(parts,...values);
    if(fail)throw new Error("private database error");
    const [key,capacity,interval]=values;assert.match(key,/^rl:v1:[a-f0-9]{64}$/u);
    let row=buckets.get(key);
    if(!row){row={tokens:capacity,refilled:now,capacity,interval};buckets.set(key,row);}
    if(row.capacity!==capacity || row.interval!==interval)return [];
    const gained=Math.floor((now-row.refilled)/interval);row.tokens=Math.min(capacity,row.tokens+gained);row.refilled+=gained*interval;
    const allowed=row.tokens>0;if(allowed)row.tokens--;
    return [{allowed,retryAfterSeconds:row.tokens>0?1:Math.max(1,Math.ceil((row.refilled+interval-now)/1000))}];
  };
  await f.client.user.create({data:{id:"https-synthetic",email:"synthetic@example.invalid",name:"Synthetic HTTPS tailor",emailVerified:true}});
  await f.client.account.create({data:{id:"https-credential",userId:"https-synthetic",accountId:"https-synthetic",providerId:"credential",password:encoded}});
  const handler=createLocalSessionHttpsHandler(f.client,currentOptions);
  const call=async(operation,{tls=true,finished=true,remote="127.0.0.1",local="127.0.0.1",headers={},body,method=operation==="session"?"GET":"POST"}={})=>{
    const socket=tls?new TLSSocket():new Socket();
    for(const [name,value] of Object.entries({remoteAddress:remote,localAddress:local,localPort:3443}))Object.defineProperty(socket,name,{value});
    if(tls){socket.getProtocol=()=>"TLSv1.3";socket.getPeerFinished=()=>finished?Buffer.alloc(12,1):undefined;}
    const incoming=new IncomingMessage(socket);incoming.method=method;incoming.url="/api/internal/tailor-session/"+operation;
    incoming.rawHeaders=Object.entries({host:"127.0.0.1:3443",origin:env.PRODUCT_SESSION_HTTP_ORIGIN,"content-type":"application/json",...headers}).flat();
    if(!["GET","HEAD"].includes(method))incoming.push(body??JSON.stringify(operation==="login"?{email:" Synthetic@EXAMPLE.INVALID ",password}:{}));incoming.push(null);
    const outgoing={headers:new Map(),statusCode:0,destroyed:false,writableEnded:false,setHeader(k,v){this.headers.set(k.toLowerCase(),v);},end(bytes){this.bytes=bytes;this.writableEnded=true;}};
    try {await handler(incoming,outgoing);return {...outgoing,json:()=>JSON.parse(outgoing.bytes.toString())};}
    finally {incoming.destroy();socket.destroy();}
  };
  return {...f,buckets,call,time:value=>{now=value;},fail:value=>{fail=value;}};
}
const cookie=r=>r.headers.get("set-cookie").map(s=>s.split(";")[0]).join("; ");
test("factories require explicit local HTTPS/policy confirmation, isolated target and independent keys",async()=>{
  const f=await fixture();
  for(const patch of [{PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined},{PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:undefined},{NODE_ENV:"production"},{ENABLE_PRODUCT_SESSION_HTTP:undefined},
    {PRODUCT_SESSION_HTTP_ORIGIN:"http://127.0.0.1:3443"},{PRODUCT_SESSION_HTTP_ORIGIN:"https://localhost:3443"},{PRODUCT_SESSION_HTTP_ORIGIN:"https://127.0.0.1"},
    {PRODUCT_TEST_DATABASE_URL:undefined}]) {
    assert.throws(()=>createLocalSessionHttpsHandler(f.client,{...options,env:{...env,...patch}}));
    assert.throws(()=>createLocalSessionHttpsServer(f.client,{...options,env:{...env,...patch},key:Buffer.alloc(0),cert:Buffer.alloc(0)}));
  }
  assert.throws(()=>createLocalSessionHttpsHandler(f.client,{...options,identifierKey:Buffer.alloc(32,7)}));
  assert.throws(()=>createLocalSessionHttpsHandler(f.client,{...options,policy:{...policy,logout:undefined}}));
  assert.equal(f.buckets.size,0);assert.equal(f.rows().session.length,0);
});
test("direct handler requires the actual loopback socket and completed TLS, rejecting forwarding claims",async()=>{
  const f=await fixture();
  for(const settings of [{tls:false},{finished:false},{remote:"203.0.113.8"},{local:"0.0.0.0"}])assert.equal((await f.call("login",settings)).statusCode,settings.finished===false?503:404);
  for(const header of ["x-forwarded-for","x-real-ip","forwarded","x-forwarded-proto"])assert.equal((await f.call("login",{headers:{[header]:"127.0.0.1"}})).statusCode,403);
  assert.equal(f.buckets.size,0);assert.equal(f.rows().session.length,0);
});
test("real limiter SQL composition enforces account exhaustion and refill with canonical equivalents",async()=>{
  const f=await fixture();for(let i=0;i<3;i++)assert.equal((await f.call("login")).statusCode,200);
  const blocked=await f.call("login",{body:JSON.stringify({email:"synthetic@example.invalid",password})});
  assert.equal(blocked.statusCode,429);assert.equal(blocked.headers.get("retry-after"),"60");assert.equal(f.rows().session.length,3);
  f.time(59999);assert.equal((await f.call("login")).statusCode,429);
  f.time(60000);assert.equal((await f.call("login")).statusCode,200);
});
test("IP budget precedes parsing; no account/credential work on malformed requests or failed storage",async()=>{
  const f=await fixture();for(let i=0;i<10;i++)assert.equal((await f.call("login",{body:"{"})).statusCode,400);
  assert.equal(f.buckets.size,1);assert.equal((await f.call("login",{body:"{"})).statusCode,429);
  f.time(15000);assert.equal((await f.call("login",{body:"{"})).statusCode,400);
  f.fail(true);const failed=await f.call("login");assert.equal(failed.statusCode,503);assert.deepEqual(failed.json(),{error:"authentication_unavailable"});
  assert.equal(f.rows().session.length,0);assert.equal(failed.headers.has("set-cookie"),false);
});
test("HTTPS bridge preserves cookies, authoritative lookup, individual logout, locks and CSRF",async()=>{
  const f=await fixture(),a=await f.call("login"),b=await f.call("login");assert.equal(a.statusCode,200);
  assert.ok(Array.isArray(a.headers.get("set-cookie")));assert.match(a.headers.get("set-cookie")[0],/HttpOnly.*Secure|Secure.*HttpOnly/iu);
  assert.match(a.headers.get("set-cookie")[0],/SameSite=Lax/iu);assert.match(a.headers.get("set-cookie")[0],/Max-Age=604800/u);
  assert.deepEqual(Object.keys(a.json()),["user"]);assert.equal(a.headers.get("cache-control"),"no-store");
  const expiry=f.rows().session[0].expiresAt;
  assert.equal((await f.call("session",{headers:{cookie:cookie(a)}})).statusCode,200);assert.deepEqual(f.rows().session[0].expiresAt,expiry);
  assert.equal((await f.call("logout",{headers:{cookie:cookie(a),origin:"https://evil.invalid"}})).statusCode,403);
  const out=await f.call("logout",{headers:{cookie:cookie(a)}});assert.equal(out.statusCode,200);assert.match(out.headers.get("set-cookie")[0],/Max-Age=0/u);
  assert.equal((await f.call("session",{headers:{cookie:cookie(a)}})).statusCode,401);
  assert.equal((await f.call("session",{headers:{cookie:cookie(b)}})).statusCode,200);
  f.rows().user[0].disabledAt=new Date();assert.equal((await f.call("session",{headers:{cookie:cookie(b)}})).statusCode,401);
});
test("adapter source has only a fixed loopback listen path and no bootstrap, proxy or certificate generation",()=>{
  const source=readFileSync(new URL("../../lib/product-auth/session-https.server.ts",import.meta.url),"utf8");
  assert.ok(source.includes('server.listen({host:"127.0.0.1",port,exclusive:true})'));
  assert.ok(source.includes('sessionConnectionFromSocket(incoming.socket)'));assert.ok(source.includes('candidate === request'));
  assert.ok(source.includes('requestCert:false'));assert.ok(!source.includes('rejectUnauthorized:false'));
  assert.doesNotMatch(source,/console\.|readFile|writeFile|execSync|\.env\.local|createCertificate/u);
});

test("split login denial reports the longer next-token delay across IP and account",async()=>{
  const f=await fixture({...options,policy:{...policy,login:{version:"local-retry-hints",ip:{capacity:2,refillIntervalMs:30000},account:{capacity:1,refillIntervalMs:20000}}}});
  assert.equal((await f.call("login")).statusCode,200);
  const result=await f.call("login");assert.equal(result.statusCode,429);assert.equal(result.headers.get("retry-after"),"30");
});
