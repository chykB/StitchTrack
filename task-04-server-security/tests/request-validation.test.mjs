import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
const {validateAuthRequest,parseAuthInput,AUTH_BODY_LIMIT}=await import("../../lib/auth/request.server.ts");
const {previewAuthRequest}=await import("../../lib/auth/validation-preview.server.ts");
const {validationTimingRequest}=await import("../../lib/assessment/validation-timing.server.ts");
const {timingFixtures,VALIDATION_TIMING_MARKER}=await import("../../lib/assessment/validation-timing-fixtures.ts");
const {summarize,timingMetrics,authorizeMeasurement}=await import("../experiments/validation-timing/measure.mjs");
const enabled={NODE_ENV:"development",ENABLE_AUTH_VALIDATION_PREVIEW:"true"};
const timingEnv={NODE_ENV:"development",ENABLE_AUTH_VALIDATION_TIMING:"true"};
function request(value=timingFixtures.signup,options={}) {
  const url=options.url??"http://127.0.0.1:3106/api/auth/signup",method=options.method??"POST";
  return new Request(url,{method,headers:{host:new URL(url).host,"content-type":"application/json",...options.headers},
    ...(["GET","HEAD"].includes(method)?{}:{body:options.raw??JSON.stringify(value)})});
}
function timed(operation="signup",variant="validated",options={}) {
  return request(options.value??timingFixtures[operation],{url:"http://127.0.0.1:3106/api/assessment/validation-timing",...options,
    headers:{"x-stitchtrack-assessment":VALIDATION_TIMING_MARKER,"x-stitchtrack-operation":operation,"x-stitchtrack-validation":variant,...options.headers}});
}

test("all preview routes deny disabled, production and non-loopback requests before body access",async()=>{
  for(const operation of ["signup","login","reset"]) for(const env of [{},{NODE_ENV:"development"},{...enabled,NODE_ENV:"production"},{...enabled,NODE_ENV:"test"}]) {
    const req=request();Object.defineProperty(req,"body",{get(){assert.fail("Body must not be read");}});
    assert.equal((await previewAuthRequest(req,operation,env)).status,404);
  }
  for(const opts of [{url:"http://example.com/api/auth/signup"},{url:"https://127.0.0.1:3106/api/auth/signup"},{headers:{host:"example.com"}}]) {
    assert.equal((await previewAuthRequest(request(undefined,opts),"signup",enabled)).status,404);
  }
});
test("valid registration/login/reset requests reach only truthful 503 without cookies or echoed credentials",async()=>{
  for(const operation of ["signup","login","reset"]) {
    const res=await previewAuthRequest(request(timingFixtures[operation]),operation,enabled);
    assert.equal(res.status,503);assert.equal(res.headers.get("cache-control"),"no-store");assert.equal(res.headers.has("set-cookie"),false);
    const text=await res.text();assert.doesNotMatch(text,/Timing\+Demo|Synthetic timing phrase/);
    assert.equal(JSON.parse(text).error,"authentication_unavailable");
  }
});
test("only validated canonical data reaches a service callback; exact password/name survive",async()=>{
  let called=0;
  const raw={name:" \u1ECCl\u00e1 ",email:" TAILOR+Orders@EXAMPLE.INVALID ",password:" Synthetic phrase \u{1F9F5} "};
  const res=await validateAuthRequest(request(raw),"signup",async input=>{
    called++;assert.equal(input.operation,"signup");assert.deepEqual(input.data,{...raw,email:"tailor+orders@example.invalid"});
    assert.notEqual(input.data,raw);return Response.json({testOnly:true});
  });
  assert.equal(res.status,200);assert.equal(called,1);assert.equal(raw.email," TAILOR+Orders@EXAMPLE.INVALID ");
});
test("malformed requests never reach business logic and do not reflect input/unknown keys",async()=>{
  const bypass=JSON.parse(readFileSync(new URL("../../task-03-client-validation/fixtures/form-bypass-payload.json",import.meta.url),"utf8"));
  for(const value of [bypass,null,[],"text",{}, {...timingFixtures.signup,email:"a@b"}, {...timingFixtures.signup,password:" ".repeat(12)},
    {...timingFixtures.signup,password:"short"},{...timingFixtures.signup,password:"synthetic\tphrase"},
    {...timingFixtures.signup,name:"\u0085"},{...timingFixtures.signup,"SECRET-AS-KEY":true},
    {...timingFixtures.signup,email:123}]) {
    const res=await validateAuthRequest(request(value),"signup",async()=>assert.fail("Untrusted input reached service"));
    assert.equal(res.status,422);const text=await res.text();assert.doesNotMatch(text,/SECRET-AS-KEY|synthetic|a@b|23502|stack/u);
  }
});
test("login presence rules and reset strict shape are preserved at the backend",async()=>{
  let value;
  await validateAuthRequest(request({email:" A@EXAMPLE.INVALID ",password:" x "}),"login",async input=>{value=input.data;return new Response();});
  assert.deepEqual(value,{email:"a@example.invalid",password:" x "});
  for(const [operation,body] of [["login",{email:"a@example.invalid",password:""}],["reset",{email:"bad"}],
    ["reset",{email:"a@example.invalid",password:"must-not-be-accepted"}]]) {
    assert.equal((await validateAuthRequest(request(body),operation,async()=>assert.fail())).status,422);
  }
});
test("server parser retains Signup Unicode/minimum/no-complexity policy without trimming",()=>{
  for(const password of ["a".repeat(12),"\u{1F9F5}".repeat(12)," Synthetic phrase ","e\u0301".repeat(6),"x".repeat(129)]) {
    const result=parseAuthInput("signup",{...timingFixtures.signup,password});assert.equal(result.ok,true);assert.equal(result.value.data.password,password);
  }
  assert.equal(parseAuthInput("signup",{...timingFixtures.signup,password:"\u{1F9F5}".repeat(11)}).ok,false);
});
test("method, query, origin, media type and malformed JSON are rejected before service",async()=>{
  for(const [options,status] of [[{method:"GET"},405],[{url:"http://127.0.0.1:3106/api/auth/signup?extra"},400],
    [{headers:{origin:"http://example.com"}},403],[{headers:{"sec-fetch-site":"cross-site"}},403],
    [{headers:{"content-type":"text/plain"}},415],[{headers:{"content-encoding":"gzip"}},415],
    [{raw:"{"},400],[{headers:{"content-length":"invalid"}},400]]) {
    assert.equal((await validateAuthRequest(request(undefined,options),"signup",async()=>assert.fail())).status,status);
  }
});
test("advertised and streamed body sizes are bounded, including chunked/no length input",async()=>{
  assert.equal((await validateAuthRequest(request(undefined,{headers:{"content-length":String(AUTH_BODY_LIMIT+1)}}),"signup",async()=>assert.fail())).status,413);
  const req=new Request("http://127.0.0.1:3106/api/auth/signup",{method:"POST",headers:{"content-type":"application/json"},body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(AUTH_BODY_LIMIT));controller.enqueue(new Uint8Array(1));controller.close();}}),duplex:"half"});
  assert.equal((await validateAuthRequest(req,"signup",async()=>assert.fail())).status,413);
  const invalidUtf8=new Request("http://127.0.0.1:3106/api/auth/signup",{method:"POST",headers:{"content-type":"application/json"},body:new Uint8Array([0xff])});
  assert.equal((await validateAuthRequest(invalidUtf8,"signup",async()=>assert.fail())).status,400);
});
test("boundary has no logging, authentication or network side effects",async t=>{
  for(const key of ["log","info","warn","error"])t.mock.method(console,key,()=>assert.fail("No credential logging"));
  t.mock.method(globalThis,"fetch",()=>assert.fail("No outbound request"));
  await previewAuthRequest(request(),"signup",enabled);
  await previewAuthRequest(request({...timingFixtures.signup,email:"bad"}),"signup",enabled);
});
test("timing fixture is gated and cannot serve as an arbitrary unvalidated credential receiver",async()=>{
  for(const env of [{},{NODE_ENV:"development"},{...timingEnv,NODE_ENV:"production"}]) {
    const req=timed();Object.defineProperty(req,"body",{get(){assert.fail();}});
    assert.equal((await validationTimingRequest(req,env)).status,404);
  }
  for(const variant of ["baseline","validated"]) {
    assert.equal((await validationTimingRequest(timed("signup",variant,{value:{...timingFixtures.signup,password:"another secret"}}),timingEnv)).status,422);
  }
  for(const options of [{headers:{"x-stitchtrack-operation":"constructor"}},{headers:{"x-stitchtrack-validation":"other"}},
    {headers:{"x-stitchtrack-assessment":"wrong"}},{url:"http://example.com/api/assessment/validation-timing"}]) {
    const res=await validationTimingRequest(timed("signup","baseline",options),timingEnv);assert.ok([400,404].includes(res.status));
  }
});
test("baseline and validated timing variants use identical synthetic response contracts and actual finite timings",async()=>{
  for(const operation of ["signup","login","reset"]) {
    const bodies=[];
    for(const variant of ["baseline","validated"]) {
      const res=await validationTimingRequest(timed(operation,variant),timingEnv);assert.equal(res.status,200);
      assert.equal(res.headers.has("set-cookie"),false);bodies.push(await res.json());
      const metrics=timingMetrics(res.headers.get("server-timing"));assert.ok(metrics.handler>=0 && metrics.schema>=0);
      if(variant==="baseline")assert.equal(metrics.schema,0);
    }
    assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[0].accountCreated,false);
  }
});
test("owner timing driver validates arithmetic and metrics without making HTTP requests on import",()=>{
  assert.deepEqual(summarize([1,3,2]),{n:3,meanMs:2,medianMs:2,p95Ms:3});
  assert.equal(summarize([1,2,3,4]).medianMs,2.5);
  for(const input of [[],[-1],[NaN],[Infinity]])assert.throws(()=>summarize(input));
  assert.deepEqual(timingMetrics("handler;dur=1.234567, schema;dur=0.001234"),{handler:1.234567,schema:0.001234});
  assert.throws(()=>timingMetrics(""));
  assert.doesNotThrow(()=>authorizeMeasurement(["--owner-measure"],{TASK04_VALIDATION_TIMING_CONFIRMED:"true"}));
  for(const env of [{},{TASK04_VALIDATION_TIMING_CONFIRMED:"true",NODE_ENV:"production"}])assert.throws(()=>authorizeMeasurement(["--owner-measure"],env));
  assert.throws(()=>authorizeMeasurement(["--owner-measure","--url=http://example.com"],{TASK04_VALIDATION_TIMING_CONFIRMED:"true"}));
});
test("new route files wire all methods to the guards and never import auth/storage integrations",()=>{
  for(const operation of ["signup","login","reset"]) {
    const source=readFileSync(new URL(`../../app/api/auth/${operation}/route.ts`,import.meta.url),"utf8");
    assert.ok(source.includes(`previewAuthRequest(request,"${operation}",process.env)`));
    assert.match(source,/handle as POST.*handle as GET.*handle as DELETE/u);
  }
  for(const file of ["../../lib/auth/request.server.ts","../../lib/auth/validation-preview.server.ts","../../lib/assessment/validation-timing.server.ts"]) {
    const source=readFileSync(new URL(file,import.meta.url),"utf8");assert.doesNotMatch(source,/prisma|nodemailer|better.auth|console\./iu);
  }
});
