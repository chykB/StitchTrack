// Owner-only orchestration; no subprocess, generation or connection on import.
import { spawnSync } from "node:child_process";
import { readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync } from "node:fs";
import { fileURLToPath,pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { requireDriftOwner,connectionOptions,workingSchemas,canonicalUrl,workUrl,
  configPath,assertMigrationFiles,digest } from "./policy.ts";
const relativeBase="task-04-server-security/experiments/runtime-drift/";
function requireResult(ok) { if(!ok) throw new Error("Unexpected phase result; preserve partial output."); }
export function parseReadOutput(stdout) {
  const get=tag=>JSON.parse(stdout.split("\n").find(line=>line.startsWith(tag))?.slice(tag.length) ?? "null");
  return {metadata:get("TASK04_METADATA="),rows:get("TASK04_ROWS=")};
}
function noSymlink(url) {
  try { requireResult(!lstatSync(url).isSymbolicLink()); }
  catch(error) { if(error?.code!=="ENOENT") throw error; }
}
function runOwner(args) {
  if(args.length!==1 || !["--owner-run","--owner-restore-only"].includes(args[0])) throw new Error("Explicit owner drift operation required.");
  requireDriftOwner(); connectionOptions(); assertMigrationFiles();
  requireResult(process.versions.node.split(".")[0]==="24");
  const repo=fileURLToPath(new URL("../../../",import.meta.url)).replace(/\/$/u,"");
  requireResult(process.cwd()===repo);
  const canonical=readFileSync(canonicalUrl,"utf8"), schemas=workingSchemas(canonical);
  for(const name of ["prisma","@prisma/client","@prisma/adapter-pg","pg"]) {
    const pkg=JSON.parse(readFileSync(new URL("../../../node_modules/"+name+"/package.json",import.meta.url),"utf8"));
    requireResult(pkg.version===(name==="pg"?"8.16.3":"7.10.1")); console.log("Installed: "+name+" "+pkg.version);
  }
  const ignored=spawnSync("git",["check-ignore","--quiet","--",relativeBase+"work/schema.prisma"]);
  const tracked=spawnSync("git",["ls-files","--",relativeBase+"work"],{encoding:"utf8"});
  requireResult(ignored.status===0 && tracked.status===0 && !tracked.stdout.trim());
  noSymlink(workUrl);
  const restoreOnly=args[0]==="--owner-restore-only";
  if(!restoreOnly) mkdirSync(workUrl); // Refuse existing/partial work; never delete or reset it.
  else requireResult(existsSync(workUrl));
  for(const name of ["schema.prisma","client","package.json"]) noSymlink(new URL(name,workUrl));
  const file=new URL("schema.prisma",workUrl);
  if(restoreOnly) requireResult([schemas.correct,schemas.drifted].includes(readFileSync(file,"utf8")));
  else {
    writeFileSync(new URL("package.json",workUrl),'{"type":"module"}\n',{flag:"wx"});
    writeFileSync(file,schemas.correct,{flag:"wx"});
  }
  const common={};
  for(const key of ["PATH","HOME","TMPDIR","LANG","NODE_ENV","TASK04_RUNTIME_DRIFT_CONFIRMED"]) {
    if(process.env[key]!==undefined) common[key]=process.env[key];
  }
  const generationEnv={...common,PRISMA_GENERATE_SKIP_AUTOINSTALL:"true",CHECKPOINT_DISABLE:"1"};
  const readerEnv={...common};
  for(const key of ["TASK04_DATABASE_URL","TASK04_EXPECTED_HOST","TASK04_EXPECTED_PORT","TASK04_DATABASE_CONFIRMED"]) {
    if(process.env[key]!==undefined) readerEnv[key]=process.env[key];
  }
  function child(binary,operands,env,label) {
    console.log("Command: "+[binary,...operands].map(x=>JSON.stringify(x)).join(" "));
    const result=spawnSync(binary,operands,{env,encoding:"utf8",maxBuffer:8*1024*1024,stdio:["inherit","pipe","pipe"]});
    process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
    console.log(label+"_exit_status="+result.status);
    requireResult(!result.error && !result.signal);
    return result;
  }
  function generate(label) {
    for(const name of ["schema.prisma","client"]) noSymlink(new URL(name,workUrl));
    requireResult(child("./node_modules/.bin/prisma",["generate","--config",configPath],generationEnv,label+"_generate").status===0);
  }
  function read(label) {
    return child(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",relativeBase+"read-users.mjs","--owner-read",label],readerEnv,label+"_read");
  }
  if(restoreOnly) {
    writeFileSync(file,schemas.correct); generate("restored"); requireResult(read("restored").status===0);
    console.log("RESTORE ONLY completed; this is not a new full drift demonstration."); return;
  }
  console.log("Canonical schema SHA-256: "+digest(canonical));
  generate("baseline");
  const initial=read("baseline"); requireResult(initial.status===0);
  const baseline=parseReadOutput(initial.stdout);
  let expectedDrift=false;
  try {
    writeFileSync(file,schemas.drifted);
    console.log("Working-schema-only change: added task04DriftProbe String? @db.Text to User; no SQL/migration executed.");
    console.log("Drifted working schema SHA-256: "+digest(schemas.drifted));
    generate("drifted");
    const bad=read("drifted");
    expectedDrift=bad.status===2 && bad.stderr.includes("P2022");
    requireResult(isDeepStrictEqual(parseReadOutput(bad.stdout).metadata,baseline.metadata));
    requireResult(expectedDrift);
  } finally {
    // Correct the ignored local source/client even on an unexpected drift result.
    // This is filesystem restoration plus read-only verification, never a DB repair/retry.
    noSymlink(file); writeFileSync(file,schemas.correct);
    console.log("Restored correct working schema SHA-256: "+digest(schemas.correct));
    generate("restored");
    const corrected=read("restored"); requireResult(corrected.status===0);
    requireResult(isDeepStrictEqual(parseReadOutput(corrected.stdout),baseline));
    requireResult(readFileSync(canonicalUrl,"utf8")===canonical); assertMigrationFiles();
  }
  requireResult(expectedDrift);
  console.log("All requested phases completed; review actual reads/error/statuses. Canonical schema, users and migration history are unchanged.");
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {runOwner(process.argv.slice(2));}
  catch {console.error("STOP: experiment did not complete. Preserve evidence/work files; inspect restoration status before continuing.");process.exitCode=1;}
}
