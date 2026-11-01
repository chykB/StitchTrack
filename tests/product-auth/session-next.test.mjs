// Offline Node stream/TLS and PostgreSQL doubles only. Real installed auth/crypto;
// no listener, database, SMTP, fixture operation or browser is run.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {TLSSocket} from "node:tls";
import {IncomingMessage} from "node:http";
import {Writable} from "node:stream";
import {existsSync,readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {transportPlan} from "./https-transport.integration.mjs";
import {createSessionClient} from "../../lib/auth/session-client.ts";
import {createSessionController} from "../../lib/auth/session-controller.ts";
const {createNextSessionHandler}=await import("../../lib/product-auth/registration-next.server.ts");
const {createLocalSessionDispatcher}=await import("../../lib/product-auth/session-https.server.ts");
const {localSessionRatePolicy}=await import("../../lib/product-auth/session-policy.ts");
const {sessionPaths}=await import("../../lib/product-auth/session-http.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const run="b12fc98d-905c-4f0b-a0f6-b9b721869d1d",key=Buffer.alloc(32,17),plan=transportPlan(run,key),origin="https://127.0.0.1:3443";
const password=" Exact synthetic e\u0301 password ",encoded=await hashPassword(password);
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",
 PRODUCT_SINGLE_ORIGIN_CONFIRMED:"true",PRODUCT_SINGLE_ORIGIN_RUN_ID:run,PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-next-session-signing-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
async function development(fn){const old=process.env.NODE_ENV;process.env.NODE_ENV="development";try{return await fn();}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}}
function message(operation,{requestOrigin=origin,method=operation==="session"?"GET":"POST",body,headers={},rawHeaders,tls=requestOrigin.startsWith("https:"),finished=true,local="127.0.0.1",peer="127.0.0.1",port=Number(new URL(requestOrigin).port),path=sessionPaths[operation]}={}) {
 const socket=tls?new TLSSocket():new Socket();for(const [k,v] of Object.entries({localAddress:local,remoteAddress:peer,localPort:port}))Object.defineProperty(socket,k,{value:v});
 if(tls){socket.getProtocol=()=>"TLSv1.3";socket.getPeerFinished=()=>finished?Buffer.alloc(12,1):undefined;}
 const req=new IncomingMessage(socket);req.method=method;req.url=path;
 req.rawHeaders=rawHeaders??Object.entries({host:new URL(requestOrigin).host,...(method==="GET"?{}:{origin:requestOrigin,"content-type":"application/json"}),...headers}).flat();
 req.headers={host:"spoofed.invalid",origin:"https://spoofed.invalid","x-forwarded-for":"203.0.113.8"};
 if(body!==undefined)req.push(body);else if(method==="POST")req.push(JSON.stringify(operation==="login"?{email:plan.email.toUpperCase(),password}:{}));req.push(null);
 const chunks=[],wire=new Map(),res=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done();}});
 res.setHeader=(k,v)=>wire.set(k.toLowerCase(),v);res.headers=wire;res.text=()=>Buffer.concat(chunks).toString();res.on("error",()=>{});
 return {req,res,close(){req.destroy();socket.destroy();}};
}
async function fixture(patch={}) {
 const f=fakeProduct({sessionAccess:true}),raw=f.client.$queryRaw;let mode="allow",created=0;const keys=[];
 await f.client.user.create({data:{id:plan.id,name:"Synthetic Next tailor",email:plan.email,emailVerified:true}});
 await f.client.account.create({data:{id:plan.credentialId,userId:plan.id,accountId:plan.id,providerId:"credential",password:encoded}});
 f.client.$queryRaw=async(parts,...values)=>{
  if(parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')) {keys.push(values[0]);if(mode==="failure")throw new Error("private storage diagnostic");return [{allowed:mode!=="deny",retryAfterSeconds:9}];}
  return raw(parts,...values);
 };
 const settings={...env,...patch};
 const call=async(operation,options={})=>{
  const m=message(operation,{requestOrigin:settings.PRODUCT_SESSION_HTTP_ORIGIN,...options});
  try{await createNextSessionHandler(operation,{environment:()=>settings,runtime:async actual=>{created++;assert.equal(actual,settings);return createLocalSessionDispatcher(f.client,{env:actual,identifierKey:key,policy:localSessionRatePolicy(actual.PRODUCT_SINGLE_ORIGIN_RUN_ID??"")});}})(m.req,m.res);return m.res;}finally{m.close();}
 };
 return {...f,call,keys,created:()=>created,setMode:value=>{mode=value;}};
}
const cookie=result=>result.headers.get("set-cookie").map(v=>v.split(";")[0]).join("; ");
test("actual session wrappers preserve URLs, use raw-body parsing and remain inert in production",async()=>{
 for(const operation of ["login","session","logout"]) {
  const route=await import("../../pages/api/internal/tailor-session/"+operation+".ts");assert.deepEqual(route.config,{api:{bodyParser:false}});
  assert.equal(existsSync(new URL("../../app/api/internal/tailor-session/"+operation+"/route.ts",import.meta.url)),false);
  const old=process.env.NODE_ENV;process.env.NODE_ENV="production";const m=message(operation);
  try{await route.default(m.req,m.res);assert.equal(m.res.statusCode,404);assert.equal(m.res.headers.get("cache-control"),"no-store");}finally{m.close();if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
 }
});
test("local policy and every scoped digest agree with the historical fixture cleanup contract",async()=>development(async()=>{
 assert.deepEqual(localSessionRatePolicy(run),plan.policy);assert.throws(()=>localSessionRatePolicy("historical"));
 const f=await fixture();const a=await f.call("login");await f.call("session",{headers:{cookie:cookie(a)}});await f.call("logout",{headers:{cookie:cookie(a)}});
 assert.equal(new Set(f.keys).size,4);assert.ok(f.keys.every(k=>plan.keys.includes(k)));
}));
test("verified login, signed Secure cookie, fixed seven days and logout use the existing real service",async()=>development(async()=>{
 const f=await fixture(),a=await f.call("login"),b=await f.call("login");assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);
 assert.deepEqual(Object.keys(JSON.parse(a.text())),["user"]);assert.ok(Array.isArray(a.headers.get("set-cookie")));
 const c=a.headers.get("set-cookie")[0];for(const attr of [/HttpOnly/u,/Secure/u,/SameSite=Lax/u,/Max-Age=604800/u])assert.match(c,attr);
 assert.notEqual(cookie(a),cookie(b));assert.ok(f.rows().session.every(s=>/^hmac-sha256:v1:[a-f0-9]{64}$/u.test(s.token)));
 const expiry=f.rows().session[0].expiresAt;assert.ok(Math.abs(expiry.getTime()-Date.now()-604800000)<5000);
 const lookup=await f.call("session",{headers:{cookie:cookie(a)}});assert.equal(lookup.statusCode,200);assert.equal(JSON.parse(lookup.text()).user.id,plan.id);assert.deepEqual(f.rows().session[0].expiresAt,expiry);assert.equal(lookup.headers.has("set-cookie"),false);
 const logout=await f.call("logout",{headers:{cookie:cookie(a)}});assert.equal(logout.statusCode,200);assert.match(logout.headers.get("set-cookie")[0],/Max-Age=0/u);
 assert.equal((await f.call("session",{headers:{cookie:cookie(a)}})).statusCode,401);assert.equal((await f.call("session",{headers:{cookie:cookie(b)}})).statusCode,200);
}));
test("unknown, wrong, unverified and locked login share generic refusal; passwords are never trimmed",async()=>development(async()=>{
 const f=await fixture(),wrong=()=>f.call("login",{body:JSON.stringify({email:plan.email,password:password.trim()})});
 const r=await wrong(),unknown=await f.call("login",{body:JSON.stringify({email:plan.unknown,password})});assert.equal(r.statusCode,401);assert.equal(unknown.statusCode,401);assert.equal(r.text(),unknown.text());
 for(const patch of [{emailVerified:false},{disabledAt:new Date()},{deletionRequestedAt:new Date()}]){
  Object.assign(f.rows().user[0],{emailVerified:true,disabledAt:null,deletionRequestedAt:null},patch);const rejected=await f.call("login");assert.equal(rejected.statusCode,401);assert.equal(rejected.text(),r.text());assert.equal(rejected.headers.has("set-cookie"),false);
 }assert.equal(f.rows().session.length,0);
}));
test("missing, altered, expired, revoked and newly locked sessions cannot authorize",async()=>development(async()=>{
 const f=await fixture();assert.equal((await f.call("session")).statusCode,401);assert.equal((await f.call("session",{headers:{cookie:"__Secure-better-auth.session_token=altered"}})).statusCode,401);
 const a=await f.call("login");f.rows().session[0].expiresAt=new Date(Date.now()-1000);assert.equal((await f.call("session",{headers:{cookie:cookie(a)}})).statusCode,401);
 const b=await f.call("login");f.rows().user[0].disabledAt=new Date();assert.equal((await f.call("session",{headers:{cookie:cookie(b)}})).statusCode,401);
}));
test("TLS, loopback, forwarded/duplicate wire headers, Origin and method guards apply before runtime creation",async()=>development(async()=>{
 const f=await fixture();
 for(const patch of [{ENABLE_PRODUCT_SESSION_HTTP:undefined},{NODE_ENV:"production"},{PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined}]) {const g=await fixture(patch);assert.ok((await g.call("login")).statusCode>=400);assert.equal(g.created(),0);}
 for(const options of [{tls:false},{finished:false},{local:"0.0.0.0"},{peer:"203.0.113.8"},{port:3000}])assert.ok((await f.call("login",options)).statusCode>=400);
 for(const h of ["forwarded","x-forwarded-for","x-forwarded-proto","x-real-ip"])assert.equal((await f.call("session",{headers:{[h]:"forged"}})).statusCode,403);
 assert.equal((await f.call("login",{headers:{origin:"https://evil.invalid"}})).statusCode,403);assert.equal((await f.call("logout",{headers:{origin:"https://evil.invalid"}})).statusCode,403);assert.equal((await f.call("session",{headers:{origin:"https://evil.invalid"}})).statusCode,403);
 assert.equal((await f.call("session",{rawHeaders:["Host","127.0.0.1:3443","cookie","one=x","Cookie","two=y"]})).statusCode,400);
 assert.equal((await f.call("session",{method:"POST"})).statusCode,405);assert.equal((await f.call("session",{headers:{"content-length":"1"}})).statusCode,400);assert.equal(f.created(),0);
}));
test("shared limiter denial/storage failure blocks login and lookup without fallback or cookies",async()=>development(async()=>{
 const f=await fixture();f.setMode("deny");const r=await f.call("login");assert.equal(r.statusCode,429);assert.equal(r.headers.get("retry-after"),"9");assert.equal(f.rows().session.length,0);
 f.setMode("failure");for(const op of ["login","session","logout"]){const failed=await f.call(op);assert.equal(failed.statusCode,503);assert.deepEqual(JSON.parse(failed.text()),{error:"authentication_unavailable"});assert.equal(failed.headers.has("set-cookie"),false);}
}));
test("logout failure never clears cookies or reports success; frontend retains uncertainty until confirmed revocation",async()=>development(async()=>{
 const f=await fixture();let jar="",networkFailure=false;
 const client=createSessionClient({enabled:true,origin,currentOrigin:()=>origin,fetch:async(path,options)=>{
  if(networkFailure)throw new Error("private network diagnostic");
  const op=Object.keys(sessionPaths).find(op=>sessionPaths[op]===path),r=await f.call(op,{method:options.method,body:options.body,headers:{...(jar?{cookie:jar}:{})}});
  if(r.headers.has("set-cookie"))jar=cookie(r);const headers=new Headers();for(const [k,v] of r.headers)if(k!=="set-cookie")headers.set(k,v);
  return new Response(r.text(),{status:r.statusCode,headers});
 }}),controller=createSessionController(client);
 assert.equal(await controller.login({email:plan.email,password}),true);assert.equal(controller.getSnapshot().status,"authenticated");
 const remove=f.client.session.deleteMany;f.client.session.deleteMany=async()=>{throw new Error("private revoke diagnostic");};
 assert.equal(await controller.logout(),false);assert.equal(controller.getSnapshot().status,"unknown");assert.equal(controller.getSnapshot().session.user.id,plan.id);assert.match(controller.getSnapshot().message,/could not be confirmed/u);assert.equal(f.rows().session.length,1);
 networkFailure=true;assert.equal(await controller.logout(),false);assert.equal(controller.getSnapshot().session.user.id,plan.id);
 networkFailure=false;f.client.session.deleteMany=remove;assert.equal(await controller.logout(),true);assert.equal(controller.getSnapshot().session,null);assert.equal(f.rows().session.length,0);
}));
test("transport commit failure releases no cookie and identities remain isolated without business permissions",async()=>development(async()=>{
 const f=await fixture();await f.client.user.create({data:{id:"unrelated-user",name:"Other synthetic",email:"other@example.invalid",emailVerified:true}});await f.client.account.create({data:{id:"other-account",userId:"unrelated-user",accountId:"unrelated-user",providerId:"credential",password:encoded}});
 const a=await f.call("login"),b=await f.call("login",{body:JSON.stringify({email:"other@example.invalid",password})});
 assert.equal(JSON.parse((await f.call("session",{headers:{cookie:cookie(a)}})).text()).user.id,plan.id);const other=JSON.parse((await f.call("session",{headers:{cookie:cookie(b)}})).text());assert.equal(other.user.id,"unrelated-user");assert.equal("business" in other,false);assert.equal("role" in other.user,false);
 const tx=f.client.$transaction;f.client.$transaction=async callback=>{await tx(callback);throw new Error("Synthetic lost commit acknowledgement");};
 const failed=await f.call("login");assert.equal(failed.statusCode,503);assert.equal(failed.headers.has("set-cookie"),false);assert.ok(!failed.text().includes("Synthetic"));
}));


test("missing policy, isolated target, run namespace or session key cannot enable a runtime",async()=>development(async()=>{
 for(const patch of [{PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:undefined},{PRODUCT_SINGLE_ORIGIN_RUN_ID:undefined},{PRODUCT_SESSION_TOKEN_KEY:undefined},
  {PRODUCT_SESSION_TOKEN_KEY:key.toString("base64")},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_TEST_DATABASE_URL:undefined}]) {
  const f=await fixture(patch),r=await f.call("login");assert.equal(r.statusCode,503);assert.equal(r.headers.has("set-cookie"),false);assert.equal(f.keys.length,0);assert.equal(f.rows().session.length,0);
 }
}));

const httpSettings={PRODUCT_SESSION_HTTP_ORIGIN:"http://localhost:3000",PRODUCT_LOCAL_HTTP_CONFIRMED:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:undefined};
test("local HTTP uses signed HttpOnly/Lax host-only cookies, fixed seven days, fresh lookup and confirmed logout",async()=>development(async()=>{
 const f=await fixture(httpSettings),a=await f.call("login");assert.equal(a.statusCode,200);
 const c=a.headers.get("set-cookie")[0];for(const attr of [/HttpOnly/u,/SameSite=Lax/u,/Max-Age=604800/u,/Path=\//u])assert.match(c,attr);
 assert.doesNotMatch(c,/; Secure|__Secure-|Domain=/u);
 const expiry=f.rows().session[0].expiresAt;assert.match(f.rows().session[0].token,/^hmac-sha256:v1:/u);
 const b=await f.call("session",{headers:{cookie:cookie(a)}});assert.equal(b.statusCode,200);assert.equal(b.headers.has("set-cookie"),false);assert.deepEqual(f.rows().session[0].expiresAt,expiry);
 assert.equal((await f.call("logout",{headers:{cookie:cookie(a)}})).statusCode,200);
 assert.equal((await f.call("session",{headers:{cookie:cookie(a)}})).statusCode,401);
}));
test("HTTP development preserves generic lock/credential errors, expiry and uncertain logout",async()=>development(async()=>{
 const f=await fixture(httpSettings),wrong=await f.call("login",{body:JSON.stringify({email:plan.email,password:password.trim()})});
 const unknown=await f.call("login",{body:JSON.stringify({email:plan.unknown,password})});assert.equal(wrong.statusCode,401);assert.equal(unknown.text(),wrong.text());
 f.rows().user[0].disabledAt=new Date();assert.equal((await f.call("login")).text(),wrong.text());f.rows().user[0].disabledAt=null;
 const a=await f.call("login"),remove=f.client.session.deleteMany;
 f.client.session.deleteMany=async()=>{throw new Error("private diagnostic");};
 const failed=await f.call("logout",{headers:{cookie:cookie(a)}});assert.equal(failed.statusCode,503);assert.equal(failed.headers.has("set-cookie"),false);assert.doesNotMatch(failed.text(),/private diagnostic/u);
 f.client.session.deleteMany=remove;f.rows().session[0].expiresAt=new Date(Date.now()-1000);
 assert.equal((await f.call("session",{headers:{cookie:cookie(a)}})).statusCode,401);
}));
test("HTTP lookup/logout enforce local opt-in, raw wire Origin and actual loopback sockets before any database runtime",async()=>development(async()=>{
 const f=await fixture(httpSettings);
 for(const options of [{local:"192.0.2.1"},{peer:"192.0.2.1"},{port:3443},{tls:true},{headers:{"x-real-ip":"127.0.0.1"}},
  {headers:{host:"127.0.0.1:3000"}},{headers:{origin:"http://outside.invalid"}}])assert.ok((await f.call("session",options)).statusCode>=400);
 for(const op of ["login","logout"])assert.equal((await f.call(op,{headers:{origin:""}})).statusCode,403);
 assert.equal(f.created(),0);
 for(const patch of [{PRODUCT_LOCAL_HTTP_CONFIRMED:undefined},{NODE_ENV:"production"},{ENABLE_PRODUCT_SESSION_HTTP:undefined}]){
  const g=await fixture({...httpSettings,...patch});assert.ok((await g.call("login")).statusCode>=400);assert.equal(g.created(),0);
 }
 f.setMode("deny");assert.equal((await f.call("login")).statusCode,429);
 f.setMode("failure");for(const op of ["login","session","logout"])assert.equal((await f.call(op)).statusCode,503);
}));

test("routine development binds the normal Next server to loopback without certificates or automatic email delivery",()=>{
 const {scripts}=JSON.parse(readFileSync(new URL("../../package.json",import.meta.url),"utf8"));
 assert.match(scripts.dev,/next dev --hostname 127\.0\.0\.1 --port 3000$/u);
 assert.doesNotMatch(scripts.dev,/experimental-https|email-outbox-worker|0\.0\.0\.0/u);
 assert.match(scripts["dev:email"],/--env-file=\.env\.local --env-file-if-exists=\.env\.development\.local/u);
 assert.match(scripts["dev:email"],/email-outbox-worker\.mjs --owner-run$/u);
 assert.equal(scripts.start,"next start");
});

test("a lost logout response leaves uncertainty until fresh lookup confirms the committed revocation",async()=>development(async()=>{
 const f=await fixture();let jar="",loseResponse=false;
 const client=createSessionClient({enabled:true,origin,currentOrigin:()=>origin,fetch:async(path,options)=>{
  const op=Object.keys(sessionPaths).find(op=>sessionPaths[op]===path);
  const r=await f.call(op,{method:options.method,body:options.body,headers:{...(jar?{cookie:jar}:{})}});
  // Model delivery to the server followed by loss BEFORE any response/cookie arrives.
  if(op==="logout"&&loseResponse){assert.equal(r.statusCode,200);throw new Error("Synthetic response lost");}
  if(r.headers.has("set-cookie"))jar=cookie(r);
  const headers=new Headers();for(const [k,v] of r.headers)if(k!=="set-cookie")headers.set(k,v);
  return new Response(r.text(),{status:r.statusCode,headers});
 }}),controller=createSessionController(client);
 assert.equal(await controller.login({email:plan.email,password}),true);
 const originalCookie=jar;loseResponse=true;
 assert.equal(await controller.logout(),false);assert.equal(f.rows().session.length,0);
 assert.equal(jar,originalCookie);assert.equal(controller.getSnapshot().status,"unknown");
 assert.match(controller.getSnapshot().message,/could not be confirmed/u);assert.doesNotMatch(controller.getSnapshot().message,/You are logged out/u);
 assert.equal(await controller.refresh(),true);assert.equal(controller.getSnapshot().status,"unauthenticated");assert.equal(controller.getSnapshot().session,null);
}));

test("one browser cookie jar switches from account A to B without retaining A identity or revoking A's other device",async()=>development(async()=>{
 const f=await fixture(),other={id:"switch-user-b",name:"Other synthetic",email:"switch-b@example.invalid"};
 await f.client.user.create({data:{...other,emailVerified:true}});
 await f.client.account.create({data:{id:"switch-account-b",userId:other.id,accountId:other.id,providerId:"credential",password:encoded}});
 const otherDevice=await f.call("login");let jar="";
 const controller=createSessionController(createSessionClient({enabled:true,origin,currentOrigin:()=>origin,fetch:async(path,options)=>{
  const op=Object.keys(sessionPaths).find(op=>sessionPaths[op]===path);
  const r=await f.call(op,{method:options.method,body:options.body,headers:{...(jar?{cookie:jar}:{})}});
  if(r.headers.has("set-cookie"))jar=cookie(r);
  const headers=new Headers();for(const [k,v] of r.headers)if(k!=="set-cookie")headers.set(k,v);
  return new Response(r.text(),{status:r.statusCode,headers});
 }}));
 assert.equal(await controller.login({email:plan.email,password}),true);const accountACookie=jar;
 assert.equal(controller.getSnapshot().session.user.id,plan.id);
 assert.equal(await controller.logout(),true);assert.equal(controller.getSnapshot().session,null);
 assert.equal((await f.call("session",{headers:{cookie:accountACookie}})).statusCode,401);
 assert.equal(await controller.login({email:other.email,password}),true);
 assert.notEqual(jar,accountACookie);assert.deepEqual(controller.getSnapshot().session.user,other);
 assert.equal(await controller.refresh(),true);assert.equal(controller.getSnapshot().session.user.id,other.id);
 assert.equal("businessId" in controller.getSnapshot().session,false);
 assert.equal((await f.call("session",{headers:{cookie:cookie(otherDevice)}})).statusCode,200);
}));
