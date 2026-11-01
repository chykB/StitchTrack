// Offline fetch/clock doubles only. No server, browser, database or external requests.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createSessionClient,FRONTEND_AUTH_ENABLED} from "../../lib/auth/session-client.ts";
import {createSessionController} from "../../lib/auth/session-controller.ts";
const user={id:"synthetic-a",name:"Synthetic tailor",email:"synthetic@example.invalid"};
const json=(body,status=200,headers={})=>Response.json(body,{status,headers});
const initialTime=Date.parse("2026-10-30T12:00:00Z"),session=()=>({user,expiresAt:initialTime+60000});
function clock() {
  let time=initialTime,id=0;const timers=new Map();
  return {now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id),
    advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}},timers};
}
function stub(overrides={}) {return {enabled:true,login:async()=>({ok:true,data:{user}}),session:async()=>({ok:true,data:session()}),logout:async()=>({ok:true,data:{loggedOut:true}}),...overrides};}

test("default application configuration and disabled client/controller never make requests",async()=>{
  assert.equal(FRONTEND_AUTH_ENABLED,false);let calls=0;
  const client=createSessionClient({fetch:async()=>{calls++;throw new Error();}}),controller=createSessionController(client);
  assert.equal((await client.login({email:user.email,password:"x"})).kind,"disabled");assert.equal((await client.session()).kind,"disabled");assert.equal((await client.logout()).kind,"disabled");
  assert.equal(await controller.login({email:user.email,password:"x"}),false);assert.equal(await controller.refresh(),false);assert.equal(await controller.logout(),false);
  assert.equal(controller.getSnapshot().status,"disabled");assert.equal(calls,0);
});
test("client uses only fixed same-origin paths, canonical email, exact password and safe request options",async()=>{
  const calls=[],password=" Exact e\u0301 Unicode password ";
  const client=createSessionClient({enabled:true,fetch:async(path,options)=>{calls.push({path,options});return json({user});}});
  assert.equal((await client.login({email:" Synthetic@EXAMPLE.INVALID ",password})).ok,true);
  assert.equal(calls[0].path,"/api/internal/tailor-session/login");assert.deepEqual(JSON.parse(calls[0].options.body),{email:user.email,password});
  for(const [key,value] of Object.entries({credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer"}))assert.equal(calls[0].options[key],value);
  assert.deepEqual(calls[0].options.headers,{"content-type":"application/json"});assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal((await client.login({email:user.email,password:"x",userId:"forged"})).kind,"invalid_input");assert.equal(calls.length,1);
});
test("unknown/wrong/locked credential responses are generic and inaccessible routes never become authentication",async()=>{
  for(const status of [401,404,503,500]) {
    const client=createSessionClient({enabled:true,fetch:async()=>json({error:"private server detail",token:"not-for-use"},status)});
    const result=await client.login({email:user.email,password:"x"});assert.deepEqual(result,{ok:false,kind:status===401?"invalid_credentials":"unavailable"});
  }
  const client=createSessionClient({enabled:true,fetch:async()=>json({error:"unauthenticated"},401)});
  assert.deepEqual(await client.session(),{ok:true,data:null});assert.equal((await client.logout()).kind,"unauthenticated");
});
test("Retry-After supports integer seconds and HTTP dates without trusting server error messages",async()=>{
  for(const [header,expected] of [["17",17],[new Date(initialTime+20000).toUTCString(),20],["not-a-date",undefined]]) {
    const client=createSessionClient({enabled:true,now:()=>initialTime,fetch:async()=>json({error:"private"},429,{"retry-after":header})});
    assert.deepEqual(await client.login({email:user.email,password:"x"}),{ok:false,kind:"rate_limited",retryAfterSeconds:expected});
  }
});
test("malformed/token-bearing success bodies and redirects cannot establish frontend identity",async()=>{
  for(const body of [{user,token:"secret"},{user:{...user,token:"secret"}},{user:{id:"a"}}]) {
    const client=createSessionClient({enabled:true,fetch:async()=>json(body)});assert.equal((await client.login({email:user.email,password:"x"})).kind,"unavailable");
  }
  const redirected=json({user});Object.defineProperty(redirected,"redirected",{value:true});
  assert.equal((await createSessionClient({enabled:true,fetch:async()=>redirected}).login({email:user.email,password:"x"})).kind,"unavailable");
});
test("login waits for authoritative cookie/session confirmation and blocks duplicate operations synchronously",async()=>{
  const time=clock();let complete,calls=0;
  const controller=createSessionController(stub({login:()=>{calls++;return new Promise(resolve=>{complete=resolve;});}}),time);
  const pending=controller.login({email:user.email,password:"x"});assert.equal(controller.getSnapshot().pending,"login");assert.equal(controller.getSnapshot().session,null);
  assert.equal(await controller.login({email:user.email,password:"x"}),false);assert.equal(await controller.refresh(),false);assert.equal(calls,1);
  complete({ok:true,data:{user}});assert.equal(await pending,true);assert.equal(controller.getSnapshot().status,"authenticated");
  assert.equal("password" in controller.getSnapshot(),false);assert.equal("token" in controller.getSnapshot().session,false);
});
test("rate-limited form state preserves input ownership and releases backoff with a single clock deadline",async()=>{
  const time=clock(),controller=createSessionController(stub({login:async()=>({ok:false,kind:"rate_limited",retryAfterSeconds:3})}),time),messages=[];
  const off=controller.subscribe(()=>messages.push(controller.getSnapshot().message));
  try {await controller.login({email:user.email,password:"x"});assert.match(controller.getSnapshot().message,/3 seconds/u);
    assert.equal(await controller.login({email:user.email,password:"x"}),false);time.advance(2999);assert.notEqual(controller.getSnapshot().retryUntil,null);
    time.advance(1);assert.equal(controller.getSnapshot().retryUntil,null);assert.equal(controller.getSnapshot().message,"You can try again.");
  }finally{off();}assert.equal(time.timers.size,0);
});
test("session expiry and server-reported revocation clear presentation identity without renewal",async()=>{
  const time=clock();let current=session();const controller=createSessionController(stub({session:async()=>({ok:true,data:current})}),time),off=controller.subscribe(()=>{});
  try{await controller.refresh();const expiry=controller.getSnapshot().session.expiresAt;time.advance(60000);assert.equal(controller.getSnapshot().status,"unauthenticated");assert.equal(controller.getSnapshot().session,null);assert.match(controller.getSnapshot().message,/expired/u);
    assert.equal(expiry,initialTime+60000);current=null;await controller.refresh();assert.equal(controller.getSnapshot().session,null);
  }finally{off();}assert.equal(time.timers.size,0);
});
test("logout failure retains last-known identity as uncertain; only confirmed revocation clears it",async()=>{
  const time=clock();let fail=true;
  const controller=createSessionController(stub({logout:async()=>fail?{ok:false,kind:"network"}:{ok:true,data:{loggedOut:true}}}),time);
  await controller.refresh();assert.equal(await controller.logout(),false);assert.equal(controller.getSnapshot().status,"unknown");assert.equal(controller.getSnapshot().session.user.id,user.id);assert.match(controller.getSnapshot().message,/could not be confirmed/u);assert.doesNotMatch(controller.getSnapshot().message,/You are logged out/u);
  fail=false;assert.equal(await controller.logout(),true);assert.equal(controller.getSnapshot().session,null);assert.equal(controller.getSnapshot().message,"You are logged out.");
});
test("401 logout needs an authoritative absent-session result; lookup errors cannot masquerade as logout",async()=>{
  const time=clock();let current=session(),unavailable=false;
  const controller=createSessionController(stub({logout:async()=>({ok:false,kind:"unauthenticated"}),session:async()=>unavailable?{ok:false,kind:"network"}:{ok:true,data:current}}),time);
  await controller.refresh();unavailable=true;assert.equal(await controller.logout(),false);assert.equal(controller.getSnapshot().session.user.id,user.id);
  unavailable=false;current=null;assert.equal(await controller.logout(),true);assert.equal(controller.getSnapshot().session,null);
});
test("a fresh lookup replaces identity and never grants a business permission",async()=>{
  const time=clock();let current=session();const controller=createSessionController(stub({session:async()=>({ok:true,data:current})}),time);
  await controller.refresh();current={...session(),user:{...user,id:"synthetic-b",name:"Other synthetic tailor"}};await controller.refresh();
  assert.equal(controller.getSnapshot().session.user.id,"synthetic-b");assert.equal("businessId" in controller.getSnapshot().session,false);assert.equal("authorized" in controller.getSnapshot(),false);
});
test("session confirmation mismatch or network error does not claim a successful login",async()=>{
  const time=clock();
  for(const answer of [{ok:true,data:{...session(),user:{...user,id:"other"}}},{ok:false,kind:"network"}]) {
    const controller=createSessionController(stub({session:async()=>answer}),time);assert.equal(await controller.login({email:user.email,password:"x"}),false);assert.equal(controller.getSnapshot().status,"unknown");
  }
});
test("native errors remain sanitized and frontend modules never read cookies or persist authentication material",async t=>{
  const logs=[];for(const name of ["log","warn","error","info"])t.mock.method(console,name,(...args)=>logs.push(args));
  const client=createSessionClient({enabled:true,fetch:async()=>{throw new Error("private password/cookie/key");}});assert.deepEqual(await client.logout(),{ok:false,kind:"network"});assert.deepEqual(logs,[]);
  for(const file of ["session-client.ts","session-controller.ts"]) {
    const source=readFileSync(new URL("../../lib/auth/"+file,import.meta.url),"utf8");assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|console\.|set-cookie|Authorization:/u);
  }
});

test("client/controller login confirms the cookie via session lookup and logout accepts only a valid success body",async()=>{
  const time=clock(),calls=[];let invalidLogout=true;
  const client=createSessionClient({enabled:true,now:time.now,fetch:async(path,options)=>{
    calls.push({path,options});
    if(path.endsWith("/login"))return json({user});
    if(path.endsWith("/session"))return json({user,expiresAt:new Date(initialTime+60000).toISOString()});
    return json({loggedOut:!invalidLogout});
  }}),controller=createSessionController(client,time);
  assert.equal(await controller.login({email:user.email,password:" Exact synthetic password "}),true);
  assert.deepEqual(calls.map(c=>c.path),["/api/internal/tailor-session/login","/api/internal/tailor-session/session"]);
  assert.equal(calls[1].options.method,"GET");assert.equal(calls[1].options.body,undefined);assert.equal(controller.getSnapshot().session.expiresAt,initialTime+60000);
  assert.equal(await controller.logout(),false);assert.equal(controller.getSnapshot().status,"unknown");assert.equal(controller.getSnapshot().session.user.id,user.id);
  invalidLogout=false;assert.equal(await controller.logout(),true);assert.equal(controller.getSnapshot().session,null);
});
test("double logout cannot issue another mutation while revocation is pending",async()=>{
  const time=clock();let finish,calls=0;
  const controller=createSessionController(stub({logout:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}}),time);
  await controller.refresh();const pending=controller.logout();assert.equal(controller.getSnapshot().pending,"logout");
  assert.equal(await controller.logout(),false);assert.equal(await controller.login({email:user.email,password:"x"}),false);assert.equal(calls,1);
  finish({ok:true,data:{loggedOut:true}});assert.equal(await pending,true);assert.equal(controller.getSnapshot().status,"unauthenticated");
});
