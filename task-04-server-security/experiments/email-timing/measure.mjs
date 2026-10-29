// OWNER ONLY: self-contained real loopback HTTP measurements; no production worker.
import {createServer, request} from "node:http";
import {mkdtemp, rmdir} from "node:fs/promises";
import {tmpdir, platform, release, arch} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {pathToFileURL} from "node:url";
import {setImmediate as yieldTurn} from "node:timers/promises";
import {execFileSync} from "node:child_process";
import {authorizeTiming,validEnvelope,FIXTURE,fileStore,controlledTransport,createTimingWorkflow,completeResponse,TRANSPORT_DELAY_MS} from "./workflow.mjs";

export function summary(values) {
  if(!values.length || values.some(v=>!Number.isFinite(v)||v<0))throw new Error("Invalid measurements");
  const a=[...values].sort((a,b)=>a-b),n=a.length;
  return {n,meanMs:a.reduce((x,y)=>x+y,0)/n,medianMs:n%2?a[n>>1]:(a[n/2-1]+a[n/2])/2,minMs:a[0],maxMs:a[n-1]};
}
async function measure() {
  const directory=await mkdtemp(join(tmpdir(),"stitchtrack-email-timing-")),store=fileStore(directory);
  const workflow=createTimingWorkflow(store,controlledTransport()),token=randomBytes(32).toString("hex");
  let authority,busy=false,resolveSample,rejectSample,inFlight=Promise.resolve(),watchdog;
  const server=createServer((incoming,outgoing)=>{
    if(!validEnvelope(incoming,authority,token) || busy) {outgoing.writeHead(403,{connection:"close"});outgoing.end();return;}
    busy=true;
    inFlight=(async()=>{
      const received=performance.now();let body="";
      for await(const chunk of incoming){body+=chunk.toString("utf8");if(Buffer.byteLength(body)>1024)throw new Error();}
      const job=await workflow.prepare(JSON.parse(body));
      const mode=incoming.url.slice(1);
      const respond=()=>new Promise((resolve,reject)=>{
        outgoing.once("error",reject);outgoing.once("close",()=>{if(!outgoing.writableFinished)reject(new Error());});
        outgoing.once("finish",()=>resolve(performance.now()));
        outgoing.writeHead(202,{"content-type":"application/json","cache-control":"no-store",connection:"close"});
        outgoing.end(JSON.stringify({experiment:"controlled-email-timing",mode,outcome:mode==="sync"?"controlled_complete":"queued_in_process",accountCreated:false,emailSent:false}));
      });
      const {delivery,responseAt}=await completeResponse(mode,job,respond,yieldTurn);
      resolveSample({mode,status:202,serverResponseMs:responseAt-received,preCommitMs:job.preCommitMs,commitMs:job.commitMs,
        dispatchMs:delivery.dispatchMs,commitToCompletionMs:delivery.completedAt-job.committedAt,responseToCompletionMs:delivery.completedAt-responseAt});
    })().catch(()=>{if(!outgoing.headersSent)outgoing.writeHead(503,{connection:"close"});outgoing.end();rejectSample?.(new Error("Sample failed"));})
      .finally(()=>{busy=false;});
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.timeout=10000;server.maxHeadersCount=24;
  const sample=async mode=>{
    let result;
    const completion=new Promise((resolve,reject)=>{resolveSample=resolve;rejectSample=reject;});
    // Attach rejection observation immediately, even if HTTP fails first.
    completion.catch(()=>{});
    const started=performance.now();
    const http=new Promise((resolve,reject)=>{
      const req=request({host:"127.0.0.1",port:server.address().port,path:"/"+mode,method:"POST",agent:false,
        headers:{host:authority,authorization:"Bearer "+token,"content-type":"application/json"},timeout:10000},res=>{
        let body="";res.on("data",chunk=>{body+=chunk;});res.on("error",reject);res.on("end",()=>{
          try{const data=JSON.parse(body);if(res.statusCode!==202 || res.headers["set-cookie"] || data.emailSent!==false || data.accountCreated!==false || data.mode!==mode)throw new Error();
            resolve(performance.now()-started);}catch{reject(new Error("Unexpected HTTP response"));}
        });
      });
      req.on("timeout",()=>req.destroy(new Error("HTTP timeout")));req.on("error",reject);req.end(JSON.stringify(FIXTURE));
    });
    const [clientHttpMs,details]=await Promise.all([http,completion]);result={...details,clientHttpMs};await inFlight;return result;
  };
  try {
    // Only this explicitly invoked owner command starts a listener.
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    authority="127.0.0.1:"+server.address().port;
    watchdog=setTimeout(()=>{console.error("STOP: benchmark deadline exceeded; no success claimed. Private scratch files may remain under the run-owned temporary directory.");process.exit(1);},60000);
    console.log("EVIDENCE 18 - ACTUAL OWNER HTTP TIMINGS WITH CONTROLLED TRANSPORT");
    console.log(JSON.stringify({started:new Date().toISOString(),revision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),node:process.version,platform:platform(),release:release(),arch:arch(),target:"127.0.0.1 (ephemeral port)"}));
    console.log("CONTROLLED: shared Zod/Argon2id/HMAC/AES-GCM/template; private fsync+rename LOCAL FILE commit, NOT PostgreSQL/Better Auth registration.");
    console.log("NO SMTP, HIBP, Terms approval, accounts, sessions, production worker or historical records. Queue is in-process, NOT production durable recovery.");
    console.log("Same synthetic fixture and dispatcher in both modes; controlled delay "+TRANSPORT_DELAY_MS+"ms (configured delay is not a measured result).");
    console.log("HTTP 202: sync after controlled completion; background after file commit, dispatch starts after server finish. Client timing includes response body; negative sync responseToCompletionMs is expected.");
    console.log("2 warm-up pairs excluded; 5 measured pairs, alternating order. Each sample awaits background completion before the next.");
    for(let n=0;n<2;n++)for(const mode of ["sync","background"])await sample(mode);
    const rows={sync:[],background:[]};
    for(let pair=0;pair<5;pair++)for(const mode of pair%2?["background","sync"]:["sync","background"]) {
      const row=await sample(mode);rows[mode].push(row);console.log(JSON.stringify({pair:pair+1,...row}));
    }
    for(const mode of ["sync","background"])console.log("SUMMARY "+mode+" "+JSON.stringify({http:summary(rows[mode].map(r=>r.clientHttpMs)),dispatch:summary(rows[mode].map(r=>r.dispatchMs)),commit:summary(rows[mode].map(r=>r.commitMs))}));
    console.log("DELTA_MEAN_HTTP_MS sync-background="+(summary(rows.sync.map(r=>r.clientHttpMs)).meanMs-summary(rows.background.map(r=>r.clientHttpMs)).meanMs));
    console.log("LIMIT: measures controlled local scheduling/response boundaries, not real SMTP latency, production PostgreSQL transactions or eligible worker dispatch.");
  } finally {
    await inFlight;
    server.closeAllConnections();if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await store.cleanup();await rmdir(directory);clearTimeout(watchdog);
    console.log("CLEANUP: listener closed and private run-owned scratch records removed.");
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{authorizeTiming(process.argv.slice(2),process.env);await measure();}
  catch{console.error("STOP: controlled benchmark incomplete. Preserve partial output; no real delivery or completed evidence is claimed.");process.exitCode=1;}
}
