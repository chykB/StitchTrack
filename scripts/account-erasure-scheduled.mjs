// One exact owner-approved test account. Inert on import; no scheduler or DB setup.
import {pathToFileURL} from "node:url";
import {createHash,randomUUID} from "node:crypto";
import {homedir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {mkdirSync,lstatSync,realpathSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync,rmdirSync,existsSync} from "node:fs";
import {authorizeAccountErasurePreflight} from "./account-erasure-preflight.mjs";
import {authorizeAccountErasureExecute} from "./account-erasure-execute.mjs";
import {withErasureConnection} from "./account-erasure.mjs";
import "./register-server-only.mjs";
const {ERASURE_TABLES,runCleanupTestAccountErasure}=await import("../lib/product-auth/account-erasure.server.ts");
const repo=resolve(dirname(new URL(import.meta.url).pathname),"..");
function syncDirectory(path){const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}}
function privateDirectory(path){
 const stat=lstatSync(path);
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700||realpathSync(path)!==path)throw new Error();
}
function privateJson(path){
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||stat.size>8192)throw new Error();
 return JSON.parse(readFileSync(path,"utf8"));
}
function save(path,value,replace=false){
 const file=replace?path+".new":path,fd=openSync(file,"wx",0o600);
 try{writeFileSync(fd,JSON.stringify(value)+"\n");fsyncSync(fd);}finally{closeSync(fd);}
 if(replace)renameSync(file,path);syncDirectory(dirname(path));
}
export async function authorizeScheduledErasure(config,env){
 if(!config||Object.keys(config).sort().join()!=="databaseUrl,executionConfirmed,executionEnabled,format,ownerApproved,requestedAt,userId"||
  config.format!==1||config.ownerApproved!==true||typeof config.executionEnabled!=="boolean"||
  config.executionConfirmed!==config.executionEnabled)throw new Error();
 const execution=config.executionEnabled;
 const isolated={...env,NODE_ENV:env.NODE_ENV,PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_CLEANUP_CONFIRMED:"true",
  PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_ENABLED:"true",PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_CONFIRMED:"true",
  PRODUCT_ERASURE_DISPOSABLE_TEST_ACCOUNT_CONFIRMED:config.ownerApproved===true?"true":"false",
  PRODUCT_TEST_CLEANUP_DATABASE_URL:config.databaseUrl,PRODUCT_ERASURE_TARGET_USER_ID:config.userId,
  PRODUCT_ERASURE_EXPECTED_REQUESTED_AT:config.requestedAt,
  PRODUCT_ACCOUNT_ERASURE_EXECUTION_ENABLED:execution?"true":"false",PRODUCT_ACCOUNT_ERASURE_EXECUTION_CONFIRMED:execution?"true":"false"};
 const scope=execution?await authorizeAccountErasureExecute(["--owner-execute","--execute","--cleanup-role"],isolated):
  await authorizeAccountErasurePreflight(["--owner-preflight","--dry-run","--cleanup-role"],isolated);
 return {...scope,execution,digest:createHash("sha256").update("stitchtrack/scheduled-erasure/v1\0"+JSON.stringify(scope.approval)).digest("hex")};
}
function checkedCounts(value){
 if(!value||Object.keys(value).sort().join()!==[...ERASURE_TABLES].sort().join()||
  Object.values(value).some(n=>!Number.isSafeInteger(n)||n<0||n>1000))throw new Error();
 return Object.fromEntries(ERASURE_TABLES.map(table=>[table,value[table]]));
}
const operate=(scope,mode)=>withErasureConnection(scope.target,db=>runCleanupTestAccountErasure(db,scope.approval,mode,true));
// Filesystem latch is intentionally persistent after failures, including process death.
// Only a confirmed, recorded safe outcome releases it. Systemd also serializes this unit.
export async function runScheduledErasure({env=process.env,readConfig,directory,operation=operate,log=value=>console.log(JSON.stringify(value))}){
 const run=randomUUID(),startedAt=new Date().toISOString();let held=false,finished=false,stage="authorization";
 const emit=(phase,status,counts=null)=>log({job:"account-erasure-hourly",phase,run,status,counts,timestamp:new Date().toISOString(),startedAt});
 emit("start","starting");
 const interrupted=()=>{if(!finished)emit("finish","unconfirmed");};process.once("exit",interrupted);
 const finish=(status,counts=null,release=false)=>{
  const report={format:1,run,status,counts,startedAt,finishedAt:new Date().toISOString()};
  if(held)save(join(directory,"last-run.json"),report,true);
  emit("finish",status,counts);
  if(held&&release){unlinkSync(join(directory,"guard","attempt.json"));rmdirSync(join(directory,"guard"));syncDirectory(directory);held=false;}
  finished=true;
  return report;
 };
 try{
  if(env.PRODUCT_ERASURE_SCHEDULER_ENABLED!=="true")return finish("disabled");
  if(process.platform!=="linux"||env.NODE_ENV!=="test"||process.versions.node.split(".")[0]!=="24")return finish("blocked");
  privateDirectory(directory);
  try{mkdirSync(join(directory,"guard"),{mode:0o700});held=true;}
  catch(error){if(error.code==="EEXIST")return finish("blocked_previous_or_concurrent_run");throw error;}
  save(join(directory,"guard","attempt.json"),{format:1,run,startedAt});syncDirectory(directory);
  const scope=await authorizeScheduledErasure(readConfig(),env);
  const binding=join(directory,"scope.json");
  if(existsSync(binding)){
   const saved=privateJson(binding);if(saved.format!==1||saved.digest!==scope.digest)throw new Error();
  }else save(binding,{format:1,digest:scope.digest});
  const erasedFile=join(directory,"erased.json");let previous;
  if(existsSync(erasedFile)){
   previous=privateJson(erasedFile);
   if(previous.format!==1||previous.digest!==scope.digest||previous.status!=="erased")throw new Error();
   checkedCounts(previous.counts);
  }
  stage="preflight";const preflight=await operation(scope,"dry-run");
  if(preflight.status==="grace_period"&&!previous)return finish("grace_period",null,true);
  if(preflight.status==="eligible"&&!previous){
   checkedCounts(preflight.wouldAffect);
   if(!scope.execution)return finish("eligible_dry_run",null,true);
  }else if(preflight.status!=="missing"||!previous){
   return finish(preflight.status==="failed"?"failed":"blocked");
  }else if(!scope.execution)return finish("missing_after_recorded_erasure_dry_run",null,true);
  // Engine repeats all identity/grace/relationship checks in its execution transaction.
  stage="execute";const result=await operation(scope,"execute");
  if(result.outcome==="erased"&&!previous){
   const counts=checkedCounts(result.counts);
   stage="receipt";save(erasedFile,{format:1,digest:scope.digest,run,status:"erased",counts,startedAt,finishedAt:new Date().toISOString()});
   return finish("erased",counts,true);
  }
  if(result.outcome==="noop"&&previous){
   const counts=checkedCounts(result.counts);if(Object.values(counts).some(Boolean))throw new Error();
   return finish("noop_after_recorded_erasure",counts,true);
  }
  if(result.outcome==="failed_rolled_back"){
   const counts=checkedCounts(result.counts);if(Object.values(counts).some(Boolean))throw new Error();
   return finish("failed_rolled_back",counts);
  }
  return finish(result.outcome==="blocked"?"blocked":"unconfirmed");
 }catch{
  // Unknown errors include commit, connection cleanup and durable receipt failures.
  // Keep the guard; neither exception messages nor configuration are serialized.
  const status=stage==="authorization"?"blocked":stage==="preflight"?"failed":"unconfirmed";
  try{return finish(status);}catch{finished=true;emit("finish","unconfirmed");return {status:"unconfirmed",counts:null,run};}
 }finally{process.removeListener("exit",interrupted);}
}
async function main(){
 if(process.argv.slice(2).join()!=="--owner-hourly")throw new Error();
 const directory=join(homedir(),".local","state","stitchtrack-account-erasure");
 const result=await runScheduledErasure({directory,readConfig:()=>{
  if(process.env.STATE_DIRECTORY!==directory)throw new Error();
  const credentials=process.env.CREDENTIALS_DIRECTORY;
  if(!credentials||!credentials.startsWith("/")||resolve(credentials)!==credentials||
   credentials===repo||credentials.startsWith(repo+"/")||realpathSync(credentials)!==credentials)throw new Error();
  return privateJson(join(credentials,"erasure.json"));
 }});
 if(!["disabled","grace_period","eligible_dry_run","missing_after_recorded_erasure_dry_run","erased","noop_after_recorded_erasure"].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main();}catch{
 console.error(JSON.stringify({job:"account-erasure-hourly",phase:"refused",status:"blocked",counts:null}));process.exitCode=1;
}}
