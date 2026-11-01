// Offline stream/socket/TLS/request doubles only. No connection, listen, certificate or database.
import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {Socket} from "node:net";
import {TLSSocket} from "node:tls";
import {IncomingMessage} from "node:http";
import {Readable,Writable} from "node:stream";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {createSingleOriginHandler,createSingleOriginServer,singleOriginRoute,applicationRequestHeaders,applicationResponseHeaders}=await import("../../lib/product-auth/single-origin.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const password=" Exact gateway synthetic password ",encoded=await hashPassword(password);
const origin="https://127.0.0.1:3443",next="http://127.0.0.1:3000";
const env={NODE_ENV:"development",ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SINGLE_ORIGIN_CONFIRMED:"true",
 PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:next,PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:origin,
 PRODUCT_SESSION_HTTP_AUTH_SECRET:"offline-gateway-signing-secret-not-for-deployment",PRODUCT_SESSION_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),
 PRODUCT_TEST_DATABASE_URL:"postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const policy={login:{version:"local-gateway-login",account:{capacity:3,refillIntervalMs:60000},ip:{capacity:10,refillIntervalMs:15000}},session:{version:"local-gateway-session",ip:{capacity:60,refillIntervalMs:1000}},logout:{version:"local-gateway-logout",ip:{capacity:30,refillIntervalMs:2000}}};
const options={env,policy,identifierKey:Buffer.alloc(32,19)};
function outgoing() {
 const chunks=[],headers=new Map();const out=new Writable({write(chunk,_encoding,done){out.headersSent=true;chunks.push(Buffer.from(chunk));done();}});
 out.headersSent=false;out.statusCode=0;out.setHeader=(k,v)=>headers.set(k.toLowerCase(),v);out.getHeaderNames=()=>[...headers.keys()];out.removeHeader=k=>headers.delete(k);
 out.headers=headers;out.text=()=>Buffer.concat(chunks).toString();return out;
}
function upstreamFake() {
 const calls=[];let failure=false,response={statusCode:200,headers:{"content-type":"text/html"},body:["<p>","Synthetic Next page","</p>"]},streamFailure=false;
 const request=(opts,callback)=>{
  calls.push(opts);const req=new EventEmitter();req.destroyed=false;req.setTimeout=(ms,fn)=>{req.timeout={ms,fn};return req;};req.destroy=error=>{req.destroyed=true;if(error)queueMicrotask(()=>req.emit("error",error));return req;};
  req.end=()=>queueMicrotask(()=>{
   if(failure){req.emit("error",new Error("private backend details"));return;}
   const res=streamFailure?new Readable({read(){this.push("partial");this.destroy(new Error("private stream failure"));}}):Readable.from(response.body);
   res.headers=response.headers;res.rawHeaders=Object.entries(response.headers).flatMap(([k,v])=>Array.isArray(v)?v.flatMap(x=>[k,x]):[k,v]);res.statusCode=response.statusCode;callback(res);
  });return req;
 };return {request,calls,fail:v=>{failure=v;},response:v=>{response=v;},streamFailure:()=>{streamFailure=true;}};
}
async function setup(overrides={}) {
 const f=fakeProduct({sessionAccess:true}),upstream=upstreamFake(),raw=f.client.$queryRaw;let rateFailure=false;
 f.client.$queryRaw=async(parts,...values)=>parts.join("").includes('INSERT INTO "product"."AuthRateBucket"')?(rateFailure?Promise.reject(new Error("private storage failure")):[{allowed:true,retryAfterSeconds:1}]):raw(parts,...values);
 await f.client.user.create({data:{id:"gateway-synthetic",name:"Synthetic gateway tailor",email:"synthetic@example.invalid",emailVerified:true}});
 await f.client.account.create({data:{id:"gateway-credential",userId:"gateway-synthetic",accountId:"gateway-synthetic",providerId:"credential",password:encoded}});
 const handler=createSingleOriginHandler(f.client,{...options,env:{...env,...overrides}},{request:upstream.request});
 const call=async(target,{method="GET",headers={},rawHeaders,tls=true,complete=true,local="127.0.0.1",remote="127.0.0.1",body}={})=>{
  const socket=tls?new TLSSocket():new Socket();for(const [k,v] of Object.entries({localAddress:local,remoteAddress:remote,localPort:3443}))Object.defineProperty(socket,k,{value:v});
  if(tls){socket.getProtocol=()=>"TLSv1.3";socket.getPeerFinished=()=>complete?Buffer.alloc(12,1):undefined;}
  const req=new IncomingMessage(socket);req.method=method;req.url=target;req.rawHeaders=rawHeaders??Object.entries({host:"127.0.0.1:3443",...headers}).flat();
  if(body!==undefined)req.push(body);req.push(null);const out=outgoing();out.on("error",()=>{});
  try{await handler(req,out);return out;}finally{req.destroy();socket.destroy();}
 };return {...f,upstream,call,failRate:()=>{rateFailure=true;}};
}
const authPath=op=>"/api/internal/tailor-session/"+op;
const authRequest={method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email:" Synthetic@EXAMPLE.INVALID ",password})};
const cookie=out=>out.headers.get("set-cookie").map(s=>s.split(";")[0]).join("; ");

test("routing has exact auth methods, preserves application query bytes and never falls back for reserved paths",()=>{
 for(const [op,method] of [["login","POST"],["session","GET"],["logout","POST"]]){
  assert.equal(singleOriginRoute(authPath(op),method).kind,"auth");assert.deepEqual(singleOriginRoute(authPath(op),"OPTIONS"),{kind:"deny",status:405,allow:method});
 }
 for(const path of ["/api/auth/login","/api/internal/tailor-session/login/","/%61pi/internal/tailor-session/login","/api%2finternal/session","/_next/image?url=https://outside.invalid","/_next/webpack-hmr","/__nextjs_original-stack-frame"])assert.equal(singleOriginRoute(path,"GET").kind,"deny");
 for(const path of ["//evil.invalid/auth","/x/../api/internal/tailor-session/login","/api\\internal","/%252fapi","/auth#fragment"])assert.equal(singleOriginRoute(path,"GET").kind,"deny");
 assert.equal(singleOriginRoute("/auth?login=&_rsc=synthetic","GET").kind,"application");assert.equal(singleOriginRoute("/_next/static/chunks/app/%28auth%29.js","GET").kind,"application");assert.equal(singleOriginRoute("/auth","POST").status,405);
});
test("configuration is default-disabled and refuses nonloopback or colliding upstream targets",async()=>{
 const f=await setup();
 for(const patch of [{PRODUCT_SINGLE_ORIGIN_CONFIRMED:undefined},{NODE_ENV:"production"},{ENABLE_PRODUCT_SESSION_HTTP:undefined},{PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:undefined},
  {PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:origin},{PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://localhost:3000"},{PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://127.0.0.1:3443"},{PRODUCT_SINGLE_ORIGIN_NEXT_ORIGIN:"http://127.0.0.1:3000/path"}]){
  assert.throws(()=>createSingleOriginHandler(f.client,{...options,env:{...env,...patch}},{request:f.upstream.request}));
  assert.throws(()=>createSingleOriginServer(f.client,{...options,env:{...env,...patch},key:Buffer.alloc(0),cert:Buffer.alloc(0)}));
 }assert.equal(f.upstream.calls.length,0);assert.equal(f.rows().session.length,0);
});
test("application forwarding streams to only the fixed Next loopback address and preserves RSC/navigation hints",async()=>{
 const f=await setup(),target="/auth?login=&_rsc=synthetic",out=await f.call(target,{headers:{rsc:"1","next-router-state-tree":"synthetic-tree","x-stitchtrack-auth-state":"signup","x-middleware-subrequest":"forged",authorization:"forged","cookie":"__Secure-better-auth.session_token=private; next-preview=synthetic"}});
 assert.equal(out.statusCode,200);assert.equal(out.text(),"<p>Synthetic Next page</p>");const req=f.upstream.calls[0];
 assert.equal(req.hostname,"127.0.0.1");assert.equal(req.port,3000);assert.equal(req.path,target);assert.equal(req.headers.host,"127.0.0.1:3443");assert.equal(req.headers["x-forwarded-proto"],"https");assert.equal(req.headers["x-forwarded-for"],undefined);
 assert.equal(req.headers.rsc,"1");assert.equal(req.headers["next-router-state-tree"],"synthetic-tree");assert.equal(req.headers.cookie,"next-preview=synthetic");assert.equal(req.headers.authorization,undefined);assert.equal(req.headers["x-stitchtrack-auth-state"],undefined);assert.equal(req.headers["x-middleware-subrequest"],undefined);
});
test("forged metadata, duplicate headers, application bodies and upgrades fail before auth/proxy operations",async()=>{
 const f=await setup();
 for(const settings of [{tls:false},{complete:false},{local:"0.0.0.0"},{remote:"203.0.113.9"}])assert.ok([404,503].includes((await f.call("/auth",settings)).statusCode));
 for(const key of ["forwarded","x-real-ip","x-forwarded-for","x-forwarded-proto"])assert.equal((await f.call("/auth",{headers:{[key]:"forged"}})).statusCode,403);
 assert.equal((await f.call("/auth",{rawHeaders:["Host","127.0.0.1:3443","host","127.0.0.1:3443"]})).statusCode,503);
 assert.equal((await f.call("/auth",{headers:{"content-length":"1"},body:"x"})).statusCode,400);
 assert.equal((await f.call("/auth",{headers:{"transfer-encoding":"chunked"}})).statusCode,400);
 assert.equal((await f.call("/auth",{headers:{connection:"cookie"}})).statusCode,501);
 assert.equal((await f.call("/auth",{headers:{upgrade:"websocket"}})).statusCode,501);assert.equal((await f.call("/auth",{headers:{expect:"100-continue"}})).statusCode,417);
 assert.equal(f.upstream.calls.length,0);assert.equal(f.rows().session.length,0);
});
test("auth routes execute the real existing handler in process; signed cookies never travel to Next",async()=>{
 const f=await setup(),logged=await f.call(authPath("login"),authRequest);assert.equal(logged.statusCode,200);assert.equal(f.upstream.calls.length,0);
 assert.match(logged.headers.get("set-cookie")[0],/Secure/iu);assert.match(logged.headers.get("set-cookie")[0],/HttpOnly/iu);assert.match(logged.headers.get("set-cookie")[0],/SameSite=Lax/iu);assert.match(logged.headers.get("set-cookie")[0],/Max-Age=604800/u);
 const token=cookie(logged),lookup=await f.call(authPath("session"),{headers:{cookie:token}});assert.equal(lookup.statusCode,200);assert.equal(JSON.parse(lookup.text()).user.id,"gateway-synthetic");
 const out=await f.call(authPath("logout"),{method:"POST",headers:{origin,"content-type":"application/json",cookie:token},body:"{}"});assert.equal(out.statusCode,200);assert.equal((await f.call(authPath("session"),{headers:{cookie:token}})).statusCode,401);assert.equal(f.upstream.calls.length,0);
 await f.call("/auth?login",{headers:{cookie:token}});assert.equal(f.upstream.calls[0].headers.cookie,undefined);
});
test("logout uncertainty and unavailable rate storage remain failures at the ingress",async()=>{
 const f=await setup(),logged=await f.call(authPath("login"),authRequest),token=cookie(logged);
 f.client.session.deleteMany=async()=>{throw new Error("private revocation failure");};const result=await f.call(authPath("logout"),{method:"POST",headers:{origin,"content-type":"application/json",cookie:token},body:"{}"});
 assert.equal(result.statusCode,503);assert.equal(result.headers.has("set-cookie"),false);assert.equal(f.rows().session.length,1);
 f.failRate();assert.equal((await f.call(authPath("login"),authRequest)).statusCode,503);assert.equal(f.upstream.calls.length,0);
});
test("reserved API routes/methods cannot bypass ingress through the Next upstream",async()=>{
 const f=await setup();for(const [path,method] of [[authPath("login"),"GET"],[authPath("session"),"POST"],["/api/auth/login","POST"],["/api/internal/tailor-session/other","GET"],["/%61pi/auth/login","GET"]])assert.ok((await f.call(path,{method})).statusCode>=400);
 assert.equal(f.upstream.calls.length,0);assert.equal(f.rows().session.length,0);
});
test("backend failure becomes sanitized 502; failures after streaming begins destroy the response",async()=>{
 const f=await setup();f.upstream.fail(true);let out=await f.call("/auth");assert.equal(out.statusCode,502);assert.deepEqual(JSON.parse(out.text()),{error:"application_unavailable"});
 f.upstream.fail(false);f.upstream.streamFailure();out=await f.call("/auth");assert.equal(out.destroyed,true);assert.ok(!out.text().includes("private stream failure"));assert.ok(!out.text().includes("application_unavailable"));
});
test("upstream cookies stay separate and cannot overwrite ingress auth cookies; redirect origins are constrained",()=>{
 const headers=applicationResponseHeaders({"set-cookie":["one=synthetic; Secure","two=synthetic; Secure"],location:next+"/auth?login",connection:"keep-alive","transfer-encoding":"chunked"},["Set-Cookie","one=synthetic; Secure","Set-Cookie","two=synthetic; Secure","Location",next+"/auth?login"],origin,next,"/auth");
 assert.equal(headers["set-cookie"].length,2);assert.equal(headers.location,origin+"/auth?login");assert.equal(headers.connection,undefined);assert.equal(headers["transfer-encoding"],undefined);
 for(const value of ["https://evil.invalid/auth","//evil.invalid/auth","http://127.0.0.1:3443/auth","javascript:alert(1)"])assert.throws(()=>applicationResponseHeaders({location:value},["Location",value],origin,next,"/auth"));
 assert.throws(()=>applicationResponseHeaders({"set-cookie":["__Secure-better-auth.session_token=forged"]},[],origin,next,"/auth"));
 assert.throws(()=>applicationResponseHeaders({"access-control-allow-origin":"*"},[],origin,next,"/auth"));assert.throws(()=>applicationResponseHeaders({location:"/"},["Location","/","location","/"],origin,next,"/auth"));
});
test("response rejection never leaves upstream redirect/cookie/body-framing headers on a 502",async()=>{
 const f=await setup();f.upstream.response({statusCode:302,headers:{location:"https://evil.invalid", "set-cookie":["other=synthetic; Secure"],"content-length":"999"},body:[]});
 const out=await f.call("/auth");assert.equal(out.statusCode,502);assert.equal(out.headers.has("set-cookie"),false);assert.equal(out.headers.has("location"),false);assert.equal(out.headers.has("content-length"),false);
});
test("normal Next handlers/frontend remain disabled and listener lifecycle rejects unsupported upgrades",()=>{
 for(const op of ["login","session","logout"]) {const s=readFileSync(new URL("../../pages/api/internal/tailor-session/"+op+".ts",import.meta.url),"utf8");assert.ok(s.includes('createNextSessionHandler'));assert.ok(s.includes('bodyParser:false'));assert.ok(!s.includes("single-origin"));}
 const client=readFileSync(new URL("../../lib/auth/session-client.ts",import.meta.url),"utf8");assert.match(client,/FRONTEND_AUTH_ENABLED = false/u);
 const listener=readFileSync(new URL("../../lib/product-auth/session-https.server.ts",import.meta.url),"utf8");for(const text of ['server.on("upgrade"','server.on("connect"','server.on("checkContinue"','server.listen({host:"127.0.0.1"'])assert.ok(listener.includes(text));
 const source=readFileSync(new URL("../../lib/product-auth/single-origin.server.ts",import.meta.url),"utf8");assert.doesNotMatch(source,/console\.|readFile|writeFile|\.env\.local|createServer|createConnection/u);
});

test("normal Next list-valued preload/cache headers can repeat without collapsing Set-Cookie",()=>{
 const h=applicationResponseHeaders({link:'</one>; rel=preload, </two>; rel=preload',vary:'RSC, Next-Router-State-Tree'},
 ['Link','</one>; rel=preload','Link','</two>; rel=preload','Vary','RSC','Vary','Next-Router-State-Tree'],origin,next,'/auth');
 assert.equal(h.vary,'RSC, Next-Router-State-Tree');assert.ok(h.link.includes('</two>'));
});
test("ingress preserves hostile Origin for CSRF refusal and rejects auth query/method deviations",async()=>{
 const f=await setup();assert.equal((await f.call(authPath("login"),{...authRequest,headers:{...authRequest.headers,origin:"https://evil.invalid"}})).statusCode,403);
 assert.equal((await f.call(authPath("login")+"?unexpected",authRequest)).statusCode,400);assert.equal((await f.call(authPath("logout"),{method:"GET"})).statusCode,405);
 assert.equal(f.upstream.calls.length,0);assert.equal(f.rows().session.length,0);
});

test("upstream protocol upgrades cannot escape response validation or become a tunnel",async()=>{
 const f=await setup();let socketClosed=false;
 const request=(_opts,_callback)=>{
  const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=()=>req;
  req.end=()=>queueMicrotask(()=>req.emit("upgrade",{}, {destroy(){socketClosed=true;}}));return req;
 };
 const handler=createSingleOriginHandler(f.client,options,{request});
 const socket=new TLSSocket();for(const [k,v] of Object.entries({localAddress:"127.0.0.1",remoteAddress:"127.0.0.1",localPort:3443}))Object.defineProperty(socket,k,{value:v});
 socket.getProtocol=()=>"TLSv1.3";socket.getPeerFinished=()=>Buffer.alloc(12,1);
 const incoming=new IncomingMessage(socket);incoming.url="/auth";incoming.method="GET";incoming.rawHeaders=["Host","127.0.0.1:3443"];incoming.push(null);const out=outgoing();out.on("error",()=>{});
 try{await handler(incoming,out);assert.equal(out.statusCode,502);assert.equal(socketClosed,true);}finally{incoming.destroy();socket.destroy();}
});

test("ambiguous auth framing is refused before password verification or upstream access",async()=>{
 const f=await setup();
 for(const headers of [{"content-length":"2","transfer-encoding":"chunked"},{"content-length":"+2"},{"content-length":"2, 2"}]) {
  const out=await f.call(authPath("login"),{...authRequest,headers:{...authRequest.headers,...headers}});assert.equal(out.statusCode,400);
 }
 assert.equal(f.rows().session.length,0);assert.equal(f.upstream.calls.length,0);
});


test("registration paths are exact POST-only and remain unavailable without their separate opt-in",async()=>{
 const f=await setup();
 for(const [path,operation] of [["signup","signup"],["verify-email","verify"],["resend-verification","resend"]]){
  const url="/api/product-auth/"+path;
  assert.deepEqual(singleOriginRoute(url,"POST"),{kind:"registration",operation});
  assert.equal((await f.call(url,{method:"POST",body:"{}",headers:{origin,"content-type":"application/json"}})).statusCode,404);
  assert.equal((await f.call(url,{method:"GET"})).statusCode,405);
  assert.equal((await f.call(url,{method:"POST",headers:{"x-forwarded-for":"127.0.0.1"}})).statusCode,403);
 }
 assert.equal(f.upstream.calls.length,0);assert.equal(f.rows().user.length,1);
});


test("existing ingress still streams requests to the shared registration boundary with branded socket context",async()=>{
 const previous=process.env.NODE_ENV,flag=process.env.ENABLE_PRODUCT_REGISTRATION_HTTP;
 process.env.NODE_ENV="development";process.env.ENABLE_PRODUCT_REGISTRATION_HTTP="true";
 try {
  const policies=Object.fromEntries(["signup","verify-email","resend-verification"].map(op=>[op,{version:"local-stream-"+op,account:{capacity:3,refillIntervalMs:60000},ip:{capacity:10,refillIntervalMs:15000}}]));
  const f=await setup({ENABLE_PRODUCT_REGISTRATION_HTTP:"true",PRODUCT_DEVELOPMENT_CONSENT_DEFERRED:"true",PRODUCT_REGISTRATION_RATE_POLICY_CONFIRMED:"true",PRODUCT_REGISTRATION_RATE_POLICIES:JSON.stringify(policies),
   PRODUCT_EMAIL_VERIFIER_KEY_ID:"v",PRODUCT_EMAIL_VERIFIER_KEY:Buffer.alloc(32,1).toString("base64"),PRODUCT_EMAIL_OUTBOX_KEY_ID:"m",PRODUCT_EMAIL_OUTBOX_KEY:Buffer.alloc(32,2).toString("base64")});
  const post=(op,body)=>f.call("/api/product-auth/"+op,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
  // Invalid signup never reaches HIBP; verification/resend never require it.
  assert.equal((await post("signup",{})).statusCode,422);
  assert.equal((await post("verify-email",{email:"unknown@example.invalid",otp:"000000"})).statusCode,400);
  assert.equal((await post("resend-verification",{email:"unknown@example.invalid"})).statusCode,202);
  assert.equal(f.upstream.calls.length,0);assert.equal(f.rows().user.length,1);assert.equal(f.rows().session.length,0);
 }finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;if(flag===undefined)delete process.env.ENABLE_PRODUCT_REGISTRATION_HTTP;else process.env.ENABLE_PRODUCT_REGISTRATION_HTTP=flag;}
});
