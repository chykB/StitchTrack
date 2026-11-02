// OWNER ONLY. Inert on import; all proof data is uniquely synthetic product-test data.
import {pathToFileURL} from "node:url";
import {productDatabaseConfig,productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
export function authorizePasswordResetProof(args,env){
 if(process.platform!=="linux"||args.length!==1||args[0]!=="--owner-integration"||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||
  env.PRODUCT_PASSWORD_RESET_PROOF_CONFIRMED!=="true"||env.PRODUCT_EMAIL_WORKER_ENABLED==="true"||env.ENABLE_PRODUCT_SESSION_HTTP==="true"||
  env.ENABLE_PRODUCT_PASSWORD_RESET_HTTP==="true"||["NODE_OPTIONS","NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new Error();
 return {runtime:productDatabaseConfig(env),control:productMigrationConfig(env)};
}
async function run(target){
 await import("../../scripts/register-server-only.mjs");
 const {randomUUID,randomBytes,createHash}=await import("node:crypto"),{default:assert}=await import("node:assert/strict");
 const {Client}=await import("pg"),{PrismaPg}=await import("@prisma/adapter-pg"),{PrismaClient}=await import("../../prisma/product/generated/client.ts");
 const {createPasswordResetService}=await import("../../lib/product-auth/password-reset.server.ts"),{createSessionService}=await import("../../lib/product-auth/session.server.ts");
 const {hashPassword,verifyPassword}=await import("../../lib/auth/password.server.ts"),{createSecretTools}=await import("../../lib/product-auth/secrets.server.ts");
 assertProductMigrationFiles();
 const runId=randomUUID(),prefix="reset-proof-"+runId,labels=["success","rollback","replay","race","expired","attempts","client","unverified"];
 const ids=labels.map(x=>prefix+"-"+x),email=id=>id+"@example.invalid";
 const toolsConfig={verifierKeys:{currentId:"proof-v",keys:new Map([["proof-v",randomBytes(32)]])},outboxKeys:{currentId:"proof-o",keys:new Map([["proof-o",randomBytes(32)]])}};
 const authSecret=randomBytes(48).toString("base64"),sessionKey=randomBytes(32),oldPassword=" Original reset proof "+randomUUID(),newPassword=" Updated reset proof "+randomUUID();
 const base={authSecret,...toolsConfig,checkPassword:async()=>"not_found"},tools=createSecretTools(toolsConfig.verifierKeys,toolsConfig.outboxKeys);
 const clients=[];let control,observer,observerAlive=true;
 const watchdog=setTimeout(()=>{console.error("STOP: reset proof deadline; preserve run ID for separate cleanup.");process.exit(1);},60000);
 try{
  control=new Client({connectionString:target.control.url,connectionTimeoutMillis:5000,statement_timeout:5000});control.on("error",()=>{});await control.connect();
  await control.query("BEGIN READ ONLY");
  const identity=(await control.query("SELECT current_database() AS db,current_user AS role")).rows[0];assert.equal(identity.db,target.control.database);assert.equal(identity.role,target.control.user);
  const history=(await control.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM product._prisma_migrations')).rows;
  assert.equal(history.length,4);for(const [name,digest]of Object.entries(PRODUCT_MIGRATIONS))assert.ok(history.some(r=>r.migration_name===name&&r.checksum===digest&&r.finished_at&&!r.rolled_back_at));
  const acl=(await control.query(`SELECT has_column_privilege('stitchtrack_product_test_app','product."Account"','password','UPDATE') AS password,
    has_table_privilege('stitchtrack_product_test_app','product."Session"','DELETE') AS revoke`)).rows[0];assert.ok(acl.password&&acl.revoke);await control.query("ROLLBACK");await control.end();control=undefined;
  observer=new Client({connectionString:target.runtime.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,statement_timeout:5000,application_name:prefix+"-observer"});
  observer.on("error",()=>{observerAlive=false;});observer.on("end",()=>{observerAlive=false;});await observer.connect();
  const held=(await observer.query("SELECT pg_try_advisory_lock(1398031176,1) AS held")).rows[0].held;assert.equal(held,true);
  const others=(await observer.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND pid<>pg_backend_pid() AND backend_type='client backend'")).rows[0].count;
  assert.equal(others,0,"Other product-test runtime processes must be stopped");
  const connect=name=>new PrismaClient({adapter:new PrismaPg({connectionString:target.runtime.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,max:1,connectionTimeoutMillis:5000,application_name:prefix+"-"+name},
   {schema:"product",onConnectionError:()=>{},onPoolError:()=>{}}),log:[]});
  for(const name of ["writer","reader"])clients.push(connect(name));const [a,b]=clients;
  const checkIdentity=async db=>{const [r]=await db.$queryRaw`SELECT current_database() AS database,current_user AS role,to_regnamespace('product')::text AS namespace`;
   assert.deepEqual(r,{database:target.runtime.database,role:target.runtime.user,namespace:"product"});};await checkIdentity(a);await checkIdentity(b);
  const models=["user","account","session","verification","termsVersion","termsAcceptance","emailVerificationIssuance","emailOutbox","authRateBucket"];
  const baseline={};for(const model of models){const rows=await a[model].findMany();baseline[model]={ids:new Set(rows.map(r=>r.id??r.keyDigest)),digest:createHash("sha256").update(JSON.stringify(rows.sort((x,y)=>String(x.id??x.keyDigest).localeCompare(String(y.id??y.keyDigest))))).digest("hex")};}
  console.log("reset_proof_run_id="+runId); // Only public correlation, never identity/key/code/token.
  globalThis.fetch=async()=>{throw new Error("Network disabled in reset proof");};
  const oldHash=await hashPassword(oldPassword);
  await a.$transaction(async tx=>{for(const label of labels){const id=prefix+"-"+label;assert.equal(await tx.user.findUnique({where:{id}}),null);assert.equal(await tx.user.findUnique({where:{email:email(id)}}),null);
   await tx.user.create({data:{id,name:"Synthetic password-reset proof",email:email(id),emailVerified:label!=="unverified"}});
   if(label!=="client")await tx.account.create({data:{id:id+"-credential",userId:id,accountId:id,providerId:"credential",password:oldHash}});
  }});
  const reset=db=>createPasswordResetService(db,base),sessions=db=>createSessionService(db,{mode:"test",authSecret,sessionTokenKey:sessionKey,expiresInSeconds:604800,renewal:"none"});
  const mail=async id=>{const issue=await a.emailVerificationIssuance.findFirst({where:{userId:id,purpose:"password-reset"},orderBy:{createdAt:"desc"}});const job=await a.emailOutbox.findUnique({where:{issuanceId:issue.id}});return tools.open(job,job);};
  const cookie=r=>new Headers({cookie:r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});
  let id=ids[0];const first=await sessions(a).login({email:email(id),password:oldPassword}),second=await sessions(b).login({email:email(id),password:oldPassword});
  await reset(a).request({email:email(id)});let input=await mail(id);assert.equal(await reset(b).check(input),true);assert.equal(await reset(a).complete({...input,password:newPassword}),true);
  assert.equal((await sessions(b).lookup(cookie(first))).session,null);assert.equal((await sessions(a).lookup(cookie(second))).session,null);
  assert.equal(await reset(b).complete({...input,password:newPassword}),false);await assert.rejects(sessions(b).login({email:email(id),password:oldPassword}));await sessions(b).login({email:email(id),password:newPassword});
  console.log("PASS: two committed sessions revoked across connections; replay refused; fresh login required.");
  id=ids[1];
  for(const stage of ["verification","issuance","outbox"]){let reached=false;
   await assert.rejects(createPasswordResetService(a,{...base,testFault:stage,testObserver:s=>{if(s===stage)reached=true;}}).request({email:email(id)}));assert.ok(reached);
   assert.equal(await b.emailVerificationIssuance.count({where:{userId:id}}),0);assert.equal(await b.emailOutbox.count({where:{issuance:{userId:id}}}),0);
   assert.equal(await b.verification.count({where:{identifier:{contains:email(id)}}}),0);
  }
  await reset(a).request({email:email(id)});input=await mail(id);await sessions(a).login({email:email(id),password:oldPassword});
  for(const stage of ["credential","sessions","consumption"]){let reached=false;const failing=createPasswordResetService(a,{...base,testFault:stage,testObserver:s=>{if(s===stage)reached=true;}});
   await assert.rejects(failing.complete({...input,password:newPassword}));assert.ok(reached);assert.equal((await b.account.findFirst({where:{userId:id}})).password,oldHash);
   assert.equal(await b.session.count({where:{userId:id}}),1);assert.equal((await b.emailVerificationIssuance.findFirst({where:{userId:id}})).consumedAt,null);
  }console.log("PASS: reached credential/session/consumption failures roll back together.");
  id=ids[2];await reset(a).request({email:email(id)});input=await mail(id);const simultaneous=await Promise.all([reset(a).complete({...input,password:newPassword}),reset(b).complete({...input,password:newPassword})]);assert.equal(simultaneous.filter(Boolean).length,1);
  console.log("PASS: concurrent reset completions admit exactly one.");
  id=ids[3];await reset(a).request({email:email(id)});input=await mail(id);let entered,release;const reached=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
  const slow=createPasswordResetService(a,{...base,testObserver:async stage=>{if(stage==="credential"){entered();await resume;}}});
  const completing=slow.complete({...input,password:newPassword});await reached;let competing;
  try{competing=sessions(b).login({email:email(id),password:oldPassword});const settled=Promise.allSettled([competing]);
   let blocked=false;for(let i=0;i<50;i++){const r=await observer.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='stitchtrack_product_test_app' AND application_name=$1 AND wait_event_type='Lock') AS blocked",[prefix+"-reader"]);if(r.rows[0].blocked){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
   assert.ok(blocked);release();assert.equal(await completing,true);assert.equal((await settled)[0].status,"rejected");assert.equal(await a.session.count({where:{userId:id}}),0);
  }finally{release();await Promise.allSettled([completing,...(competing?[competing]:[])]);}
  console.log("PASS: actual PostgreSQL-blocked old-password login cannot survive committed reset.");
  id=ids[4];await reset(a).request({email:email(id)});input=await mail(id);const expired=createPasswordResetService(a,{...base,clock:()=>new Date(Date.now()+300001)});assert.equal(await expired.complete({...input,password:newPassword}),false);
  id=ids[5];await reset(a).request({email:email(id)});input=await mail(id);const wrong={...input,otp:input.otp==="000000"?"000001":"000000"};for(let i=0;i<3;i++)assert.equal(await reset(b).check(wrong),false);assert.equal(await reset(a).complete({...input,password:newPassword}),false);
  for(const userId of ids.slice(6)){await reset(a).request({email:email(userId)});assert.equal(await a.emailVerificationIssuance.count({where:{userId}}),0);assert.equal(await reset(a).check({email:email(userId),otp:"000000"}),false);}
  await reset(a).request({email:"unknown-"+runId+"@example.invalid"});assert.equal(await a.user.count(),baseline.user.ids.size+ids.length);
  console.log("PASS: injected-clock expiry, three wrong codes, passwordless/unverified refusal and unknown-account neutrality.");
  for(const model of models){const rows=(await a[model].findMany()).filter(r=>baseline[model].ids.has(r.id??r.keyDigest));const digest=createHash("sha256").update(JSON.stringify(rows.sort((x,y)=>String(x.id??x.keyDigest).localeCompare(String(y.id??y.keyDigest))))).digest("hex");assert.equal(digest,baseline[model].digest);}
  assert.equal(observerAlive,true,"Worker lock connection must survive the proof");
  console.log("PASS: historical rows unchanged. STOP FOR SEPARATE exact-run cleanup; eight synthetic users remain; all remaining proof mail is cancelled before connection cleanup.");
 }finally{
  // Never leave fresh synthetic mail eligible when releasing the worker lock.
  if(clients[0])try{await clients[0].emailOutbox.updateMany({where:{status:"pending",issuance:{userId:{in:ids},purpose:"password-reset"}},data:{status:"cancelled"}});}catch{process.exitCode=1;console.error("STOP: fixture mail cancellation unconfirmed; keep workers stopped until reviewed cleanup.");}
  clearTimeout(watchdog);const results=await Promise.allSettled(clients.map(c=>c.$disconnect()));if(observer)results.push(...await Promise.allSettled([observer.end()]));if(control)results.push(...await Promise.allSettled([control.end()]));if(results.some(r=>r.status==="rejected"))throw new Error();console.log("Reset proof database connections closed.");}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await run(authorizePasswordResetProof(process.argv.slice(2),process.env));}catch{console.error("STOP: reset proof failed; preserve run ID; no automatic retry/reset/cleanup.");process.exitCode=1;}}
