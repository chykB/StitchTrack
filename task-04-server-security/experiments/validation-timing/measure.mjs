// Owner-run HTTP measurements only; importing this module does not make requests.
import { pathToFileURL } from "node:url";
import { platform,arch,release } from "node:os";
import { timingFixtures,VALIDATION_TIMING_MARKER } from "../../../lib/assessment/validation-timing-fixtures.ts";
const endpoint="http://127.0.0.1:3106/api/assessment/validation-timing";
export function summarize(values) {
  if(!values.length || values.some(v=>!Number.isFinite(v)||v<0))throw new Error("Invalid measured sample set.");
  const sorted=[...values].sort((a,b)=>a-b),n=values.length;
  return {n,meanMs:values.reduce((a,b)=>a+b,0)/n,medianMs:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,p95Ms:sorted[Math.ceil(n*.95)-1]};
}
export function timingMetrics(header) {
  const result={};
  for(const key of ["handler","schema"]) {
    const match=header?.match(new RegExp("(?:^|, )"+key+";dur=([0-9]+(?:\\.[0-9]+)?)"));
    if(!match)throw new Error("Missing actual Server-Timing metric.");
    result[key]=Number(match[1]);
    if(!Number.isFinite(result[key]))throw new Error("Invalid timing metric.");
  }
  return result;
}
export function authorizeMeasurement(args,env) {
  if(args.length!==1 || args[0]!=="--owner-measure" || env.TASK04_VALIDATION_TIMING_CONFIRMED!=="true" || env.NODE_ENV==="production")throw new Error("Explicit owner HTTP timing confirmation required.");
}
async function sample(operation,variant) {
  const started=performance.now();
  const response=await fetch(endpoint,{method:"POST",redirect:"error",credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(10000),headers:{
    "content-type":"application/json","x-stitchtrack-assessment":VALIDATION_TIMING_MARKER,
    "x-stitchtrack-operation":operation,"x-stitchtrack-validation":variant,
  },body:JSON.stringify(timingFixtures[operation])});
  const text=await response.text(),clientMs=performance.now()-started;
  if(response.status!==200 || response.headers.has("set-cookie") || response.headers.get("x-stitchtrack-validation-variant")!==variant)throw new Error("Unexpected HTTP fixture response.");
  const body=JSON.parse(text);
  if(body.assessmentFixture!==VALIDATION_TIMING_MARKER || body.outcome!=="fixture_completed" ||
    [body.accountCreated,body.sessionCreated,body.persisted,body.emailSent].some(v=>v!==false))throw new Error("Fixture contract mismatch.");
  const metrics=timingMetrics(response.headers.get("server-timing"));
  return {status:response.status,clientMs,handlerMs:metrics.handler,schemaMs:metrics.schema};
}
async function measure() {
  console.log("Owner HTTP comparison started:",new Date().toISOString());
  console.log("Node",process.versions.node,"OS",platform(),release(),arch());
  console.log("Target:",endpoint,"(fixed synthetic fixture; NOT registration)");
  console.log("Same POST body per operation; baseline retains envelope/JSON/fixed-payload guards but omits shared Zod schemas.");
  console.log("5 warm-ups per variant/operation excluded; 30 measured alternating-order pairs per operation; sequential requests.");
  console.log("No hashing, database, SMTP or authentication service. Server handler timing excludes response serialization/framework routing.");
  for(const operation of Object.keys(timingFixtures)) {
    for(let i=0;i<5;i++)for(const variant of ["baseline","validated"])await sample(operation,variant);
    const rows={baseline:[],validated:[]};
    for(let pair=0;pair<30;pair++) {
      const order=pair%2?["validated","baseline"]:["baseline","validated"];
      for(const variant of order) {
        const row=await sample(operation,variant);rows[variant].push(row);
        console.log(JSON.stringify({operation,pair:pair+1,variant,...row}));
      }
    }
    const summary={};
    for(const variant of ["baseline","validated"]) summary[variant]={
      client:summarize(rows[variant].map(row=>row.clientMs)),handler:summarize(rows[variant].map(row=>row.handlerMs)),schema:summarize(rows[variant].map(row=>row.schemaMs))};
    console.log("SUMMARY",operation,JSON.stringify(summary));
    console.log("DELTA_MEANS_MS",operation,JSON.stringify({
      client:summary.validated.client.meanMs-summary.baseline.client.meanMs,
      handler:summary.validated.handler.meanMs-summary.baseline.handler.meanMs,
    }));
  }
  console.log("Measurements complete. Interpret noise/negative deltas honestly; these are not real registration timings.");
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {authorizeMeasurement(process.argv.slice(2),process.env);}
  catch {console.error("STOP: HTTP timing not authorized.");process.exitCode=1;}
  if(!process.exitCode)measure().catch(()=>{console.error("STOP: HTTP comparison incomplete; preserve partial output, no measured success is claimed.");process.exitCode=1;});
}
