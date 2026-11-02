import "server-only";
import {createHash} from "node:crypto";
import type {Client} from "pg";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {OUTBOX_LOCK} from "./outbox-worker.server.ts";
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
export async function assertErasureDatabase(db:ErasureDb){
 assertProductMigrationFiles();
 const {rows:[identity],rowCount}=await db.query(`/* erasure:identity */ SELECT current_database() AS database,current_user AS role,session_user AS login,
  current_setting('port') AS port,current_setting('TimeZone') AS timezone,NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe,
  EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user) AS owns
  FROM pg_roles WHERE rolname=current_user`);
 if(rowCount!==1||identity.database!=="stitchtrack_product_test"||identity.role!=="stitchtrack_product_test_migrator"||identity.login!==identity.role||identity.port!=="5432"||identity.timezone!=="UTC"||!identity.safe||!identity.owns)throw new Error();
 const tables=(await db.query(`/* erasure:tables */ SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='product' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname`)).rows;
 if(JSON.stringify(tables.map(r=>r.name).sort())!==JSON.stringify([...ERASURE_TABLES,"_prisma_migrations"].sort())||tables.some(r=>r.owner!==identity.role||r.kind!=="r"))throw new Error();
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
   const statements:[keyof ErasureCounts,string,unknown[]][]=[
    ["EmailOutbox",'DELETE FROM product."EmailOutbox" WHERE "issuanceId" IN(SELECT "id" FROM product."EmailVerificationIssuance" WHERE "userId"=$1)',[plan.target]],
    ["TermsAcceptance",'DELETE FROM product."TermsAcceptance" WHERE "userId"=$1',[plan.target]],
    ["Session",'DELETE FROM product."Session" WHERE "userId"=$1',[plan.target]],
    ["Account",'DELETE FROM product."Account" WHERE "userId"=$1',[plan.target]],
    ["EmailVerificationIssuance",'DELETE FROM product."EmailVerificationIssuance" WHERE "userId"=$1',[plan.target]],
    ["Verification",'DELETE FROM product."Verification" WHERE "id"=ANY($1::text[])',[verificationIds]],
    ["User",'DELETE FROM product."User" WHERE "id"=$1 AND "deletionRequestedAt"=$2',[plan.target,user.deletionRequestedAt]],
   ];
   for(const [table,sql,args]of statements){const result=await db.query("/* erasure:delete:"+table+" */ "+sql,args);if(result.rowCount!==wouldErase[table])throw new Error();counts[table]=result.rowCount!;}
  }
  if(expired.length){const result=await db.query('/* erasure:delete:AuthRateBucket */ DELETE FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',[expired]);if(result.rowCount!==expired.length)throw new Error();counts.AuthRateBucket=result.rowCount!;}
  commitAttempted=true;await db.query("COMMIT");return {outcome:Object.values(counts).some(Boolean)?"erased":"noop",counts,metrics};
 }catch{
  let rollback=true;try{await db.query("ROLLBACK");}catch{rollback=false;}
  return {outcome:commitAttempted||!rollback?"unconfirmed":"failed_rolled_back",counts:commitAttempted||!rollback?null:zeros()};
 }
}
