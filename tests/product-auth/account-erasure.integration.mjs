// OWNER ONLY. Prepared proof; importing never connects or creates a fixture.
import {pathToFileURL} from "node:url";
import {join} from "node:path";
import {existsSync,writeFileSync} from "node:fs";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {erasureEnvironment,readErasureReceipt,withErasureConnection} from "../../scripts/account-erasure.mjs";
export function authorizeErasureProof(args,env){
 if(args.length!==1||!["--owner-setup","--owner-lock-proof","--owner-verify","--owner-cleanup"].includes(args[0]))throw new Error();
 return {...erasureEnvironment(env),action:args[0]};
}
async function main(){
 const scope=authorizeErasureProof(process.argv.slice(2),process.env);
 await import("../../scripts/register-server-only.mjs");
 const {assertErasureDatabase,runControlledErasure,erasureProofPlan,erasureHistoricalSnapshot:snapshot,erasureRetainedDigest:retained,lockErasureProofTables}=await import("../../lib/product-auth/account-erasure.server.ts");
 const {OUTBOX_LOCK}=await import("../../lib/product-auth/outbox-worker.server.ts");
 const file=join(scope.directory,"proof.json");
 const quiescent=async db=>{assert.equal((await db.query("SELECT count(*)::int AS others FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'")).rows[0].others,0);};
 const begin=async db=>{await db.query("BEGIN");await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='5s'");await assertErasureDatabase(db);assert.equal((await db.query("SELECT pg_try_advisory_xact_lock($1,$2) AS held",[...OUTBOX_LOCK])).rows[0].held,true);await lockErasureProofTables(db);};
 if(scope.action==="--owner-setup"){
  assert.equal(existsSync(file),false);
  const plan=erasureProofPlan(randomUUID()),{hashPassword}=await import("../../lib/auth/password.server.ts"),{createSecretTools}=await import("../../lib/product-auth/secrets.server.ts");
  const hash=await hashPassword(randomBytes(32).toString("base64")),tools=createSecretTools({currentId:"proof-v",keys:new Map([["proof-v",randomBytes(32)]])},{currentId:"proof-o",keys:new Map([["proof-o",randomBytes(32)]])});
  await withErasureConnection(scope.target,async db=>{
   try{await begin(db);await quiescent(db);
    for(const [sql,args]of [['SELECT count(*)::int AS n FROM product."User" WHERE "id"=ANY($1::text[]) OR "emailCanonical"=ANY($2::text[])',[[plan.target,plan.keep],[plan.target+"@example.invalid",plan.keep+"@example.invalid"]]],['SELECT count(*)::int AS n FROM product."TermsVersion" WHERE "id"=$1 OR "version"=$1',[plan.terms]],['SELECT count(*)::int AS n FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.rateKeys]],['SELECT count(*)::int AS n FROM product."Verification" WHERE "identifier"=ANY($1::text[])',[["forget-password-otp-"+plan.target+"@example.invalid","email-verification-otp-"+plan.target+"@example.invalid"]]]])assert.equal((await db.query(sql,args)).rows[0].n,0);
    const receipt={format:1,run:plan.run,created:false,retainedDigest:null,baseline:await snapshot(db,plan)};writeFileSync(file,JSON.stringify(receipt),{flag:"wx",mode:0o600});
    const time=(await db.query("SELECT date_trunc('milliseconds',clock_timestamp()) AS time")).rows[0].time,expiry=new Date(+time+300000);
    await db.query('INSERT INTO product."TermsVersion"("id","version","contentDigest","immutableDocumentRef","isTestFixture") VALUES($1,$1,$2,$3,true)',[plan.terms,createHash("sha256").update("Synthetic erasure proof, not legal terms").digest("hex"),"synthetic-only"]);
    for(const id of [plan.target,plan.keep]){
     await db.query('INSERT INTO product."User"("id","name","emailCanonical","emailVerified","createdAt","updatedAt","deletionRequestedAt") VALUES($1,$2,$3,true,$4,$4,$5)',[id,plan.name,id+"@example.invalid",time,id===plan.target?time:null]);
     await db.query('INSERT INTO product."Account"("id","userId","accountId","providerId","password","createdAt","updatedAt") VALUES($1,$2,$2,$3,$4,$5,$5)',[id+"-credential",id,"credential",hash,time]);
     await db.query('INSERT INTO product."TermsAcceptance"("id","userId","termsVersionId","acceptedAt","context") VALUES($1,$2,$3,$4,$5)',[id+"-acceptance",id,plan.terms,time,"synthetic-test"]);
    }
    // Deliberately stale, unusable session on the already locked fixture; never a browser credential.
    await db.query('INSERT INTO product."Session"("id","token","userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$5)',[plan.target+"-session","hmac-sha256:v1:"+randomBytes(32).toString("hex"),plan.target,expiry,time]);
    for(const [suffix,type]of [["linked","forget-password"],["orphan","email-verification"]])await db.query('INSERT INTO product."Verification"("id","identifier","value","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$5)',[plan.target+"-"+suffix,type+"-otp-"+plan.target+"@example.invalid",randomBytes(32).toString("hex")+":0",expiry,time]);
    const issue=plan.target+"-issuance",email=plan.target+"@example.invalid",otp="004281",mail={id:plan.target+"-mail",issuanceId:issue,templateVersion:"tailor-password-reset-v1"},envelope=tools.seal(mail,{email,otp});
    await db.query('INSERT INTO product."EmailVerificationIssuance"("id","userId","emailCanonical","verificationId","verifier","verifierKeyId","createdAt","expiresAt","purpose") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[issue,plan.target,email,plan.target+"-linked",tools.mac("password-reset/"+issue,email,otp),"proof-v",time,expiry,"password-reset"]);
    await db.query('INSERT INTO product."EmailOutbox"("id","issuanceId","templateVersion","payloadCiphertext","nonce","authTag","keyId","createdAt","updatedAt","availableAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$8)',[mail.id,issue,mail.templateVersion,Buffer.from(envelope.payloadCiphertext),Buffer.from(envelope.nonce),Buffer.from(envelope.authTag),envelope.keyId,time]);
    for(const [i,key]of plan.rateKeys.entries()){const interval=i===0?1000:604800000,stamp=new Date(+time+(i===0?-2000:0));await db.query('INSERT INTO product."AuthRateBucket"("keyDigest","capacity","refillIntervalMs","tokens","refilledAt","expiresAt","lastAllowed") VALUES($1,1,$2,0,$3,$4,true)',[key,interval,stamp,new Date(+stamp+interval)]);}
    receipt.retainedDigest=await retained(db,plan);await db.query("COMMIT");receipt.created=true;writeFileSync(file,JSON.stringify(receipt),{mode:0o600});console.log(JSON.stringify({proof:"account-erasure",stage:"setup",run:plan.run,createdUsers:2,syntheticTerms:true,smtp:false}));
   }catch{await db.query("ROLLBACK").catch(()=>{});throw new Error();}
  });return;
 }
 const receipt=readErasureReceipt(scope.directory),plan=erasureProofPlan(receipt.run);
 if(scope.action==="--owner-lock-proof"){
  await withErasureConnection(scope.target,async owner=>{await begin(owner);try{
   await withErasureConnection(scope.target,async contender=>{const blocked=await runControlledErasure(contender,receipt,"dry-run");assert.equal(blocked.outcome,"busy");assert.ok(Object.values(blocked.counts).every(n=>n===0));});
  }finally{await owner.query("ROLLBACK");}});
  const released=await withErasureConnection(scope.target,db=>runControlledErasure(db,receipt,"dry-run"));assert.equal(released.outcome,"dry_run");assert.equal(released.wouldErase.User,1);console.log(JSON.stringify({proof:"account-erasure",stage:"lock-proof",run:plan.run,contention:true,release:true}));return;
 }
 await withErasureConnection(scope.target,async db=>{
  try{await begin(db);await quiescent(db);assert.deepEqual(await snapshot(db,plan),receipt.baseline);assert.equal(await retained(db,plan),receipt.retainedDigest);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM product."User" WHERE "id"=$1',[plan.target])).rows[0].n,0);
   for(const [table,column,value]of [["Account","userId",plan.target],["Session","userId",plan.target],["TermsAcceptance","userId",plan.target],["EmailVerificationIssuance","userId",plan.target],["EmailOutbox","id",plan.target+"-mail"]])assert.equal((await db.query('SELECT count(*)::int AS n FROM product."'+table+'" WHERE "'+column+'"=$1',[value])).rows[0].n,0);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM product."Verification" WHERE "id"=ANY($1::text[])',[[plan.target+"-linked",plan.target+"-orphan"]])).rows[0].n,0);
   const keep=(await db.query('SELECT "name","emailCanonical","image","disabledAt","deletionRequestedAt" FROM product."User" WHERE "id"=$1',[plan.keep])).rows[0];assert.deepEqual(keep,{name:plan.name,emailCanonical:plan.keep+"@example.invalid",image:null,disabledAt:null,deletionRequestedAt:null});
   assert.equal((await db.query('SELECT count(*)::int AS n FROM product."TermsAcceptance" WHERE "userId"=$1 AND "termsVersionId"=$2 AND "context"=$3',[plan.keep,plan.terms,"synthetic-test"])).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM product."TermsVersion" WHERE "id"=$1 AND "isTestFixture" AND "approvedAt" IS NULL AND "effectiveAt" IS NULL',[plan.terms])).rows[0].n,1);
   if(scope.action==="--owner-verify"){await db.query("ROLLBACK");console.log(JSON.stringify({proof:"account-erasure",stage:"verify",run:plan.run,historicalUnchanged:true,targetErased:true,unrelatedFixtureRetained:true,sharedTermsRetained:true}));return;}
   // Separate owner-authorized fixture teardown, never part of the scheduled job.
   for(const table of ["Session","EmailVerificationIssuance"])assert.equal((await db.query('SELECT count(*)::int AS n FROM product."'+table+'" WHERE "userId"=$1',[plan.keep])).rows[0].n,0);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM product."Account" WHERE "userId"=$1 AND "id"=$2 AND "accountId"=$1 AND "providerId"=$3',[plan.keep,plan.keep+"-credential","credential"])).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM product."TermsAcceptance" WHERE "termsVersionId"=$1',[plan.terms])).rows[0].n,1);
   await db.query('DELETE FROM product."TermsAcceptance" WHERE "userId"=$1 AND "termsVersionId"=$2',[plan.keep,plan.terms]);await db.query('DELETE FROM product."Account" WHERE "id"=$1 AND "userId"=$2',[plan.keep+"-credential",plan.keep]);
   assert.equal((await db.query('DELETE FROM product."User" WHERE "id"=$1 AND "deletionRequestedAt" IS NULL',[plan.keep])).rowCount,1);
   await db.query('DELETE FROM product."TermsVersion" WHERE "id"=$1 AND "isTestFixture"',[plan.terms]);await db.query('DELETE FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[plan.rateKeys]);
   assert.deepEqual(await snapshot(db,plan),receipt.baseline);await db.query("COMMIT");console.log(JSON.stringify({proof:"account-erasure",stage:"cleanup",run:plan.run,historicalUnchanged:true,fixtureCleanupCommitted:true}));
  }catch{await db.query("ROLLBACK").catch(()=>{});throw new Error();}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main();}catch{console.error(JSON.stringify({proof:"account-erasure",outcome:"failed_or_unconfirmed",reason:"configuration_preflight_fixture_or_cleanup"}));process.exitCode=1;}}
