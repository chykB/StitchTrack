// OWNER ONLY. Import performs no IO, connection, listener creation or fixture write.
import {pathToFileURL} from "node:url";
import {randomUUID,randomBytes,createHash,createHmac,X509Certificate,createPrivateKey,createPublicKey} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,lstatSync,openSync,fsyncSync,closeSync,realpathSync} from "node:fs";
import {userInfo} from "node:os";
import {join,isAbsolute} from "node:path";
import {spawn} from "node:child_process";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig,productMigrationConfig} from "../../prisma/product/targets.ts";
import {assertProductMigrationFiles,PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ORIGIN="https://127.0.0.1:3443",LOCK="stitchtrack/https-transport-proof";
export function transportPlan(run,key) {
  if(!UUID.test(run)||!(key instanceof Uint8Array)||key.length!==32)throw new Error("Exact transport run required.");
  const id="ht-proof-"+run,email=id+"@example.invalid",unknown="ht-unknown-"+run+"@example.invalid";
  const version=suffix=>"local-"+run.replaceAll("-","")+"-"+suffix;
  const policy={login:{version:version("l"),account:{capacity:3,refillIntervalMs:60000},ip:{capacity:10,refillIntervalMs:15000}},
    session:{version:version("s"),ip:{capacity:60,refillIntervalMs:1000}},logout:{version:version("o"),ip:{capacity:30,refillIntervalMs:2000}}};
  const digest=(op,kind,identity)=>"rl:v1:"+createHmac("sha256",key).update(JSON.stringify(["stitchtrack/auth-rate/v1",op,policy[op].version,kind,identity])).digest("hex");
  const keys=[digest("login","ip","127.0.0.1"),digest("login","account",email),digest("login","account",unknown),digest("session","ip","127.0.0.1"),digest("logout","ip","127.0.0.1")].sort();
  return {id,email,unknown,name:"Synthetic HTTPS transport "+run,credentialId:"credential-"+id,policy,keys};
}
export function authorizeTransport(args,env) {
  if(process.platform!=="linux"||env.PRODUCT_DATABASE_MODE!=="test"||["NODE_OPTIONS","DEBUG","NODE_DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k])||env.PRODUCT_EMAIL_WORKER_ENABLED==="true")throw new Error();
  if(args.length===1&&args[0]==="--owner-transport"&&env.NODE_ENV==="development"&&env.PRODUCT_HTTPS_TRANSPORT_CONFIRMED==="true"&&env.PRODUCT_HTTPS_CLEANUP_CONFIRMED!=="true"&&env.ENABLE_PRODUCT_SESSION_HTTP!=="true") {
    return {action:"proof",runtime:productDatabaseConfig(env),migrator:productMigrationConfig(env)};
  }
  if(args.length===2&&args[0]==="--owner-cleanup"&&UUID.test(args[1])&&env.NODE_ENV==="test"&&env.PRODUCT_HTTPS_CLEANUP_CONFIRMED==="true"&&env.PRODUCT_HTTPS_TRANSPORT_CONFIRMED!=="true"&&env.ENABLE_PRODUCT_SESSION_HTTP!=="true")return {action:"cleanup",run:args[1],migrator:productMigrationConfig(env)};
  throw new Error("Exclusive transport/cleanup authorization required.");
}
export function curlConfig(operation,body,cookie,extra={}) {
  if(!["login","session","logout"].includes(operation)||cookie&&/[\r\n\0]/u.test(cookie)||Object.keys(extra).some(k=>!["X-Forwarded-For"].includes(k)))throw new Error();
  const quote=value=>JSON.stringify(value);
  const lines=["url = "+quote(ORIGIN+"/api/internal/tailor-session/"+operation),"request = "+quote(operation==="session"?"GET":"POST"),"header = "+quote("Origin: "+ORIGIN)];
  if(cookie)lines.push("header = "+quote("Cookie: "+cookie));
  for(const [k,v] of Object.entries(extra))lines.push("header = "+quote(k+": "+v));
  if(operation!=="session")lines.push('header = "Content-Type: application/json"',"data = "+quote(JSON.stringify(body)));
  return lines.join("\n")+"\n";
}
export function parseCurl(output) {
  const end=output.indexOf("\r\n\r\n"),head=output.slice(0,end),first=head.split("\r\n")[0];
  if(end<0||!/^HTTP\/1\.1 \d{3} /u.test(first))throw new Error("Unconfirmed HTTPS response.");
  const headers=new Headers();for(const line of head.split("\r\n").slice(1)){const i=line.indexOf(":");if(i<1)throw new Error();headers.append(line.slice(0,i),line.slice(i+1).trim());}
  return {status:Number(first.split(" ")[1]),headers,body:JSON.parse(output.slice(end+4))};
}
const source=()=>createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");
const root=()=>join(userInfo().homedir,".stitchtrack-https-proofs");
const directory=run=>{if(!UUID.test(run))throw new Error();return join(root(),run);};
function syncDir(path){const fd=openSync(path,"r");try{fsyncSync(fd);}finally{closeSync(fd);}}
function owned(path,mode,dir=false){const f=lstatSync(path);if(f.isSymbolicLink()||f.uid!==process.getuid()||(f.mode&0o777)!==mode||(dir?!f.isDirectory():!f.isFile()||f.nlink!==1))throw new Error();return f;}
function saveManifest(run,key) {
  try{mkdirSync(root(),{mode:0o700});syncDir(userInfo().homedir);}catch(e){if(e.code!=="EEXIST")throw e;}owned(root(),0o700,true);
  const dir=directory(run);mkdirSync(dir,{mode:0o700});syncDir(root());
  const fd=openSync(join(dir,"manifest.json"),"wx",0o600);
  try{writeFileSync(fd,JSON.stringify({format:1,run,key:Buffer.from(key).toString("base64"),source:source()}));fsyncSync(fd);}finally{closeSync(fd);}syncDir(dir);
}
function loadManifest(run) {
  owned(root(),0o700,true);owned(directory(run),0o700,true);const f=join(directory(run),"manifest.json");if(owned(f,0o600).size>1024)throw new Error();
  const m=JSON.parse(readFileSync(f,"utf8"));if(m.format!==1||m.run!==run||m.source!==source()||Object.keys(m).sort().join()!=="format,key,run,source")throw new Error();
  const key=Buffer.from(m.key,"base64");if(key.length!==32||key.toString("base64")!==m.key)throw new Error();return key;
}
function certificates(env) {
  const certFile=env.PRODUCT_HTTPS_CERT_FILE,keyFile=env.PRODUCT_HTTPS_KEY_FILE;
  if(!certFile||!keyFile||!isAbsolute(certFile)||!isAbsolute(keyFile)||certFile===keyFile)throw new Error();
  for(const file of [certFile,keyFile])if(realpathSync(file)!==file||file.startsWith(realpathSync(process.cwd())+"/"))throw new Error();
  if(owned(certFile,0o600).size>16384||owned(keyFile,0o600).size>16384)throw new Error();
  const cert=readFileSync(certFile),key=readFileSync(keyFile),x=new X509Certificate(cert);
  if(x.checkIP("127.0.0.1")!=="127.0.0.1"||Date.parse(x.validFrom)>Date.now()||Date.parse(x.validTo)<=Date.now()||
    !x.publicKey.export({type:"spki",format:"der"}).equals(createPublicKey(createPrivateKey(key)).export({type:"spki",format:"der"})))throw new Error();
  return {certFile,cert,key};
}
function pgOptions(target,name){return {connectionString:target.url,application_name:name,ssl:false,connectionTimeoutMillis:5000,query_timeout:7000,statement_timeout:5000,lock_timeout:3000,idle_in_transaction_session_timeout:10000};}
async function identity(db,target) {
  const r=(await db.query("SELECT current_database() AS db,current_user AS role,session_user AS actor,current_setting('port') AS port,NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user")).rows;
  if(r.length!==1||r[0].db!==target.database||r[0].role!==target.user||r[0].actor!==target.user||r[0].port!=="5432"||r[0].safe!==true)throw new Error();
}
async function history(db) {
  if((await db.query("SELECT count(*)::integer AS n FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user")).rows[0].n!==1)throw new Error();
  if((await db.query("SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user")).rows[0].n!==10)throw new Error();
  if((await db.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND n.nspname<>'product'")).rowCount)throw new Error();
  const rows=(await db.query("SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations")).rows;
  if(rows.length!==3||new Set(rows.map(r=>r.migration_name)).size!==3||rows.some(r=>PRODUCT_MIGRATIONS[r.migration_name]!==r.checksum||!r.finished_at||r.rolled_back_at||r.logs!==null||r.applied_steps_count!==1))throw new Error();
}
async function preflight(Client,targets) {
  const db=new Client(pgOptions(targets.migrator,"stitchtrack-https-preflight"));db.on("error",()=>{});
  try{
    await db.connect();await db.query("BEGIN READ ONLY");await identity(db,targets.migrator);await history(db);
    for(const table of ["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailVerificationIssuance","EmailOutbox","AuthRateBucket"]) {
      if(!(await db.query("SELECT has_table_privilege($1,$2,'SELECT') AS yes",[targets.runtime.user,'product."'+table+'"'])).rows[0].yes)throw new Error();
    }
    for(const table of ["User","Account"])if(!(await db.query("SELECT has_table_privilege($1,$2,'INSERT') AS yes",[targets.runtime.user,'product."'+table+'"'])).rows[0].yes)throw new Error();
    for(const col of ["id","token","userId","expiresAt","createdAt","updatedAt","ipAddress","userAgent"])if(!(await db.query(`SELECT has_column_privilege($1,'product."Session"',$2,'INSERT') AS yes`,[targets.runtime.user,col])).rows[0].yes)throw new Error();
    if(!(await db.query(`SELECT has_table_privilege($1,'product."Session"','DELETE') AS yes`,[targets.runtime.user])).rows[0].yes)throw new Error();
    for(const col of ["keyDigest","capacity","refillIntervalMs","tokens","refilledAt","expiresAt","lastAllowed"])if(!(await db.query(`SELECT has_column_privilege($1,'product."AuthRateBucket"',$2,'INSERT') AS yes`,[targets.runtime.user,col])).rows[0].yes)throw new Error();
    for(const col of ["tokens","refilledAt","expiresAt","lastAllowed"])if(!(await db.query(`SELECT has_column_privilege($1,'product."AuthRateBucket"',$2,'UPDATE') AS yes`,[targets.runtime.user,col])).rows[0].yes)throw new Error();
    const rights=(await db.query(`SELECT has_schema_privilege($1,'product','CREATE') OR has_table_privilege($1,'product._prisma_migrations','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege($1,'product."User"','UPDATE,DELETE,TRUNCATE') OR has_table_privilege($1,'product."Session"','UPDATE') OR pg_has_role($1,current_user,'MEMBER') AS broad`,[targets.runtime.user])).rows[0];if(rights.broad)throw new Error();
    if((await db.query('SELECT count(*)::integer AS n FROM product."User"')).rows[0].n!==10)throw new Error();
    await db.query("COMMIT");
  }catch{await db.query("ROLLBACK").catch(()=>{});throw new Error("Read-only transport preflight unconfirmed.");}finally{await db.end();}
}
async function curl(certFile,configuration) {
  return new Promise((resolve,reject)=>{
    const c=spawn("/usr/bin/curl",["--config","-","--noproxy","*","--proto","=https","--http1.1","--tlsv1.2","--cacert",certFile,"--connect-timeout","3","--max-time","15","--silent","--include"],{env:{PATH:"/usr/bin:/bin"},stdio:["pipe","pipe","pipe"]});
    let output="",size=0,failed=false;c.on("error",()=>{failed=true;reject(new Error("HTTPS client execution unconfirmed."));});
    c.stdout.on("data",chunk=>{size+=chunk.length;if(size>65536){failed=true;c.kill();}else output+=chunk.toString("utf8");});c.stderr.on("data",()=>{});c.stdin.on("error",()=>{});
    c.on("close",code=>{if(code!==0||failed)reject(new Error("HTTPS certificate/client verification unconfirmed."));else{try{resolve(parseCurl(output));}catch{reject(new Error("HTTPS response unconfirmed."));}}});
    c.stdin.end(configuration);
  });
}
export function scopedClient(client,plan,mode,sessionDigests) {
  const models=new Set(["user","account","session","verification","termsVersion","termsAcceptance","emailVerificationIssuance","emailOutbox","authRateBucket"]);
  const wrap=(db,tx=false)=>new Proxy(db,{get(target,prop){
    if(prop==="$transaction")return tx?undefined:async(callback,opts)=>client.$transaction(t=>callback(wrap(t,true)),opts);
    if(prop==="$queryRaw")return async(strings,...values)=>{
      if(mode.alive && !mode.alive())throw new Error("Proof control connection lost.");
      const sql=strings.join("");
      if(sql.includes('INSERT INTO "product"."AuthRateBucket"')) {
        if(!plan.keys.includes(values[0]))throw new Error("Unplanned bucket refused.");
        if(mode.readOnlyRate)return client.$transaction(async t=>{await t.$executeRaw`SET TRANSACTION READ ONLY`;return t.$queryRaw(strings,...values);});
      }else if(sql.includes('"product"."User"')&&(values.length!==1||![plan.id,plan.email,plan.unknown].includes(values[0])))throw new Error("Historical identity refused.");
      else if(!sql.includes('"product"."User"')&&!sql.includes("SELECT current_database()"))throw new Error("Unplanned query refused.");
      return target.$queryRaw(strings,...values);
    };
    if(prop==="$executeRaw")return(strings,...values)=>{if(!tx||values.length||!["SET LOCAL lock_timeout = '3s'","SET LOCAL statement_timeout = '5s'"].includes(strings.join("").trim()))throw new Error();return target.$executeRaw(strings,...values);};
    if(prop==="$queryRawUnsafe"||prop==="$executeRawUnsafe")return()=>{throw new Error();};
    if(models.has(prop))return new Proxy(target[prop],{get(model,method){const fn=model[method];if(typeof fn!=="function")return fn;return async args=>{
      if(mode.alive && !mode.alive())throw new Error("Proof control connection lost.");
      if(prop==="session") {
        if(method==="create"){if(!tx||args.data.userId!==plan.id||!/^hmac-sha256:v1:[a-f0-9]{64}$/u.test(args.data.token))throw new Error();sessionDigests.add(args.data.token);}
        else {
          const text=JSON.stringify(args?.where??{});
          if(!text.includes(plan.id)&&![...sessionDigests].some(v=>text.includes(v)))throw new Error("Unplanned Session target refused.");
          if(!["findFirst","findMany","findUnique","count","deleteMany"].includes(method))throw new Error();
        }
      }else if(!["findFirst","findMany","findUnique","count"].includes(method))throw new Error("Unexpected model write refused.");
      return fn.call(model,args);
    };}});
    const v=Reflect.get(target,prop);return typeof v==="function"?v.bind(target):v;
  }});return wrap(client);
}
async function proof(targets,env) {
  assertProductMigrationFiles();const tls=certificates(env),run=randomUUID(),key=randomBytes(32),plan=transportPlan(run,key);
  saveManifest(run,key);console.log("Synthetic HTTPS transport run_id="+run);
  await import("../../scripts/register-server-only.mjs");
  const {default:assert}=await import("node:assert/strict"),{Client}=await import("pg"),{PrismaPg}=await import("@prisma/adapter-pg"),{PrismaClient}=await import("../../prisma/product/generated/client.ts");
  const {hashPassword}=await import("../../lib/auth/password.server.ts"),{createLocalSessionHttpsServer}=await import("../../lib/product-auth/session-https.server.ts");
  const name="st-https-proof-"+run,control=new Client(pgOptions(targets.runtime,name));let alive=true,client,server;control.on("error",()=>{alive=false;});control.on("end",()=>{alive=false;});
  const fetcher=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("External requests forbidden.");};
  const stop=()=>{alive=false;void server?.close().catch(()=>{});};
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  try {
    await control.connect();await identity(control,targets.runtime);
    assert.equal((await control.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS yes",[LOCK])).rows[0].yes,true);
    await preflight(Client,targets);console.log("PASS read-only exact-target, migration and permission preflight.");
    const snapshot=async()=>{
      const result={};for(const table of ["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailVerificationIssuance","EmailOutbox","AuthRateBucket"]) {
        const filter=table==="User"?' WHERE t.id<>$1':table==="Account"||table==="Session"?' WHERE t."userId"<>$1':table==="AuthRateBucket"?' WHERE t."keyDigest"<>ALL($1::text[])':"";
        result[table]=(await control.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM product."${table}" t${filter} ORDER BY h`,filter?[table==="AuthRateBucket"?plan.keys:plan.id]:[])).rows;
      }return result;
    };
    const baseline=await snapshot();assert.equal(baseline.User.length,10);
    assert.equal((await control.query('SELECT count(*)::integer AS n FROM product."User" WHERE id=$1 OR "emailCanonical"=ANY($2::text[])',[plan.id,[plan.email,plan.unknown]])).rows[0].n,0);
    assert.equal((await control.query('SELECT count(*)::integer AS n FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.keys])).rows[0].n,0);
    client=new PrismaClient({adapter:new PrismaPg({...pgOptions(targets.runtime,name),max:3,options:PRODUCT_PRISMA_CONNECTION_OPTIONS},{schema:"product",onPoolError:()=>{alive=false;},onConnectionError:()=>{alive=false;}}),log:[]});
    const password=" Exact synthetic "+randomBytes(24).toString("base64url")+" ",hash=await hashPassword(password),mode={readOnlyRate:false,alive:()=>alive},digests=new Set();
    const config={...env,ENABLE_PRODUCT_SESSION_HTTP:"true",PRODUCT_LOCAL_HTTPS_CONFIRMED:"true",PRODUCT_LOCAL_RATE_POLICY_CONFIRMED:"true",PRODUCT_SESSION_HTTP_ORIGIN:ORIGIN,
      PRODUCT_SESSION_HTTP_AUTH_SECRET:randomBytes(48).toString("base64url"),PRODUCT_SESSION_TOKEN_KEY:randomBytes(32).toString("base64")};
    server=createLocalSessionHttpsServer(scopedClient(client,plan,mode,digests),{env:config,identifierKey:key,policy:plan.policy,key:tls.key,cert:tls.cert});
    assert.ok(alive);await server.listen();console.log("PASS companion bound to approved loopback port; no Next process modified.");
    // One atomic fixture pair, direct test setup only; no public signup/Terms/OTP bypass.
    await client.$transaction(async tx=>{
      assert.ok(alive);await tx.user.create({data:{id:plan.id,email:plan.email,name:plan.name,emailVerified:true,image:null}});
      assert.ok(alive);await tx.account.create({data:{id:plan.credentialId,accountId:plan.id,providerId:"credential",userId:plan.id,password:hash}});assert.ok(alive);
    });
    const call=(op,body,cookie,extra)=>{assert.ok(alive);return curl(tls.certFile,curlConfig(op,body,cookie,extra));},input={email:plan.email,password};
    assert.equal((await call("session")).status,401);console.log("PASS curl certificate/IP verification and unauthenticated HTTPS response.");
    const wrong=await call("login",{...input,password:"incorrect synthetic password"}),unknown=await call("login",{email:plan.unknown,password});
    assert.equal(wrong.status,401);assert.equal(unknown.status,401);assert.deepEqual(wrong.body,unknown.body);console.log("PASS wrong/unknown credentials have the same generic response.");
    const logged=await call("login",input);assert.equal(logged.status,200);assert.equal(logged.body.user.id,plan.id);assert.deepEqual(Object.keys(logged.body),["user"]);
    const cookies=logged.headers.getSetCookie();assert.equal(cookies.length,1);assert.match(cookies[0],/^__Secure-better-auth.session_token=/u);assert.match(cookies[0],/; Secure/iu);assert.match(cookies[0],/; HttpOnly/iu);assert.match(cookies[0],/SameSite=Lax/iu);assert.match(cookies[0],/Max-Age=604800/u);
    const cookie=cookies[0].split(";")[0];assert.equal((await call("session",undefined,cookie)).body.user.id,plan.id);
    assert.equal((await call("logout",{} ,cookie)).status,200);assert.equal((await call("session",undefined,cookie)).status,401);
    assert.equal((await client.session.count({where:{userId:plan.id}})),0);console.log("PASS Secure signed-cookie issuance, authoritative lookup, logout and durable revocation.");
    const second=await call("login",input);assert.equal(second.status,200);const secondCookie=second.headers.getSetCookie()[0].split(";")[0];
    const denied=await call("login",input);assert.equal(denied.status,429);assert.ok(Number(denied.headers.get("retry-after"))>=1);
    assert.equal((await call("logout",{},secondCookie)).status,200);console.log("PASS selected PostgreSQL account budget returns 429/Retry-After.");
    assert.equal((await call("session",undefined,undefined,{"X-Forwarded-For":"127.0.0.1"})).status,403);console.log("PASS spoofed forwarding metadata rejected over real TLS.");
    let exhausted;for(let i=0;i<12;i++){const r=await call("login",{});if(r.status===429){exhausted=r;break;}assert.equal(r.status,422);}
    assert.ok(exhausted);console.log("PASS selected PostgreSQL IP budget returns 429/Retry-After.");
    mode.readOnlyRate=true;assert.equal((await call("session")).status,503);mode.readOnlyRate=false;
    console.log("PASS real read-only PostgreSQL upsert failure denies HTTP access; no authentication fallback.");
    assert.ok(alive);assert.deepEqual(await snapshot(),baseline);assert.equal((await control.query('SELECT count(*)::integer AS n FROM product."User"')).rows[0].n,11);
    console.log("PASS ten historical users and historical authentication/rate rows unchanged.");
    console.log("TRANSPORT CHECKS COMPLETE: separate exact-run cleanup required; this is not browser integration.");
  }finally{
    globalThis.fetch=fetcher;process.off("SIGINT",stop);process.off("SIGTERM",stop);
    const closed=await Promise.allSettled([server?.close(),client?.$disconnect(),control.end()]);key.fill(0);tls.key.fill(0);
    if(closed.some(v=>v.status==="rejected"))throw new Error("Transport shutdown unconfirmed.");console.log("HTTPS listener and all proof database connections closed.");
  }
}
async function cleanup(target,run) {
  assertProductMigrationFiles();const key=loadManifest(run),plan=transportPlan(run,key),receipt=join(directory(run),"cleanup-complete.json");
  try{lstatSync(receipt);throw new Error("Cleanup already recorded.");}catch(e){if(e.code!=="ENOENT")throw e;}
  const {Client}=await import("pg"),db=new Client(pgOptions(target,"st-https-cleanup"));db.on("error",()=>{});
  try{
    await db.connect();await identity(db,target);await db.query("BEGIN");await db.query("SET LOCAL search_path=pg_catalog");await history(db);
    if(!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS yes",[LOCK])).rows[0].yes)throw new Error();
    if((await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND pid<>pg_backend_pid()",["st-https-proof-"+run])).rowCount)throw new Error();
    const users=(await db.query('SELECT id,name,"emailCanonical","emailVerified","disabledAt","deletionRequestedAt",image FROM product."User" WHERE id=$1 FOR UPDATE',[plan.id])).rows;
    if(users.length>1||(await db.query('SELECT count(*)::integer AS n FROM product."User"')).rows[0].n!==10+users.length||users.some(u=>u.name!==plan.name||u.emailCanonical!==plan.email||u.emailVerified!==true||u.disabledAt!==null||u.deletionRequestedAt!==null||u.image!==null))throw new Error();
    const accounts=(await db.query('SELECT id,"accountId","providerId" FROM product."Account" WHERE "userId"=$1',[plan.id])).rows;
    if(accounts.length!==users.length||accounts.some(a=>a.id!==plan.credentialId||a.accountId!==plan.id||a.providerId!=="credential"))throw new Error();
    for(const table of ["TermsAcceptance","EmailVerificationIssuance"])if((await db.query(`SELECT 1 FROM product."${table}" WHERE "userId"=$1`,[plan.id])).rowCount)throw new Error();
    if((await db.query('SELECT 1 FROM product."Session" WHERE "userId"=$1 AND token !~ $2',[plan.id,"^hmac-sha256:v1:[a-f0-9]{64}$"])).rowCount)throw new Error();
    const sessions=await db.query('DELETE FROM product."Session" WHERE "userId"=$1',[plan.id]),credentials=await db.query('DELETE FROM product."Account" WHERE "userId"=$1',[plan.id]),people=await db.query('DELETE FROM product."User" WHERE id=$1',[plan.id]),buckets=await db.query('DELETE FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.keys]);
    if(people.rowCount!==users.length||credentials.rowCount!==users.length||buckets.rowCount>5||(await db.query('SELECT count(*)::integer AS n FROM product."User"')).rows[0].n!==10)throw new Error();
    await db.query("COMMIT");writeFileSync(receipt,JSON.stringify({run,users:people.rowCount,accounts:credentials.rowCount,sessions:sessions.rowCount,buckets:buckets.rowCount}),{flag:"wx",mode:0o600});
    console.log("Exact HTTPS cleanup committed: users="+people.rowCount+" accounts="+credentials.rowCount+" sessions="+sessions.rowCount+" buckets="+buckets.rowCount+"; ten baseline users retained.");
  }catch{await db.query("ROLLBACK").catch(()=>{});throw new Error("Cleanup unconfirmed; preserve private manifest.");}finally{key.fill(0);await db.end();console.log("HTTPS cleanup connection closed.");}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const a=authorizeTransport(process.argv.slice(2),process.env);if(a.action==="proof")await proof(a,process.env);else await cleanup(a.migrator,a.run);}catch{console.error("STOP: HTTPS transport/cleanup unconfirmed. Preserve run ID/private manifest; no automatic rerun, retry or cleanup.");process.exitCode=1;}}
