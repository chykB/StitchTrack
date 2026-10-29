// OWNER ONLY. No connection, keys, prompt or side effect on import.
import {pathToFileURL} from "node:url";
import {productDatabaseConfig} from "../../../prisma/product/targets.ts";
// Both canonical and historical names block accidental reruns after reconciliation.
export const CAPTURE_EVIDENCE_FILES = Object.freeze([
  "19-verification-row.png", "20-verification-expired.png", "21-verification-wrong-code.png", "22-verification-code-reused.png",
  "20-expired-verification.png", "21-incorrect-verification-code.png", "22-reused-verification-code.png",
]);
export function assertCaptureEvidenceAbsent(exists) {
  for(const name of CAPTURE_EVIDENCE_FILES)
    if(exists("task-04-server-security/evidence/"+name))throw new Error("Preserve existing evidence; stop for review");
}
export function authorizeCapture(args,env) {
  if(args.length!==1 || args[0]!=="--owner-capture" || env.NODE_ENV!=="test" || env.PRODUCT_DATABASE_MODE!=="test" ||
    env.PRODUCT_OTP_EVIDENCE_CONFIRMED!=="true" || env.PRODUCT_EMAIL_WORKER_ENABLED==="true" || env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE)
    throw new Error("Exact owner-confirmed product-test capture required");
  return productDatabaseConfig(env);
}
// Explicit safe projection: never select/print credentials, recipients or verifier material.
export async function inspectSubject(client,subject) {
  const issuance=await client.emailVerificationIssuance.findUnique({where:{id:subject.issuanceId},select:{
    id:true,userId:true,verificationId:true,createdAt:true,expiresAt:true,failedAttempts:true,consumedAt:true,supersededAt:true}});
  if(!issuance)throw new Error("Missing capture issuance");
  const user=await client.user.findUnique({where:{id:issuance.userId},select:{id:true,emailVerified:true}});
  const verification=issuance.verificationId?await client.verification.findUnique({where:{id:issuance.verificationId},select:{id:true,createdAt:true,expiresAt:true}}):null;
  const job=await client.emailOutbox.findUnique({where:{issuanceId:issuance.id},select:{id:true,issuanceId:true,status:true,attemptCount:true,sentAt:true}});
  const sessions=await client.session.count({where:{userId:issuance.userId}});
  return {user,issuance,verification,job,sessions};
}
async function run(target) {
  if(!process.stdin.isTTY)throw new Error("Use an interactive owner terminal");
  const {existsSync}=await import("node:fs");
  assertCaptureEvidenceAbsent(existsSync);
  await import("../../../scripts/register-server-only.mjs");
  const {PrismaClient}=await import("../../../prisma/product/generated/client.ts");
  const {PrismaPg}=await import("@prisma/adapter-pg");
  const {randomBytes,randomUUID}=await import("node:crypto");
  const {default:assert}=await import("node:assert/strict");
  const {createInterface}=await import("node:readline/promises");
  const {setTimeout:sleep}=await import("node:timers/promises");
  const {createRegistrationService}=await import("../../../lib/product-auth/registration.server.ts");
  const {createSecretTools}=await import("../../../lib/product-auth/secrets.server.ts");
  globalThis.fetch=async()=>{throw new Error("External requests disabled in OTP capture");};
  const client=new PrismaClient({adapter:new PrismaPg({connectionString:target.url,connectionTimeoutMillis:5000,query_timeout:10000},{schema:"product"}),log:[]});
  const prompt=createInterface({input:process.stdin,output:process.stdout,terminal:false});
  const watchdog=setTimeout(()=>{console.error("STOP: capture deadline exceeded. Preserve partial output and newly created fixtures; no retry/reset.");process.exit(1);},20*60_000);
  const next=async stage=>(await prompt.question("Capture the current screenshot. Type continue-"+stage+" to authorize the next stage, or stop: "))==="continue-"+stage;
  const show=(label,state,result)=>{
    console.log("\n"+label+" | actual service/PostgreSQL | "+new Date().toISOString());
    if(result!==undefined)console.log("service_result="+result);
    for(const table of ["user","issuance","verification","job"]) {console.log("product."+({user:"User",issuance:"EmailVerificationIssuance",verification:"Verification",job:"EmailOutbox"}[table])+" (safe selected columns)");console.table(state[table]?[state[table]]:[]);}
    console.log("session_count="+state.sessions);
  };
  try {
    const identity=await client.$queryRaw`SELECT current_database() AS database,current_user AS role,to_regnamespace('product')::text AS namespace,
      r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user`;
    assert.equal(identity.length,1);assert.equal(identity[0].database,"stitchtrack_product_test");assert.equal(identity[0].role,"stitchtrack_product_test_app");assert.equal(identity[0].namespace,"product");
    for(const key of ["rolsuper","rolcreatedb","rolcreaterole","rolbypassrls"])assert.equal(identity[0][key],false);
    const rights=await client.$queryRaw`SELECT has_schema_privilege(current_user,'product','CREATE') AS ddl,
      has_table_privilege(current_user,'product."Session"','INSERT') AS sessions,
      has_column_privilege(current_user,'product."TermsVersion"','approvedAt','INSERT') AS approve,
      has_any_column_privilege(current_user,'product."TermsAcceptance"','UPDATE') AS rewrite`;
    assert.deepEqual(rights,[{ddl:false,sessions:false,approve:false,rewrite:false}]);
    const terms=await client.termsVersion.findFirst({where:{isTestFixture:true,approvedAt:null,effectiveAt:null},select:{id:true}});
    assert.ok(terms,"An existing unapproved synthetic Terms fixture is required; no fixture seeded");
    const ring=id=>({currentId:id,keys:new Map([[id,randomBytes(32)]])});
    const keys={verifierKeys:ring("capture-verifier"),outboxKeys:ring("capture-outbox")},tools=createSecretTools(keys.verifierKeys,keys.outboxKeys);
    const service=createRegistrationService(client,{mode:"test",allowSyntheticTerms:true,requiredTermsVersionId:terms.id,
      authSecret:randomBytes(48).toString("base64url"),...keys,checkPassword:async()=>"not_found"});
    const fresh=async label=>{
      const email="otp-capture-"+randomUUID()+"@example.invalid";
      const {issuanceId}=await service.register({name:"Synthetic OTP Capture",email,password:" Exact synthetic OTP capture password ",termsAccepted:true,termsVersionId:terms.id});
      const envelope=await client.emailOutbox.findUnique({where:{issuanceId},select:{id:true,issuanceId:true,templateVersion:true,payloadCiphertext:true,nonce:true,authTag:true,keyId:true}});
      assert.ok(envelope);const payload=tools.open(envelope,envelope);assert.equal(payload.email,email);
      const acceptance=await client.termsAcceptance.findFirst({where:{user:{email},termsVersionId:terms.id},select:{context:true}});
      assert.equal(acceptance?.context,"synthetic-test");
      const subject={label,email,issuanceId,otp:payload.otp};console.log("Created fresh synthetic case="+label+" issuanceId="+issuanceId);return subject;
    };
    const verify=(subject,otp=subject.otp)=>service.verify({email:subject.email,issuanceId:subject.issuanceId,otp});
    const check=state=>{assert.equal(state.sessions,0);assert.equal(state.job.attemptCount,0);assert.equal(state.job.sentAt,null);};
    console.log("OWNER OTP CAPTURE: real product-test services, synthetic Terms only, no SMTP/HIBP/worker, real wall clock. Historical fixtures are not reused or reset.");
    const expired=await fresh("expiry"),initial=await inspectSubject(client,expired);check(initial);
    assert.equal(initial.user.emailVerified,false);assert.equal(initial.issuance.failedAttempts,0);assert.equal(initial.issuance.consumedAt,null);assert.ok(initial.verification);assert.equal(initial.job.status,"pending");
    show("EVIDENCE 19: persisted unverified challenge",initial);
    if(!await next("20"))return;
    console.log("Waiting for the stored issuance deadline using real wall time; no injected clock or timestamp edits.");
    while(Date.now()<=initial.issuance.expiresAt.getTime())await sleep(Math.min(1000,initial.issuance.expiresAt.getTime()-Date.now()+100));
    const expiredResult=await verify(expired),expiredState=await inspectSubject(client,expired);check(expiredState);
    assert.equal(expiredResult,"invalid");assert.equal(expiredState.user.emailVerified,false);assert.equal(expiredState.issuance.failedAttempts,0);assert.equal(expiredState.issuance.consumedAt,null);assert.equal(expiredState.job.status,"cancelled");
    show("EVIDENCE 20: correct stored code rejected after actual expiry",expiredState,expiredResult);
    if(!await next("21"))return;
    const wrong=await fresh("wrong-code"),bad=wrong.otp==="999999"?"888888":"999999";
    const trace=[];
    for(let attempt=1;attempt<=3;attempt++){
      const outcome=await verify(wrong,bad),state=await inspectSubject(client,wrong);check(state);
      assert.equal(outcome,"invalid");assert.equal(state.issuance.failedAttempts,attempt);assert.equal(state.user.emailVerified,false);
      assert.equal(state.job.status,attempt===3?"cancelled":"pending");trace.push({submission:attempt,result:outcome,failedAttempts:state.issuance.failedAttempts,outboxStatus:state.job.status});
    }
    const exhaustedResult=await verify(wrong),exhausted=await inspectSubject(client,wrong);check(exhausted);
    assert.equal(exhaustedResult,"invalid");assert.equal(exhausted.issuance.failedAttempts,3);assert.equal(exhausted.issuance.consumedAt,null);assert.equal(exhausted.user.emailVerified,false);assert.equal(exhausted.job.status,"cancelled");
    console.log("EVIDENCE 21: three incorrect submissions then correct code refused after exhaustion (codes withheld)");console.table(trace);show("Exhausted issuance",exhausted,exhaustedResult);
    if(!await next("22"))return;
    const replay=await fresh("replay"),first=await verify(replay),consumed=await inspectSubject(client,replay);check(consumed);
    assert.equal(first,"verified");assert.equal(consumed.user.emailVerified,true);assert.ok(consumed.issuance.consumedAt);assert.equal(consumed.issuance.verificationId,null);assert.equal(consumed.verification,null);assert.equal(consumed.job.status,"cancelled");
    const second=await verify(replay),after=await inspectSubject(client,replay);assert.equal(second,"invalid");assert.deepEqual(after,consumed);
    console.log("EVIDENCE 22: first result="+first+"; exact same in-memory code replay result="+second+"; persisted state unchanged");show("Consumed issuance after replay",after,second);
    await prompt.question("Capture Evidence 22, then press Enter to close database connections: ");
    console.log("All four capture stages passed. Three fresh synthetic users remain intentionally; no historical cleanup, SMTP or sessions. Keys discarded on exit.");
  } finally {prompt.close();try{await client.$disconnect();console.log("Connection cleanup completed; new committed fixtures retained, no reset or deletion.");}finally{clearTimeout(watchdog);}}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{await run(authorizeCapture(process.argv.slice(2),process.env));}
  catch{console.error("STOP: capture incomplete. Preserve partial output/new fixtures; no automatic retry or cleanup. No sensitive diagnostic printed.");process.exitCode=1;}
}
