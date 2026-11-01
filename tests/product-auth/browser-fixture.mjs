// OWNER ONLY. Import is inert. Never runs the old transport proof or a listener.
import {pathToFileURL} from "node:url";
import {randomUUID,createHash,createHmac} from "node:crypto";
import {mkdirSync,lstatSync,openSync,writeFileSync,readFileSync,closeSync,fsyncSync} from "node:fs";
import {join} from "node:path";
import {userInfo} from "node:os";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig,productMigrationConfig} from "../../prisma/product/targets.ts";
import {assertProductMigrationFiles,PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {transportPlan} from "./https-transport.integration.mjs";

export const BROWSER_FIXTURE_TABLES=Object.freeze(["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailVerificationIssuance","EmailOutbox","AuthRateBucket"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH=/^[a-f0-9]{64}$/u,LOCK="stitchtrack/browser-fixture";
export const LOST_RATE_KEY_RUN="cb2f5b71-d19e-4427-b2c9-cf839eeae89c";
const sha=value=>createHash("sha256").update(value).digest("hex");
// Only fixed labels cross the CLI error boundary; never exception messages/causes.
export function fixtureFailureMessage(stage) {
  const labels=["configuration","migration_files","dependencies","fixture_preparation","password_validation","password_hashing",
    "database_connection","role_verification","setup_lock","preflight_transaction","migration_history","permissions","quiescence",
    "identity_absence","baseline","manifest_write","preflight_commit","runtime_client","fixture_creation","fixture_verification",
    "fixture_commit","setup_receipt","connection_cleanup","cleanup","lost_key_recovery"];
  const label=labels.includes(stage)?stage:"unknown";
  return "STOP: browser fixture operation unconfirmed (failure_stage="+label+"). Preserve run UUID/private manifest; no automatic retry, cleanup or private-file deletion.";
}
export function authorizeBrowserFixture(args,env) {
  if(process.platform!=="linux"||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||
    env.ENABLE_PRODUCT_SESSION_HTTP==="true"||env.PRODUCT_EMAIL_WORKER_ENABLED==="true"||
    ["NODE_OPTIONS","DEBUG","NODE_DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new Error();
  const recoveryMode=args[0]==="--owner-lost-key-inspect"?"inspect":args[0]==="--owner-lost-key-cleanup"?"apply":null;
  if(recoveryMode) {
    if(args.length!==2||args[1]!==LOST_RATE_KEY_RUN||env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY||
      env.PRODUCT_BROWSER_SETUP_CONFIRMED==="true"||env.PRODUCT_BROWSER_CLEANUP_CONFIRMED==="true"||
      env.ENABLE_PRODUCT_REGISTRATION_HTTP==="true"||env.ENABLE_LOCAL_AUTH_FRONTEND==="true"||
      env.PRODUCT_BROWSER_GATEWAY_STOPPED!=="true"||env.PRODUCT_BROWSER_CLIENT_CLOSED!=="true"||
      (recoveryMode==="inspect"?(env.PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED!=="true"||env.PRODUCT_BROWSER_LOST_KEY_CLEANUP_CONFIRMED==="true"):
        (env.PRODUCT_BROWSER_LOST_KEY_CLEANUP_CONFIRMED!=="true"||env.PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED==="true"||!HASH.test(env.PRODUCT_BROWSER_RECOVERY_PLAN??""))))throw new Error();
    return {action:"lost-key",mode:recoveryMode,run:LOST_RATE_KEY_RUN,migrator:productMigrationConfig(env),approval:env.PRODUCT_BROWSER_RECOVERY_PLAN};
  }
  if(env.PRODUCT_BROWSER_LOST_KEY_INSPECT_CONFIRMED==="true"||env.PRODUCT_BROWSER_LOST_KEY_CLEANUP_CONFIRMED==="true")throw new Error();
  const key=Buffer.from(env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY??"","base64");
  if(key.length!==32||key.toString("base64")!==env.PRODUCT_LOCAL_RATE_IDENTIFIER_KEY)throw new Error();
  const migrator=productMigrationConfig(env);
  if(args.length===1&&args[0]==="--owner-setup"&&env.PRODUCT_BROWSER_SETUP_CONFIRMED==="true"&&env.PRODUCT_BROWSER_CLEANUP_CONFIRMED!=="true") {
    if(!env.PRODUCT_BROWSER_FIXTURE_PASSWORD)throw new Error();
    return {action:"setup",runtime:productDatabaseConfig(env),migrator,key};
  }
  if(args.length===2&&args[0]==="--owner-cleanup"&&UUID.test(args[1])&&env.PRODUCT_BROWSER_CLEANUP_CONFIRMED==="true"&&
    env.PRODUCT_BROWSER_SETUP_CONFIRMED!=="true"&&env.PRODUCT_BROWSER_GATEWAY_STOPPED==="true"&&env.PRODUCT_BROWSER_CLIENT_CLOSED==="true")return {action:"cleanup",run:args[1],migrator,key};
  throw new Error();
}
// Format 2 versions the identity, bucket-key and baseline contract, not source bytes.
export const BROWSER_FIXTURE_FORMAT=2;
const root=()=>join(userInfo().homedir,".stitchtrack-browser-fixtures");
const directory=run=>{if(!UUID.test(run))throw new Error();return join(root(),run);};
function owned(path,dir=false) {
  const s=lstatSync(path);if(s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o777)!==(dir?0o700:0o600)||(dir?!s.isDirectory():!s.isFile()||s.nlink!==1))throw new Error();return s;
}
function syncDir(path){const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}}
function exclusiveJson(path,value){const fd=openSync(path,"wx",0o600);try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}}
function saveManifest(m) {
  try{mkdirSync(root(),{mode:0o700});syncDir(userInfo().homedir);}catch(e){if(e.code!=="EEXIST")throw e;}
  owned(root(),true);mkdirSync(directory(m.run),{mode:0o700});syncDir(root());
  exclusiveJson(join(directory(m.run),"manifest.json"),m);syncDir(directory(m.run));
}
function validateManifestRecord(m,run) {
  if(!m||Object.keys(m).sort().join()!=="baseline,createdAt,format,passwordDigest,rateKeyDigest,run"||m.format!==BROWSER_FIXTURE_FORMAT||m.run!==run||!UUID.test(run)||
    !HASH.test(m.rateKeyDigest)||!HASH.test(m.passwordDigest)||new Date(m.createdAt).toISOString()!==m.createdAt||
    Object.keys(m.baseline??{}).sort().join()!==[...BROWSER_FIXTURE_TABLES].sort().join()||
    Object.values(m.baseline).some(v=>Object.keys(v).sort().join()!=="count,digest"||!Number.isSafeInteger(v.count)||v.count<0||!HASH.test(v.digest))||m.baseline.User.count!==10)throw new Error();
  return m;
}
export function validateManifest(m,run,key) {
  validateManifestRecord(m,run);if(m.rateKeyDigest!==sha(key))throw new Error();return m;
}
function readManifest(run) {
  owned(root(),true);owned(directory(run),true);const file=join(directory(run),"manifest.json");if(owned(file).size>8192)throw new Error();
  return JSON.parse(readFileSync(file,"utf8"));
}
function loadManifest(run,key){return validateManifest(readManifest(run),run,key);}
const pgOptions=(target,name)=>({connectionString:target.url,application_name:name,ssl:false,connectionTimeoutMillis:5000,query_timeout:7000,
  statement_timeout:5000,lock_timeout:2500,idle_in_transaction_session_timeout:12000});
async function identity(db,target) {
  const r=(await db.query(`SELECT current_database() AS db,current_user AS role,session_user AS actor,current_setting('port') AS port,
    NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`)).rows;
  if(r.length!==1||r[0].db!==target.database||r[0].role!==target.user||r[0].actor!==target.user||r[0].port!=="5432"||r[0].safe!==true)throw new Error();
}
async function history(db) {
  const tables=(await db.query(`SELECT c.relname,pg_get_userbyid(c.relowner)=current_user AS owned FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='product' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
  if(tables.some(t=>!t.owned)||JSON.stringify(tables.map(t=>t.relname).sort())!==JSON.stringify([...BROWSER_FIXTURE_TABLES,"_prisma_migrations"].sort())||
    (await db.query("SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user")).rowCount!==1||
    (await db.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND n.nspname<>'product'")).rowCount)throw new Error();
  const rows=(await db.query("SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations")).rows;
  if(rows.length!==Object.keys(PRODUCT_MIGRATIONS).length||new Set(rows.map(r=>r.migration_name)).size!==rows.length||rows.some(r=>!Object.hasOwn(PRODUCT_MIGRATIONS,r.migration_name)||PRODUCT_MIGRATIONS[r.migration_name]!==r.checksum||!r.finished_at||r.rolled_back_at||r.logs!==null||r.applied_steps_count!==1))throw new Error();
}
async function quiescent(db,allowed=[]) {
  if((await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND NOT(pid=ANY($1::integer[]))",[allowed])).rowCount)throw new Error();
}
export async function fixtureSnapshot(db,plan) {
  const result={};
  for(const table of BROWSER_FIXTURE_TABLES) {
    const filter=table==="User"||table==="Account"?' WHERE t.id<>$1':table==="Session"?' WHERE t."userId"<>$1':table==="AuthRateBucket"?' WHERE t."keyDigest"<>ALL($1::text[])':"";
    const arg=table==="Account"?plan.credentialId:table==="AuthRateBucket"?plan.keys:plan.id;
    const rows=(await db.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM product."${table}" t${filter} ORDER BY h`,filter?[arg]:[])).rows;
    result[table]={count:rows.length,digest:sha(JSON.stringify(rows))};
  }return result;
}
export function sameBaseline(actual,expected){if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error("Historical baseline mismatch.");}
async function begin(db,readOnly=false) {
  await db.query(readOnly?"BEGIN READ ONLY":"BEGIN");await db.query("SET LOCAL search_path=pg_catalog");await db.query("SET LOCAL TIME ZONE 'UTC'");
}
async function permissions(db,role) {
  for(const table of BROWSER_FIXTURE_TABLES)if(!(await db.query("SELECT has_table_privilege($1,$2,'SELECT') AS yes",[role,'product."'+table+'"'])).rows[0].yes)throw new Error();
  for(const table of ["User","Account"])if(!(await db.query("SELECT has_table_privilege($1,$2,'INSERT') AS yes",[role,'product."'+table+'"'])).rows[0].yes)throw new Error();
  if((await db.query(`SELECT has_schema_privilege($1,'product','CREATE') OR pg_has_role($1,current_user,'MEMBER') OR
    has_table_privilege($1,'product._prisma_migrations','SELECT,INSERT,UPDATE,DELETE') OR
    has_table_privilege($1,'product."User"','UPDATE,DELETE,TRUNCATE') OR has_table_privilege($1,'product."Account"','UPDATE,DELETE,TRUNCATE') AS broad`,[role])).rows[0].broad)throw new Error();
}
export function validateFixtureRows(plan,m,users,accounts,sessions,buckets) {
  if(users.length!==1||accounts.length!==1||sessions.length>5||buckets.length>plan.keys.length)throw new Error();
  for(const u of users)if(u.id!==plan.id||u.name!==plan.name||u.emailCanonical!==plan.email||u.emailVerified!==true||u.disabledAt!==null||u.deletionRequestedAt!==null||u.image!==null||u.createdAt!==m.createdAt||u.updatedAt!==m.createdAt)throw new Error();
  for(const a of accounts)if(a.id!==plan.credentialId||a.userId!==plan.id||a.accountId!==plan.id||a.providerId!=="credential"||a.passwordDigest!==m.passwordDigest||a.createdAt!==m.createdAt||a.updatedAt!==m.createdAt||
    ["accessToken","refreshToken","idToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope"].some(k=>a[k]!==null))throw new Error();
  for(const s of sessions)if(s.userId!==plan.id||!/^hmac-sha256:v1:[a-f0-9]{64}$/u.test(s.token)||!Number.isFinite(Date.parse(s.createdAt))||!Number.isFinite(Date.parse(s.expiresAt))||
    Date.parse(s.createdAt)<Date.parse(m.createdAt)||Date.parse(s.expiresAt)<=Date.parse(s.createdAt)||Date.parse(s.expiresAt)-Date.parse(s.createdAt)>604800000)throw new Error();
  for(const b of buckets) {
    const expected=plan.buckets[b.keyDigest];
    if(!expected||b.capacity!==expected.capacity||b.refillIntervalMs!==expected.refillIntervalMs)throw new Error();
  }
}
export function browserFixturePlan(run,key) {
  const plan=transportPlan(run,key),buckets={};
  for(const [op,kind,value] of [["login","account",plan.email],["login","account",plan.unknown],["login","ip","127.0.0.1"],["session","ip","127.0.0.1"],["logout","ip","127.0.0.1"]]) {
    const digest="rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1",op,plan.policy[op].version,kind,value])).digest("hex");
    buckets[digest]=plan.policy[op][kind];
  }
  if(JSON.stringify(Object.keys(buckets).sort())!==JSON.stringify(plan.keys))throw new Error();
  return {...plan,buckets};
}
async function absent(db,plan) {
  for(const [sql,args] of [
    ['SELECT 1 FROM product."User" WHERE id=$1 OR "emailCanonical"=ANY($2::text[])',[plan.id,[plan.email,plan.unknown]]],
    ['SELECT 1 FROM product."Account" WHERE id=$1 OR "userId"=$2 OR "accountId"=$2',[plan.credentialId,plan.id]],
    ['SELECT 1 FROM product."Session" WHERE "userId"=$1',[plan.id]],
    ['SELECT 1 FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.keys]]
  ])if((await db.query(sql,args)).rows.length)throw new Error();
}
async function fixtureRows(db,plan) {
  const users=(await db.query('SELECT * FROM product."User" WHERE id=$1 OR "emailCanonical"=ANY($2::text[])',[plan.id,[plan.email,plan.unknown]])).rows;
  const accounts=(await db.query(`SELECT id,"userId","accountId","providerId",encode(sha256(convert_to(password,'UTF8')),'hex') AS "passwordDigest",
    "createdAt","updatedAt","accessToken","refreshToken","idToken","accessTokenExpiresAt","refreshTokenExpiresAt",scope
    FROM product."Account" WHERE id=$1 OR "userId"=$2 OR "accountId"=$2`,[plan.credentialId,plan.id])).rows;
  const sessions=(await db.query('SELECT id,"userId",token,"createdAt","updatedAt","expiresAt","ipAddress","userAgent" FROM product."Session" WHERE "userId"=$1 ORDER BY id',[plan.id])).rows;
  const buckets=(await db.query('SELECT "keyDigest",capacity,"refillIntervalMs" FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.keys])).rows;
  for(const rows of [users,accounts,sessions])for(const row of rows)for(const [k,v] of Object.entries(row))if(v instanceof Date)row[k]=v.toISOString();
  return [users,accounts,sessions,buckets];
}
export async function removeFixtureRows(db,plan,counts) {
  if(plan.keys.length===0&&counts[3]!==0)throw new Error();
  const results=[];
  for(const [sql,args] of [
    ['DELETE FROM product."Session" WHERE "userId"=$1',[plan.id]],
    ['DELETE FROM product."Account" WHERE id=$1 AND "userId"=$2 AND "accountId"=$2 AND "providerId"=$3',[plan.credentialId,plan.id,"credential"]],
    ['DELETE FROM product."User" WHERE id=$1 AND "emailCanonical"=$2',[plan.id,plan.email]],
    ['DELETE FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.keys]]
  ]) {
    // Only the pinned lost-key recovery supplies an empty key set, after proving
    // the ENTIRE rate table unchanged. Never issue a rate-table DELETE there.
    if(sql.includes('product."AuthRateBucket"')&&plan.keys.length===0)results.push(0);
    else results.push((await db.query(sql,args)).rowCount);
  }
  if(JSON.stringify(results)!==JSON.stringify(counts))throw new Error("Exact cleanup row counts differ.");
  return results;
}
async function setup(config,env,Client,setStage) {
  setStage("fixture_preparation");
  const run=randomUUID(),plan=browserFixturePlan(run,config.key),db=new Client(pgOptions(config.migrator,"st-browser-setup"));
  let prisma,alive=true,failed=false;db.on("error",()=>{alive=false;});db.on("end",()=>{alive=false;});
  console.log("browser_fixture_run_id="+run); // Correlation only. No login identity or credential output.
  try {
    await import("../../scripts/register-server-only.mjs");
    const {hashPassword}=await import("../../lib/auth/password.server.ts"),{signupSchema}=await import("../../lib/auth/schemas.ts");
    setStage("password_validation");
    const parsed=signupSchema.parse({name:plan.name,email:plan.email,password:env.PRODUCT_BROWSER_FIXTURE_PASSWORD});
    setStage("password_hashing");
    const hash=await hashPassword(parsed.password),createdAt=new Date().toISOString();
    setStage("database_connection");await db.connect();
    setStage("role_verification");await identity(db,config.migrator);
    setStage("setup_lock");
    if(!(await db.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS yes",[LOCK])).rows[0].yes)throw new Error();
    setStage("preflight_transaction");await begin(db,true);
    setStage("migration_history");await history(db);
    setStage("permissions");await permissions(db,config.runtime.user);
    setStage("quiescence");await quiescent(db);
    setStage("identity_absence");await absent(db,plan);
    setStage("baseline");
    const baseline=await fixtureSnapshot(db,plan);
    const m=validateManifest({format:BROWSER_FIXTURE_FORMAT,run,baseline,createdAt,passwordDigest:sha(hash),rateKeyDigest:sha(config.key)},run,config.key);
    setStage("manifest_write");
    saveManifest(m); // Durable private recovery information BEFORE the first possible write.
    setStage("preflight_commit");await db.query("COMMIT");
    const controlPid=(await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    setStage("runtime_client");
    const {PrismaPg}=await import("@prisma/adapter-pg"),{PrismaClient}=await import("../../prisma/product/generated/client.ts");
    prisma=new PrismaClient({adapter:new PrismaPg({...pgOptions(config.runtime,"st-browser-fixture-writer"),max:1,options:PRODUCT_PRISMA_CONNECTION_OPTIONS},
      {schema:"product",onPoolError:()=>{},onConnectionError:()=>{}}),log:[]});
    setStage("fixture_creation");
    await prisma.$transaction(async tx=>{
      // Identifiers come only from the fixed table allowlist; all values remain parameters.
      const reader={query:async(sql,args=[])=>{const rows=await tx.$queryRawUnsafe(sql,...args);return {rows,rowCount:rows.length};}};
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      setStage("role_verification");await identity(reader,config.runtime);
      setStage("quiescence");await quiescent(reader,[controlPid]);
      setStage("identity_absence");await absent(reader,plan);
      setStage("baseline");sameBaseline(await fixtureSnapshot(reader,plan),m.baseline);
      if(!alive)throw new Error();
      setStage("fixture_creation");
      const timestamp=new Date(createdAt);
      await tx.user.create({data:{id:plan.id,name:plan.name,email:plan.email,emailVerified:true,image:null,createdAt:timestamp,updatedAt:timestamp}});
      await tx.account.create({data:{id:plan.credentialId,userId:plan.id,accountId:plan.id,providerId:"credential",password:hash,createdAt:timestamp,updatedAt:timestamp}});
      setStage("fixture_verification");validateFixtureRows(plan,m,...await fixtureRows(reader,plan));
      setStage("baseline");sameBaseline(await fixtureSnapshot(reader,plan),m.baseline);
      if(!alive)throw new Error();
      setStage("fixture_commit");
    },{isolationLevel:"Serializable",timeout:10000,maxWait:5000});
    // This receipt is evidence only of acknowledged setup COMMIT, never merely preparation.
    setStage("setup_receipt");
    exclusiveJson(join(directory(run),"setup-complete.json"),setupReceipt(m));syncDir(directory(run));
    console.log("Synthetic verified User/Account setup committed and receipt saved. Registration/OTP/Terms not exercised; no session created.");
  }catch{failed=true;await db.query("ROLLBACK").catch(()=>{});throw new Error();}
  finally{
    const closed=await Promise.allSettled([prisma?.$disconnect(),db.end()]);
    if(closed.some(r=>r.status==="rejected")){if(!failed)setStage("connection_cleanup");throw new Error();}
    console.log("Browser fixture setup connections closed.");
  }
}
export function setupReceipt(manifest) {
  return {format:BROWSER_FIXTURE_FORMAT,run:manifest.run,manifestDigest:sha(JSON.stringify(manifest))};
}
export function validateSetupReceipt(receipt,manifest) {
  const expected=setupReceipt(manifest);
  if(!receipt||Object.keys(receipt).sort().join()!=="format,manifestDigest,run"||
    receipt.format!==expected.format||receipt.run!==expected.run||receipt.manifestDigest!==expected.manifestDigest)throw new Error();
  return receipt;
}
function loadSetupReceipt(manifest) {
  const file=join(directory(manifest.run),"setup-complete.json");
  try{if(owned(file).size>512)throw new Error();}
  catch(e){if(e.code==="ENOENT")return null;throw e;}
  return validateSetupReceipt(JSON.parse(readFileSync(file,"utf8")),manifest);
}
// A matching committed pair is independently observable setup evidence when its
// acknowledgement/receipt was lost. Absence alone never proves completed cleanup.
export function fixtureCleanupState(receipt,rows) {
  const [users,accounts,sessions,buckets]=rows;
  if(users.length===1&&accounts.length===1)return receipt?"confirmed-setup":"recovered-persisted-setup";
  if(!receipt&&users.length===0&&accounts.length===0&&sessions.length===0&&buckets.length===0)return "setup-unconfirmed-absent";
  throw new Error("Setup state is inconsistent; inspect privately.");
}
async function cleanupGuard(db,readOnly=false) {
  await begin(db,readOnly);
  if(readOnly)await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  if(!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS yes",[LOCK])).rows[0].yes)throw new Error();
  await history(db);await quiescent(db);
  if(!readOnly)await db.query('LOCK TABLE '+BROWSER_FIXTURE_TABLES.map(t=>'product."'+t+'"').join(',')+' IN EXCLUSIVE MODE');
  await quiescent(db);
}
async function cleanup(config,Client) {
  const m=loadManifest(config.run,config.key),plan=browserFixturePlan(config.run,config.key),receipt=join(directory(config.run),"cleanup-complete.json");
  try{lstatSync(receipt);throw new Error();}catch(e){if(e.code!=="ENOENT")throw e;}
  const recordedSetup=loadSetupReceipt(m);
  const db=new Client(pgOptions(config.migrator,"st-browser-cleanup"));db.on("error",()=>{});
  try {
    await db.connect();await identity(db,config.migrator);await cleanupGuard(db);
    sameBaseline(await fixtureSnapshot(db,plan),m.baseline);
    const rows=await fixtureRows(db,plan),state=fixtureCleanupState(recordedSetup,rows);
    if(state==="setup-unconfirmed-absent") {
      await absent(db,plan);await db.query("ROLLBACK");
      console.log("Recovery inspection: no persisted fixture or planned buckets found. Setup/cleanup completion is not established; no completion receipt written.");
      return state;
    }
    validateFixtureRows(plan,m,...rows);
    for(const table of ["TermsAcceptance","EmailVerificationIssuance"])if((await db.query(`SELECT 1 FROM product."${table}" WHERE "userId"=$1`,[plan.id])).rowCount)throw new Error();
    const counts=await removeFixtureRows(db,plan,[rows[2].length,rows[1].length,rows[0].length,rows[3].length]);
    sameBaseline(await fixtureSnapshot(db,plan),m.baseline);await absent(db,plan);
    await db.query("COMMIT");
    exclusiveJson(receipt,{format:BROWSER_FIXTURE_FORMAT,setupState:state,run:config.run,sessions:counts[0],accounts:counts[1],users:counts[2],buckets:counts[3]});syncDir(directory(config.run));
    console.log((state==="confirmed-setup"?"Confirmed-setup cleanup committed: ":"Recovered persisted fixture cleanup committed; original setup acknowledgement unconfirmed: ")+
      "sessions="+counts[0]+" accounts="+counts[1]+" users="+counts[2]+" buckets="+counts[3]+"; ten baseline users retained.");
    return state;
  }catch{await db.query("ROLLBACK").catch(()=>{});throw new Error();}
  finally{await db.end();console.log("Browser fixture cleanup connection closed.");}
}
// One exceptional run only. No real or replacement key is accepted or derived.
export function lostKeyFixturePlan(run) {
  if(run!==LOST_RATE_KEY_RUN)throw new Error();
  const id="ht-proof-"+run;
  return {id,email:id+"@example.invalid",unknown:"ht-unknown-"+run+"@example.invalid",
    name:"Synthetic HTTPS transport "+run,credentialId:"credential-"+id,keys:[],buckets:{}};
}
export async function inspectLostKeyState(db,m,recordedSetup) {
  const plan=lostKeyFixturePlan(m?.run);validateManifestRecord(m,LOST_RATE_KEY_RUN);
  validateSetupReceipt(recordedSetup,m); // Successful setup is mandatory for this known run.
  // keys=[] deliberately excludes NO rate records from the nine-table baseline.
  // An added, changed or missing opaque bucket is not attributable: stop.
  sameBaseline(await fixtureSnapshot(db,plan),m.baseline);
  const rows=await fixtureRows(db,plan);validateFixtureRows(plan,m,...rows);
  if(rows[2].some(r=>typeof r.id!=="string"||!r.id)||new Set(rows[2].map(r=>r.id)).size!==rows[2].length)throw new Error();
  for(const table of ["TermsAcceptance","EmailVerificationIssuance"])if((await db.query(`SELECT 1 FROM product."${table}" WHERE "userId"=$1`,[plan.id])).rowCount)throw new Error();
  const approval=sha("stitchtrack/browser-fixture/lost-rate-key/v1\0"+JSON.stringify({manifest:m,rows}));
  return {plan,approval,counts:[rows[2].length,rows[1].length,rows[0].length,0]};
}
// Testable transaction only; does not construct/connect clients or read files.
// Inspect is database READ ONLY + ROLLBACK. Apply requires the exact inspected
// state digest, revalidates under table locks, and never writes AuthRateBucket.
export async function lostKeyRecoveryTransaction(db,m,setup,{mode,approval}={}) {
  if(!["inspect","apply"].includes(mode))throw new Error();
  try {
    await cleanupGuard(db,mode==="inspect");
    const state=await inspectLostKeyState(db,m,setup);
    if(mode==="inspect"){await quiescent(db);await db.query("ROLLBACK");return state;}
    if(!HASH.test(approval??"")||approval!==state.approval)throw new Error();
    const counts=await removeFixtureRows(db,state.plan,state.counts);
    sameBaseline(await fixtureSnapshot(db,state.plan),m.baseline);await absent(db,state.plan);
    await db.query("COMMIT");return {...state,counts};
  }catch{await db.query("ROLLBACK").catch(()=>{});throw new Error();}
}
async function recoverLostKey(config,Client) {
  const m=readManifest(config.run);validateManifestRecord(m,config.run);
  const completed=join(directory(config.run),"cleanup-complete.json");
  try{lstatSync(completed);throw new Error();}catch(e){if(e.code!=="ENOENT")throw e;}
  const setup=loadSetupReceipt(m);validateSetupReceipt(setup,m);
  const db=new Client(pgOptions(config.migrator,"st-browser-lost-key"));let alive=true;
  db.on("error",()=>{alive=false;});db.on("end",()=>{alive=false;});
  try {
    await db.connect();await identity(db,config.migrator);
    if(!alive)throw new Error();
    const state=await lostKeyRecoveryTransaction(db,m,setup,config);
    if(config.mode==="inspect") {
      console.log("recovery_run_id="+config.run+" recovery_plan_id="+state.approval);
      console.log("READ-ONLY inspection passed: users=1 accounts=1 sessions="+state.counts[0]+" rate_table_matches_manifest=true rate_rows_targeted=0. No database changes; review before separate cleanup authorization.");
    }else {
      exclusiveJson(completed,{format:BROWSER_FIXTURE_FORMAT,setupState:"confirmed-setup",recovery:"lost-rate-key",run:config.run,
        sessions:state.counts[0],accounts:state.counts[1],users:state.counts[2],buckets:0});syncDir(directory(config.run));
      console.log("Lost-key fixture cleanup committed: sessions="+state.counts[0]+" accounts=1 users=1 buckets=0; ten baseline users and all rate records retained.");
    }
  }finally{await db.end();console.log("Lost-key recovery connection closed.");}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let config,stage="configuration";const setStage=value=>{stage=value;};
  try {
    config=authorizeBrowserFixture(process.argv.slice(2),process.env);
    setStage("migration_files");assertProductMigrationFiles();
    setStage("dependencies");
    const {Client}=await import("pg");
    if(config.action==="setup")await setup(config,process.env,Client,setStage);
    else if(config.action==="lost-key"){setStage("lost_key_recovery");await recoverLostKey(config,Client);}
    else {setStage("cleanup");if(await cleanup(config,Client)==="setup-unconfirmed-absent")process.exitCode=2;}
  }catch{console.error(fixtureFailureMessage(stage));process.exitCode=1;}
  finally{config?.key?.fill(0);}
}
