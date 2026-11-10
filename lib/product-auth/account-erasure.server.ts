import "server-only";
import {createHash} from "node:crypto";
import type {Client} from "pg";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {PRODUCT_TEST_CLEANUP_ROLE} from "../../prisma/product/targets.ts";
import {OUTBOX_LOCK} from "./outbox-worker.server.ts";
import {VERIFICATION_EMAIL_TEMPLATE} from "./verification-email.server.ts";
import {DEVELOPMENT_VERIFICATION_TEMPLATE} from "./development-policy.ts";
import {RESET_TEMPLATE} from "../auth/password-reset-contract.ts";
export const ERASURE_TABLES=["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailOutbox","EmailVerificationIssuance","AuthRateBucket"] as const;
export type ErasureCounts=Record<typeof ERASURE_TABLES[number],number>;
export type ErasureDb=Pick<Client,"query">;
const DAY=86400000,MAX_ROWS=1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function erasureProofPlan(run:string){
 if(!UUID.test(run))throw new Error("Invalid erasure proof scope");
 const prefix="erasure-proof-"+run;
 return {run,target:prefix+"-target",keep:prefix+"-keep",terms:prefix+"-terms",name:"Synthetic account erasure proof",
  rateKeys:["expired","active"].map(label=>"rl:v1:"+createHash("sha256").update("stitchtrack/erasure-fixture/v1/"+run+"/"+label).digest("hex"))};
}
export function erasureDeadline(requested:Date|null,now:Date){
 if(!(now instanceof Date)||!Number.isFinite(+now)||requested!==null&&(!(requested instanceof Date)||!Number.isFinite(+requested)))throw new Error("Invalid erasure time");
 const remaining=requested===null?null:+requested+30*DAY-(+now);
 return {eligible:requested!==null&&requested<=now,approaching:remaining!==null&&remaining<=3*DAY,overdue:remaining!==null&&remaining<0};
}
// Future non-fixture eligibility only. No caller-supplied clock/request timestamp.
// The caller must first authorize/guard the target and keep this SAME dedicated
// connection/transaction through retention/ownership checks and any future deletion.
// SAVEPOINT refuses autocommit use; releasing it does not release the User row lock.
export type ErasureGraceEligibility = {status:"eligible"|"missing"} |
 {status:"not_eligible";reason:"no_request"|"invalid_request"|"future_request"|"grace_period"};
export async function lockErasureGraceEligibility(db:ErasureDb,userId:string):Promise<ErasureGraceEligibility>{
 try{
  if(typeof userId!=="string"||!userId)throw new Error();
  await db.query("SAVEPOINT erasure_grace_check");
  const locked=await db.query('/* erasure:grace-lock */ SELECT "id" FROM product."User" WHERE "id"=$1 FOR UPDATE',[userId]);
  if(locked.rows.length>1||locked.rows.length===1&&locked.rows[0].id!==userId)throw new Error();
  let result:ErasureGraceEligibility={status:"missing"};
  if(locked.rows.length){
   // Separate statement samples database time AFTER lock acquisition, not at BEGIN
   // or before a potentially delayed lock. The request is reread under that lock.
   const checked=await db.query(`/* erasure:grace-check */ WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS now)
    SELECT CASE WHEN u."deletionRequestedAt" IS NULL THEN 'no_request'
     WHEN NOT isfinite(u."deletionRequestedAt") THEN 'invalid_request'
     WHEN u."deletionRequestedAt">stamp.now THEN 'future_request'
     WHEN u."deletionRequestedAt"<=stamp.now-INTERVAL '24 hours' THEN 'eligible'
     ELSE 'grace_period' END AS decision
    FROM product."User" u CROSS JOIN stamp WHERE u."id"=$1`,[userId]);
   if(checked.rows.length!==1)throw new Error();
   const decision=checked.rows[0].decision;
   if(decision==="eligible")result={status:"eligible"};
   else if(["no_request","invalid_request","future_request","grace_period"].includes(decision))result={status:"not_eligible",reason:decision};
   else throw new Error();
  }
  await db.query("RELEASE SAVEPOINT erasure_grace_check");
  return result;
 }catch{
  // No fallback, transaction recovery or native error disclosure. Caller rolls back.
  throw new Error("Erasure grace eligibility unavailable.");
 }
}
export type ErasureBaseline=Record<typeof ERASURE_TABLES[number],{count:number;digest:string}>;
export type ErasureReceipt=Readonly<{format:1;created:true;run:string;baseline:ErasureBaseline;retainedDigest:string}>;
// Freeze the compared data until commit/rollback, not merely its read snapshot.
// Coarse locks are intentional for this quiescent, owner-only assessment proof.
export async function lockErasureProofTables(db:ErasureDb){
 await db.query('/* erasure:protect-snapshots */ LOCK TABLE '+ERASURE_TABLES.map(table=>'product."'+table+'"').join(',')+' IN SHARE ROW EXCLUSIVE MODE');
}
export async function erasureHistoricalSnapshot(db:ErasureDb,plan:ReturnType<typeof erasureProofPlan>):Promise<ErasureBaseline>{
  const result={} as ErasureBaseline;for(const table of ERASURE_TABLES){
   // Only reviewed identifiers are interpolated; all run-derived values are parameters.
   const key=table==="AuthRateBucket"?"keyDigest":"id";
   const filter=table==="User"?['"id"=ANY($1::text[])',[plan.target,plan.keep]]:
    table==="TermsVersion"?['"id"=$1',plan.terms]:table==="Verification"?['"id"=ANY($1::text[])',[plan.target+"-linked",plan.target+"-orphan"]]:
    table==="AuthRateBucket"?['"keyDigest"=ANY($1::text[])',plan.rateKeys]:table==="EmailOutbox"?['"id"=$1',plan.target+"-mail"]:['"userId"=ANY($1::text[])',[plan.target,plan.keep]];
   const sql=`/* erasure:baseline:${table} */ SELECT count(*)::int AS count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY "${key}"),'[]'),'UTF8')),'hex') AS digest FROM product."${table}" t WHERE NOT (${filter[0]})`;
   result[table]=(await db.query(sql,[filter[1]])).rows[0];
  }return result;
 };
export const erasureRetainedDigest=async(db:ErasureDb,plan:ReturnType<typeof erasureProofPlan>):Promise<string>=>(await db.query(`/* erasure:retained */ WITH data AS (
  SELECT 'User' AS kind,to_jsonb(t) AS row FROM product."User" t WHERE "id"=$1
  UNION ALL SELECT 'Account',to_jsonb(t) FROM product."Account" t WHERE "userId"=$1
  UNION ALL SELECT 'Session',to_jsonb(t) FROM product."Session" t WHERE "userId"=$1
  UNION ALL SELECT 'EmailVerificationIssuance',to_jsonb(t) FROM product."EmailVerificationIssuance" t WHERE "userId"=$1
  UNION ALL SELECT 'TermsAcceptance',to_jsonb(t) FROM product."TermsAcceptance" t WHERE "userId"=$1
  UNION ALL SELECT 'TermsVersion',to_jsonb(t) FROM product."TermsVersion" t WHERE "id"=$2
  UNION ALL SELECT 'AuthRateBucket',to_jsonb(t) FROM product."AuthRateBucket" t WHERE "keyDigest"=$3)
  SELECT encode(sha256(convert_to(COALESCE(string_agg(kind||row::text,E'\\n' ORDER BY kind,row::text),'[]'),'UTF8')),'hex') AS digest FROM data`,[plan.keep,plan.terms,plan.rateKeys[1]])).rows[0].digest;

export const EXPECTED_ERASURE_FKS=[
 ["Account_userId_fkey","Account","userId","User","id","r","r"],
 ["Session_userId_fkey","Session","userId","User","id","r","r"],
 ["TermsAcceptance_userId_fkey","TermsAcceptance","userId","User","id","r","r"],
 ["TermsAcceptance_termsVersionId_fkey","TermsAcceptance","termsVersionId","TermsVersion","id","r","r"],
 ["EmailOutbox_issuanceId_fkey","EmailOutbox","issuanceId","EmailVerificationIssuance","id","r","r"],
 ["EmailVerificationIssuance_userId_fkey","EmailVerificationIssuance","userId","User","id","r","r"],
 ["EmailVerificationIssuance_verificationId_fkey","EmailVerificationIssuance","verificationId","Verification","id","n","r"],
].sort((a,b)=>a[0].localeCompare(b[0]));
// Cleanup reads only inspection columns; shared records and rate buckets are never deleted.
export const CLEANUP_DELETE_TABLES=["User","Account","Session","Verification","EmailVerificationIssuance","EmailOutbox"] as const;
export const CLEANUP_SELECT_COLUMNS={
 User:["id","emailCanonical","image","emailVerified","isAdministrator","deletionRequestedAt"],
 Account:["id","userId","accountId","providerId","password"],Session:["id","userId"],
 Verification:["id","identifier"],TermsVersion:["id"],TermsAcceptance:["id","userId","termsVersionId"],
 EmailVerificationIssuance:["id","userId","emailCanonical","verificationId","purpose"],
 EmailOutbox:["id","issuanceId","status","templateVersion"],AuthRateBucket:[],
 _prisma_migrations:["migration_name","checksum","finished_at","rolled_back_at","logs","applied_steps_count"],
} as const;
async function assertCleanupPrivileges(db:ErasureDb){
 const result=await db.query(`/* erasure:cleanup-permissions */ SELECT
  has_schema_privilege(current_user,'product','USAGE') AND NOT has_schema_privilege(current_user,'product','CREATE') AND
  NOT has_database_privilege(current_user,current_database(),'CREATE') AND
  NOT has_database_privilege(current_user,current_database(),'TEMP') AND current_setting('transaction_read_only')='off' AND
  bool_and(has_table_privilege(current_user,c.oid,'DELETE')=(c.relname=ANY($1::text[])) AND
   NOT has_table_privilege(current_user,c.oid,'INSERT') AND NOT has_table_privilege(current_user,c.oid,'TRUNCATE') AND
   NOT has_table_privilege(current_user,c.oid,'REFERENCES') AND NOT has_table_privilege(current_user,c.oid,'TRIGGER') AND
   (SELECT bool_and(has_column_privilege(current_user,c.oid,a.attnum,'SELECT')=
      (($2::jsonb->c.relname) ? a.attname) AND
     has_column_privilege(current_user,c.oid,a.attnum,'UPDATE')=(c.relname='User' AND a.attname='updatedAt') AND
     NOT has_column_privilege(current_user,c.oid,a.attnum,'INSERT') AND
     NOT has_column_privilege(current_user,c.oid,a.attnum,'REFERENCES'))
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) AS allowed
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='product' AND c.relkind='r'`,
  [[...CLEANUP_DELETE_TABLES],JSON.stringify(CLEANUP_SELECT_COLUMNS)]);
 if(result.rows.length!==1||result.rows[0].allowed!==true)throw new Error();
}
export async function assertErasureDatabase(db:ErasureDb,access:"migrator"|"cleanup"="migrator"){
 assertProductMigrationFiles();
 const {rows:[identity],rowCount}=await db.query(`/* erasure:identity */ SELECT current_database() AS database,current_user AS role,session_user AS login,
  current_setting('port') AS port,current_setting('TimeZone') AS timezone,NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe,
  EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user) AS owns
  FROM pg_roles WHERE rolname=current_user`);
 const cleanup=access==="cleanup",owner="stitchtrack_product_test_migrator";
  if(rowCount!==1||identity.database!=="stitchtrack_product_test"||identity.role!==(cleanup?PRODUCT_TEST_CLEANUP_ROLE:owner)||identity.login!==identity.role||identity.port!=="5432"||identity.timezone!=="UTC"||!identity.safe||identity.owns!==!cleanup)throw new Error();
  if(cleanup){
   const guard=await db.query(`/* erasure:cleanup-identity */ SELECT
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)='stitchtrack_product_test_migrator') AND
    inet_server_addr()=inet '127.0.0.1' AND inet_server_port()=5432 AND rolcanlogin AND NOT rolinherit AND NOT rolreplication AND
    NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AND
    NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba=r.oid OR (datname='stitchtrack_product_dev' AND has_database_privilege(current_user,oid,'CONNECT'))) AND
    NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid OR (nspname NOT IN ('pg_catalog','information_schema','product') AND has_schema_privilege(current_user,oid,'CREATE'))) AND
    NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
    AS allowed FROM pg_roles r WHERE rolname=current_user`);
   if(guard.rows.length!==1||guard.rows[0].allowed!==true)throw new Error();
  }
 const tables=(await db.query(`/* erasure:tables */ SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname`)).rows;
 if(JSON.stringify(tables.map(r=>r.name).sort())!==JSON.stringify([...ERASURE_TABLES,"_prisma_migrations"].sort())||tables.some(r=>r.owner!==owner||r.kind!=="r"))throw new Error();
 const history=(await db.query(`/* erasure:history */ SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations`)).rows;
 if(history.length!==Object.keys(PRODUCT_MIGRATIONS).length||new Set(history.map(r=>r.migration_name)).size!==history.length||history.some(r=>!Object.hasOwn(PRODUCT_MIGRATIONS,r.migration_name)||PRODUCT_MIGRATIONS[r.migration_name as keyof typeof PRODUCT_MIGRATIONS]!==r.checksum||!r.finished_at||r.rolled_back_at||r.logs!==null||r.applied_steps_count!==1))throw new Error();
 const fks=(await db.query(`/* erasure:fks */ SELECT c.conname,s.relname AS source,t.relname AS target,ns.nspname AS source_schema,nt.nspname AS target_schema,c.confdeltype,c.confupdtype,
  ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS "columns",
  ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS referenced_columns
  FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=s.relnamespace JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace nt ON nt.oid=t.relnamespace
  WHERE c.contype='f' AND (ns.nspname='product' OR nt.nspname='product')`)).rows;
 const shapes=fks.map(r=>[r.conname,r.source,r.columns.join(","),r.target,r.referenced_columns.join(","),r.confdeltype,r.confupdtype]).sort((a,b)=>a[0].localeCompare(b[0]));
 if(fks.some(r=>r.source_schema!=="product"||r.target_schema!=="product")||JSON.stringify(shapes)!==JSON.stringify(EXPECTED_ERASURE_FKS))throw new Error();
}
const zeros=():ErasureCounts=>Object.fromEntries(ERASURE_TABLES.map(t=>[t,0])) as ErasureCounts;
// One shared FK-ordered deletion sequence for the historical proof and exact test account.
// Caller holds worker/table/User locks, has verified attribution, and owns COMMIT/ROLLBACK.
async function eraseAuthenticationRows(db:ErasureDb,userId:string,requestedAt:Date|string,verificationIds:string[],expected:ErasureCounts,scope:"migrator"|"restricted-cleanup"="migrator"):Promise<ErasureCounts>{
 // Restricted cleanup has no TermsAcceptance DELETE privilege, even for zero rows.
 // Prove zero before issuing ANY DELETE; actual acceptances already block inspection.
 if(scope==="restricted-cleanup"&&expected.TermsAcceptance!==0)throw new Error();
 const counts=zeros();
 const statements:[keyof ErasureCounts,string,unknown[]][]=[
    ["EmailOutbox",'DELETE FROM product."EmailOutbox" WHERE "issuanceId" IN(SELECT "id" FROM product."EmailVerificationIssuance" WHERE "userId"=$1)',[userId]],
    ["TermsAcceptance",'DELETE FROM product."TermsAcceptance" WHERE "userId"=$1',[userId]],
    ["Session",'DELETE FROM product."Session" WHERE "userId"=$1',[userId]],
    ["Account",'DELETE FROM product."Account" WHERE "userId"=$1',[userId]],
    ["EmailVerificationIssuance",'DELETE FROM product."EmailVerificationIssuance" WHERE "userId"=$1',[userId]],
    ["Verification",'DELETE FROM product."Verification" WHERE "id"=ANY($1::text[])',[verificationIds]],
    ["User",'DELETE FROM product."User" WHERE "id"=$1 AND "deletionRequestedAt"=$2',[userId,requestedAt]],
   ];
 for(const [table,sql,args]of statements){
   if(table==="TermsAcceptance"&&scope==="restricted-cleanup")continue;
   const result=await db.query("/* erasure:delete:"+table+" */ "+sql,args);if(result.rowCount!==expected[table])throw new Error();counts[table]=result.rowCount!;}
 return counts;
}
// One exact disposable user/batch. Never scans existing accounts for deletion.
// Caller owns the dedicated connection; errors never escape with native SQL details.
export async function runControlledErasure(db:ErasureDb,receipt:ErasureReceipt,mode:"dry-run"|"execute"){
 if(!receipt||receipt.format!==1||receipt.created!==true||typeof receipt.retainedDigest!=="string"||!/^[0-9a-f]{64}$/u.test(receipt.retainedDigest))throw new Error("Complete erasure receipt required");
 const plan=erasureProofPlan(receipt.run);if(!["dry-run","execute"].includes(mode))throw new Error("Invalid erasure mode");
 let commitAttempted=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='10s'");
  await assertErasureDatabase(db);
  const locked=(await db.query("/* erasure:lock */ SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked",[...OUTBOX_LOCK])).rows[0]?.locked;
  if(locked!==true){await db.query("ROLLBACK");return {outcome:"busy",counts:zeros()};}
  await lockErasureProofTables(db);
  const baseline=await erasureHistoricalSnapshot(db,plan);
  const baselineMatches=ERASURE_TABLES.every(table=>baseline[table].count===receipt.baseline?.[table]?.count&&baseline[table].digest===receipt.baseline?.[table]?.digest);
  if(!baselineMatches||await erasureRetainedDigest(db,plan)!==receipt.retainedDigest){await db.query("ROLLBACK");return {outcome:"blocked",reason:"proof_snapshot_mismatch",counts:zeros()};}
  const metrics=(await db.query(`/* erasure:metrics */ SELECT count(*)::int AS pending,
   count(*) FILTER(WHERE "deletionRequestedAt"+interval '30 days'<=clock_timestamp()+interval '3 days')::int AS approaching,
   count(*) FILTER(WHERE "deletionRequestedAt"+interval '30 days'<clock_timestamp())::int AS overdue FROM product."User" WHERE "deletionRequestedAt" IS NOT NULL`)).rows[0];
  const {rows}=await db.query(`/* erasure:user */ SELECT "id","name","emailCanonical","image","deletionRequestedAt",clock_timestamp() AS now FROM product."User" WHERE "id"=$1 FOR UPDATE`,[plan.target]);
  const user=rows[0];let wouldErase=zeros(),verificationIds:string[]=[];
  if(user){
   if(user.id!==plan.target||user.name!==plan.name||user.emailCanonical!==plan.target+"@example.invalid")throw new Error();
   const time=erasureDeadline(user.deletionRequestedAt,user.now);
   let reason=!time.eligible?"not_eligible":user.image!==null?"external_asset_review":undefined;
   const terms=(await db.query(`/* erasure:terms */ SELECT t."isTestFixture",t."approvedAt",t."effectiveAt",a."context" FROM product."TermsAcceptance" a JOIN product."TermsVersion" t ON t."id"=a."termsVersionId" WHERE a."userId"=$1 LIMIT 1001`,[plan.target])).rows;
   if(terms.length>MAX_ROWS)throw new Error();
   if(terms.some(t=>t.isTestFixture!==true||t.approvedAt!==null||t.effectiveAt!==null||t.context!=="synthetic-test"))reason="retention_review_required";
   if(reason){await db.query("ROLLBACK");return {outcome:"blocked",reason,counts:zeros(),metrics,deadline:time};}
   const identifiers=["email-verification-otp-"+user.emailCanonical,"forget-password-otp-"+user.emailCanonical];
   const unmapped=(await db.query(`/* erasure:unmapped */ SELECT EXISTS(SELECT 1 FROM product."Verification" WHERE (strpos("identifier",$1)>0 OR strpos("identifier",$2)>0) AND NOT("identifier"=ANY($3::text[]))) AS invalid`,[user.emailCanonical,plan.target,identifiers])).rows[0]?.invalid;
   if(unmapped!==false){await db.query("ROLLBACK");return {outcome:"blocked",reason:"verification_mapping_review",counts:zeros(),metrics};}
   const verification=(await db.query(`/* erasure:verification */ SELECT "id","identifier" FROM product."Verification" WHERE "id" IN(SELECT "verificationId" FROM product."EmailVerificationIssuance" WHERE "userId"=$1) OR "identifier"=ANY($2::text[]) LIMIT 1001 FOR UPDATE`,[plan.target,identifiers])).rows;
   if(verification.length>MAX_ROWS||verification.some(v=>!identifiers.includes(v.identifier)))throw new Error();verificationIds=verification.map(v=>v.id);
   const invalid=(await db.query(`/* erasure:ownership */ SELECT EXISTS(SELECT 1 FROM product."EmailVerificationIssuance" WHERE ("verificationId"=ANY($2::text[]) AND "userId"<>$1)
    OR ("userId"=$1 AND ("emailCanonical"<>$3 OR "purpose" NOT IN ('email-verification','password-reset')))) AS invalid`,[plan.target,verificationIds,user.emailCanonical])).rows[0]?.invalid;
   if(invalid!==false)throw new Error();
   const count=(await db.query(`/* erasure:counts */ SELECT
    (SELECT count(*)::int FROM product."Account" WHERE "userId"=$1) AS "Account",
    (SELECT count(*)::int FROM product."Session" WHERE "userId"=$1) AS "Session",
    (SELECT count(*)::int FROM product."EmailVerificationIssuance" WHERE "userId"=$1) AS "EmailVerificationIssuance",
    (SELECT count(*)::int FROM product."EmailOutbox" WHERE "issuanceId" IN(SELECT "id" FROM product."EmailVerificationIssuance" WHERE "userId"=$1)) AS "EmailOutbox"`,[plan.target])).rows[0];
   wouldErase={...wouldErase,...count,User:1,TermsAcceptance:terms.length,Verification:verificationIds.length};
   if(Object.values(wouldErase).some(n=>!Number.isSafeInteger(n)||n<0||n>MAX_ROWS))throw new Error();
  }
  if(!user){
   const residual=(await db.query(`/* erasure:residual */ SELECT EXISTS(SELECT 1 FROM product."Verification" WHERE "identifier"=ANY($1::text[]) OR "id"=ANY($2::text[]) OR strpos("identifier",$3)>0) AS found`,
    [["email-verification-otp-"+plan.target+"@example.invalid","forget-password-otp-"+plan.target+"@example.invalid"],[plan.target+"-linked",plan.target+"-orphan"],plan.target])).rows[0]?.found;
   if(residual!==false){await db.query("ROLLBACK");return {outcome:"blocked",reason:"orphan_cleanup_review",counts:zeros(),metrics};}
  }
  const expired=(await db.query(`/* erasure:expired */ SELECT "keyDigest" FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[]) AND "expiresAt"<=clock_timestamp() ORDER BY "keyDigest" LIMIT 2 FOR UPDATE SKIP LOCKED`,[plan.rateKeys])).rows.map(r=>r.keyDigest);
  wouldErase.AuthRateBucket=expired.length;
  if(mode==="dry-run"){await db.query("ROLLBACK");return {outcome:"dry_run",counts:zeros(),wouldErase,metrics};}
  const counts=zeros();
  if(user){
   Object.assign(counts,await eraseAuthenticationRows(db,plan.target,user.deletionRequestedAt,verificationIds,wouldErase));
  }
  if(expired.length){const result=await db.query('/* erasure:delete:AuthRateBucket */ DELETE FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[expired]);if(result.rowCount!==expired.length)throw new Error();counts.AuthRateBucket=result.rowCount!;}
  commitAttempted=true;await db.query("COMMIT");return {outcome:Object.values(counts).some(Boolean)?"erased":"noop",counts,metrics};
 }catch{
  let rollback=true;try{await db.query("ROLLBACK");}catch{rollback=false;}
  return {outcome:commitAttempted||!rollback?"unconfirmed":"failed_rolled_back",counts:commitAttempted||!rollback?null:zeros()};
 }
}

// Exact owner-approved test scope, shared by dry-run and execute. Historical receipts stay separate.
export type ErasureTestAccountApproval=Readonly<{userId:string;expectedDeletionRequestedAt:string;disposableTestAccount:true}>;
export function validateErasureTestAccountApproval(input:unknown):ErasureTestAccountApproval{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Exact test-account approval required.");
 const value=input as Record<string,unknown>;
 if(Object.keys(value).sort().join()!=="disposableTestAccount,expectedDeletionRequestedAt,userId"||value.disposableTestAccount!==true||
  typeof value.userId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(value.userId)||value.userId.startsWith("erasure-proof-")||
  typeof value.expectedDeletionRequestedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.expectedDeletionRequestedAt)||
  !Number.isFinite(Date.parse(value.expectedDeletionRequestedAt))||new Date(value.expectedDeletionRequestedAt).toISOString()!==value.expectedDeletionRequestedAt)
  throw new Error("Exact test-account approval required.");
 return Object.freeze({userId:value.userId,expectedDeletionRequestedAt:value.expectedDeletionRequestedAt,disposableTestAccount:true});
}
export type ErasureTestDryRun={status:"grace_period"|"eligible"|"blocked"|"missing"|"failed";reason:string;
 relatedCounts?:Omit<ErasureCounts,"AuthRateBucket">;wouldAffect:ErasureCounts|null;pendingEmailCount?:number;
 rateBuckets:{action:"retain_all";attribution:"not_available"}};
const testResult=(status:ErasureTestDryRun["status"],reason:string):ErasureTestDryRun=>({status,reason,wouldAffect:null,rateBuckets:{action:"retain_all",attribution:"not_available"}});
export type ErasureTestExecution={outcome:"erased"|"noop"|"blocked"|"failed_rolled_back"|"unconfirmed";reason:string;counts:ErasureCounts|null};
const executionResult=(outcome:ErasureTestExecution["outcome"],reason:string,counts:ErasureCounts|null=zeros()):ErasureTestExecution=>({outcome,reason,counts});
type TestAccountInspection={report:ErasureTestDryRun;verificationIds:string[];fingerprint:string};
async function inspectLockedTestAccount(db:ErasureDb,scope:ErasureTestAccountApproval):Promise<TestAccountInspection>{
 const result=testResult;
  const grace=await lockErasureGraceEligibility(db,scope.userId);
  if(grace.status==="missing")return {report:result("missing","target_missing_not_proof_of_erasure"),verificationIds:[],fingerprint:""};
  const target=await db.query(`/* erasure:preflight-target */ SELECT "id","emailCanonical",("image" IS NOT NULL) AS "hasImage",
   ("deletionRequestedAt"=$2::timestamptz) AS "requestMatches","emailVerified","isAdministrator"
   FROM product."User" WHERE "id"=$1`,[scope.userId,scope.expectedDeletionRequestedAt]);
  if(target.rows.length!==1||target.rows[0].id!==scope.userId)throw new Error();
  const user=target.rows[0];
  if(user.requestMatches!==true)return {report:result("blocked","request_timestamp_mismatch"),verificationIds:[],fingerprint:""};
  if(typeof user.emailCanonical!=="string"||!/^[!-~]+$/.test(user.emailCanonical)||user.emailCanonical!==user.emailCanonical.toLowerCase()||!user.emailCanonical.includes("@"))throw new Error();
  const bounded=async(sql:string,args:unknown[])=>{
   const {rows}=await db.query(sql,args);
   if(rows.length>MAX_ROWS)throw new Error();
   if(rows.some(row=>typeof row.id!=="string"||!row.id)||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error();
   return rows;
  };
  const accounts=await bounded(`/* erasure:preflight-accounts */ SELECT "id","userId","accountId","providerId",
   ("password" IS NOT NULL) AS "hasPassword" FROM product."Account" WHERE "userId"=$1 LIMIT 1001`,[scope.userId]);
  const sessions=await bounded('/* erasure:preflight-sessions */ SELECT "id","userId" FROM product."Session" WHERE "userId"=$1 LIMIT 1001',[scope.userId]);
  const issues=await bounded(`/* erasure:preflight-issuances */ SELECT "id","userId","emailCanonical","verificationId","purpose"
   FROM product."EmailVerificationIssuance" WHERE "userId"=$1 LIMIT 1001`,[scope.userId]);
  const issueIds=issues.map(row=>row.id),linkedIds=issues.filter(row=>row.verificationId!==null).map(row=>row.verificationId);
  const jobs=await bounded(`/* erasure:preflight-outbox */ SELECT "id","issuanceId","status","templateVersion"
   FROM product."EmailOutbox" WHERE "issuanceId"=ANY($1::text[]) LIMIT 1001`,[issueIds]);
  const terms=await bounded(`/* erasure:preflight-terms */ SELECT a."id",a."userId",a."termsVersionId",t."id" AS "versionId"
   FROM product."TermsAcceptance" a JOIN product."TermsVersion" t ON t."id"=a."termsVersionId" WHERE a."userId"=$1 LIMIT 1001`,[scope.userId]);
  const identifiers=["email-verification-otp-"+user.emailCanonical,"forget-password-otp-"+user.emailCanonical];
  // Broad-looking matches are review blockers ONLY; they never authorize deletion.
  const challenges=await bounded(`/* erasure:preflight-challenges */ SELECT "id","identifier" FROM product."Verification"
   WHERE "id"=ANY($1::text[]) OR "identifier"=ANY($2::text[]) OR strpos("identifier",$3)>0 OR strpos("identifier",$4)>0 LIMIT 1001`,[linkedIds,identifiers,user.emailCanonical,scope.userId]);
  const cross=await db.query(`/* erasure:preflight-cross-owner */ SELECT EXISTS(SELECT 1 FROM product."EmailVerificationIssuance"
   WHERE "userId"<>$1 AND ("verificationId"=ANY($2::text[]) OR "emailCanonical"=$3)) AS invalid`,[scope.userId,challenges.map(row=>row.id),user.emailCanonical]);
  if(cross.rows.length!==1||typeof cross.rows[0].invalid!=="boolean")throw new Error();
  const counts={User:1,Account:accounts.length,Session:sessions.length,Verification:challenges.length,TermsVersion:new Set(terms.map(row=>row.versionId)).size,
   TermsAcceptance:terms.length,EmailOutbox:jobs.length,EmailVerificationIssuance:issues.length};
  const ownershipInvalid=accounts.some(row=>row.userId!==scope.userId)||sessions.some(row=>row.userId!==scope.userId)||
   issues.some(row=>row.userId!==scope.userId||row.emailCanonical!==user.emailCanonical||!["email-verification","password-reset"].includes(row.purpose))||
   terms.some(row=>row.userId!==scope.userId||row.versionId!==row.termsVersionId)||
   challenges.some(row=>!identifiers.includes(row.identifier))||linkedIds.some(id=>!challenges.some(row=>row.id===id))||cross.rows[0].invalid;
  const outboxInvalid=jobs.some(row=>{
   const issue=issues.find(issue=>issue.id===row.issuanceId);
   return !issue||!["pending","sent","cancelled"].includes(row.status)||
    !(issue.purpose==="password-reset"?row.templateVersion===RESET_TEMPLATE:
     [VERIFICATION_EMAIL_TEMPLATE,DEVELOPMENT_VERIFICATION_TEMPLATE].includes(row.templateVersion));
  });
  const pendingEmailCount=jobs.filter(row=>row.status==="pending").length;
  const blocker=ownershipInvalid||outboxInvalid?"relationship_or_challenge_attribution":
   user.hasImage!==false?"external_image_review":user.isAdministrator!==false?"administrator_review":user.emailVerified!==true?"account_eligibility":
   accounts.length!==1||accounts[0].accountId!==scope.userId||accounts[0].providerId!=="credential"||accounts[0].hasPassword!==true?"credential_eligibility":
   terms.length?"acceptance_retention_review":undefined;
  let outcome:ErasureTestDryRun;
  if(blocker)outcome=result("blocked",blocker);
  else if(grace.status==="not_eligible")outcome=result("grace_period",grace.reason);
  else{outcome=result("eligible","scoped_database_dry_run_only");outcome.wouldAffect={...counts,TermsVersion:0,AuthRateBucket:0};}

  const verificationIds=challenges.map(row=>row.id).sort();
  const fingerprint=createHash("sha256").update(JSON.stringify([user.emailCanonical,counts,
   ...[accounts,sessions,issues,jobs,terms,challenges].map(rows=>rows.map(row=>row.id).sort())])).digest("hex");
  return {report:{...outcome,relatedCounts:counts,pendingEmailCount},verificationIds,fingerprint};
}
async function runTestAccountErasure(db:ErasureDb,input:unknown,mode:"dry-run",access?:"migrator"|"cleanup"):Promise<ErasureTestDryRun>;
async function runTestAccountErasure(db:ErasureDb,input:unknown,mode:"execute",access?:"migrator"|"cleanup"):Promise<ErasureTestExecution>;
async function runTestAccountErasure(db:ErasureDb,input:unknown,mode:"dry-run"|"execute",access:"migrator"|"cleanup"="migrator"):Promise<ErasureTestDryRun|ErasureTestExecution>{
 let scope:ErasureTestAccountApproval;
 try{scope=validateErasureTestAccountApproval(input);}catch{
  return mode==="dry-run"?testResult("failed","authorization_preflight_or_inspection"):executionResult("blocked","exact_owner_approval_required");
 }
 let started=false,commitAttempted=false;
 try{
  await db.query("BEGIN");started=true;
  await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='10s'");
  // Before target inspection: exact live identity, five reviewed migrations, tables and FKs.
  await assertErasureDatabase(db,access);
  if(access==="cleanup")await assertCleanupPrivileges(db);
  else{const permissions=await db.query(`/* erasure:preflight-permissions */ SELECT
   has_schema_privilege(current_user,'product','USAGE') AND
   has_table_privilege(current_user,'product._prisma_migrations','SELECT') AND
   current_setting('transaction_read_only')='off' AND
   bool_and(has_table_privilege(current_user,format('%I.%I','product',t),'SELECT') AND
    has_table_privilege(current_user,format('%I.%I','product',t),'UPDATE') AND
    has_table_privilege(current_user,format('%I.%I','product',t),'DELETE')) AS allowed
   FROM unnest($1::text[]) AS tables(t)`,[[...ERASURE_TABLES]]);
  if(permissions.rows.length!==1||permissions.rows[0].allowed!==true)throw new Error();}
  const finish=async(value:ErasureTestDryRun|ErasureTestExecution)=>{await db.query("ROLLBACK");started=false;return value;};
  // Same order as the historical proof: worker exclusion, stable table set, User.
  const lock=await db.query("/* erasure:preflight-lock */ SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked",[...OUTBOX_LOCK]);
  if(lock.rows.length!==1||typeof lock.rows[0].locked!=="boolean")throw new Error();
  if(!lock.rows[0].locked)return await finish(mode==="dry-run"?testResult("blocked","worker_or_erasure_busy"):executionResult("blocked","worker_or_erasure_busy"));
  if(access==="migrator")await lockErasureProofTables(db);
  else{
   // DELETE privileges suffice for these strong table locks. Never grant writes
   // to shared Terms/rate/history just to lock them. User FOR UPDATE below blocks
   // new acceptance FKs; six-table exclusion also freezes unowned OTP attribution.
   await db.query('/* erasure:cleanup-lock */ LOCK TABLE '+CLEANUP_DELETE_TABLES.map(t=>'product."'+t+'"').join(',')+' IN SHARE ROW EXCLUSIVE MODE');
   // Ordinary SELECTs retain ACCESS SHARE locks on inspected shared tables.
  }

  const inspection=await inspectLockedTestAccount(db,scope);
  if(mode==="dry-run")return await finish(inspection.report);
  if(inspection.report.status==="missing"){
   // No User means no timestamp can be verified. Report a non-destructive noop,
   // never proof of prior successful erasure or complete email-orphan attribution.
   const residual=await db.query(`/* erasure:execute-missing */ SELECT
    EXISTS(SELECT 1 FROM product."Account" WHERE "userId"=$1) OR
    EXISTS(SELECT 1 FROM product."Session" WHERE "userId"=$1) OR
    EXISTS(SELECT 1 FROM product."TermsAcceptance" WHERE "userId"=$1) OR
    EXISTS(SELECT 1 FROM product."EmailVerificationIssuance" WHERE "userId"=$1) OR
    EXISTS(SELECT 1 FROM product."Verification" WHERE strpos("identifier",$1)>0) AS found`,[scope.userId]);
   if(residual.rows.length!==1||typeof residual.rows[0].found!=="boolean")throw new Error();
   return await finish(executionResult(residual.rows[0].found?"blocked":"noop",residual.rows[0].found?"residual_attribution_review":"target_absent_no_changes_not_proof_of_prior_erasure"));
  }
  if(inspection.report.status!=="eligible")return await finish(executionResult("blocked",inspection.report.reason));
  // Recheck live FK/history and the exact same relationship/count/retention rules
  // immediately before the shared DELETEs, under unchanged worker/table/User locks.
  await assertErasureDatabase(db,access);
  const confirmed=await inspectLockedTestAccount(db,scope);
  if(confirmed.report.status!=="eligible"||confirmed.fingerprint!==inspection.fingerprint||!confirmed.report.wouldAffect)
   return await finish(executionResult("blocked","predelete_recheck_changed"));
  const counts=await eraseAuthenticationRows(db,scope.userId,scope.expectedDeletionRequestedAt,confirmed.verificationIds,confirmed.report.wouldAffect,access==="cleanup"?"restricted-cleanup":"migrator");
  commitAttempted=true;await db.query("COMMIT");started=false;
  return executionResult("erased","exact_test_account_committed",counts);
 }catch{
  let rollback=true;if(started)try{await db.query("ROLLBACK");}catch{rollback=false;}
  if(mode==="dry-run")return testResult("failed",rollback?"authorization_preflight_or_inspection":"rollback_unconfirmed");
  return executionResult(commitAttempted||!rollback?"unconfirmed":"failed_rolled_back",commitAttempted||!rollback?"commit_or_rollback_unconfirmed":"transaction_rolled_back",commitAttempted||!rollback?null:zeros());
 }
}
export function runTestAccountErasureDryRun(db:ErasureDb,input:unknown):Promise<ErasureTestDryRun>{
 return runTestAccountErasure(db,input,"dry-run");
}
export async function runTestAccountErasureExecute(db:ErasureDb,input:unknown,executionConfirmed:unknown):Promise<ErasureTestExecution>{
 if(executionConfirmed!==true||process.env.NODE_ENV==="production")return executionResult("blocked","separate_execution_confirmation_required");
 return runTestAccountErasure(db,input,"execute");
}

// Separate non-owning entry; historical proof/default APIs remain migrator-only.
export async function runCleanupTestAccountErasure(db:ErasureDb,input:unknown,mode:"dry-run"|"execute",ownerConfirmed:unknown):Promise<ErasureTestDryRun|ErasureTestExecution>{
 if(process.env.NODE_ENV!=="test"||ownerConfirmed!==true||!["dry-run","execute"].includes(mode))
  return mode==="dry-run"?testResult("failed","cleanup_authorization_required"):executionResult("blocked","cleanup_authorization_required");
 return mode==="dry-run"?runTestAccountErasure(db,input,"dry-run","cleanup"):runTestAccountErasure(db,input,"execute","cleanup");
}
