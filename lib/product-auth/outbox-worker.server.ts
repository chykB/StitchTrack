import "server-only";
import type {QueryResult, QueryResultRow} from "pg";
import type {EmailOutbox} from "../../prisma/product/generated/client.ts";
import {productDatabaseConfig, PRODUCT_TARGETS} from "../../prisma/product/targets.ts";
import {deliveryEligible} from "./registration.server.ts";
import {ProductAuthError, type createSecretTools} from "./secrets.server.ts";
import {VERIFICATION_EMAIL_TEMPLATE} from "./verification-email.server.ts";

export const OUTBOX_ATTEMPT_LIMIT = 3;
export const OUTBOX_RESERVATION_MS = 60_000;
export const OUTBOX_LOCK = [1398031176, 1] as const; // StitchTrack verification worker, per database.
export type WorkerSession = {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  alive(): boolean;
  end(): Promise<void>;
};
type Joined = EmailOutbox & {
  userId: string; userEmail: string; emailVerified: boolean; issueEmail: string;
  issueVerificationId: string | null; issueExpiresAt: Date; failedAttempts: number;
  consumedAt: Date | null; supersededAt: Date | null; verifier: Uint8Array; verifierKeyId: string;
  verificationRecordId: string | null; verificationExpiresAt: Date | null; approvedTerms: boolean;
};
type Dependencies = {
  connect(): Promise<WorkerSession>;
  secrets: Pick<ReturnType<typeof createSecretTools>, "open" | "matches">;
  mailer: {sendVerification(payload: unknown, expiry: Date): Promise<{status: "accepted"}>};
  clock?: () => Date;
};
export type WorkerOutcome = "idle" | "busy" | "cancelled" | "sent" | "rejected_retry" | "rejected_stop" | "unconfirmed_stop" | "accepted_unrecorded";
export function emailWorkerConfig(env: Readonly<Record<string,string|undefined>>) {
  if (env.PRODUCT_EMAIL_WORKER_ENABLED !== "true" || env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE) throw new ProductAuthError("email_worker_disabled");
  return productDatabaseConfig(env);
}
// No synthetic-test acceptance can qualify, including historical integration rows.
export const OUTBOX_APPROVED_TERMS_SQL = `EXISTS (SELECT 1 FROM "product"."TermsAcceptance" a JOIN "product"."TermsVersion" t ON t."id"=a."termsVersionId"
  WHERE a."userId"=i."userId" AND a."context"='tailor-registration' AND NOT t."isTestFixture"
    AND t."approvedAt" <= a."acceptedAt" AND t."effectiveAt" <= a."acceptedAt" AND a."acceptedAt" <= j."createdAt")`;
const joins = `FROM "product"."EmailOutbox" j JOIN "product"."EmailVerificationIssuance" i ON i."id"=j."issuanceId"
  JOIN "product"."User" u ON u."id"=i."userId"`;
const OUTBOX_NEXT_SQL = `/* outbox:next */ SELECT j."id" ${joins}
  WHERE j."status"='pending' AND j."availableAt" <= $1 AND j."templateVersion"=$2 AND ${OUTBOX_APPROVED_TERMS_SQL}
  ORDER BY j."availableAt", j."id" LIMIT 1`;
export const OUTBOX_RESERVE_SQL = `/* outbox:reserve */ UPDATE "product"."EmailOutbox"
  SET "attemptCount"="attemptCount"+1,"availableAt"=$4,"updatedAt"=$5
  WHERE "id"=$1 AND "status"='pending' AND "attemptCount"=$2 AND "availableAt"=$3 RETURNING "attemptCount"`;
const loadSql = `/* outbox:load */ SELECT j.*, i."userId", u."emailCanonical" AS "userEmail", u."emailVerified",
  i."emailCanonical" AS "issueEmail", i."verificationId" AS "issueVerificationId", i."expiresAt" AS "issueExpiresAt",
  i."failedAttempts", i."consumedAt", i."supersededAt", i."verifier", i."verifierKeyId",
  v."id" AS "verificationRecordId", v."expiresAt" AS "verificationExpiresAt", ${OUTBOX_APPROVED_TERMS_SQL} AS "approvedTerms"
  ${joins} LEFT JOIN "product"."Verification" v ON v."id"=i."verificationId" WHERE j."id"=$1`;

// One pass, one job, one dedicated session. The owner CLI supplies a process
// watchdog; library callers must not detach a timed-out send and start a new pass.
export function createOutboxWorker(env: Readonly<Record<string,string|undefined>>, deps: Dependencies) {
  const target = emailWorkerConfig(env), clock = deps.clock ?? (() => new Date());
  const now = () => {const value=clock();if(!Number.isFinite(value.getTime()))throw new ProductAuthError();return value;};
  return {
    async runOnce(): Promise<WorkerOutcome> {
      let db: WorkerSession | undefined;
      try {
        db = await deps.connect();
        const identity = await db.query(`SELECT current_database() AS database, current_user AS role, to_regnamespace('product')::text AS namespace,
          r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user`);
        const row=identity.rows[0], expected=PRODUCT_TARGETS[target.mode];
        if(identity.rows.length!==1 || row.database!==expected.database || row.role!==expected.role || row.namespace!=="product" ||
          row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolbypassrls)throw new ProductAuthError();
        await db.query("SET search_path=pg_catalog; SET statement_timeout='5s'; SET lock_timeout='2s'");
        const lock=await db.query("SELECT pg_try_advisory_lock($1::int,$2::int) AS locked",[...OUTBOX_LOCK]);
        if(lock.rows[0]?.locked!==true)return "busy";
        const time=now();
        const candidates=await db.query(OUTBOX_NEXT_SQL,[time,VERIFICATION_EMAIL_TEMPLATE]);
        if(!candidates.rows.length)return "idle";
        const id=candidates.rows[0].id as string;
        const load=async()=> (await db!.query<Joined>(loadSql,[id])).rows[0];
        const eligible=(state: Joined | undefined, time: Date, availability?: Date): state is Joined => !!state && state.approvedTerms &&
          state.templateVersion===VERIFICATION_EMAIL_TEMPLATE && state.verificationRecordId===state.issueVerificationId &&
          !!state.verificationRecordId && !!state.verificationExpiresAt && state.verificationExpiresAt>time &&
          deliveryEligible({...state,availableAt:availability??state.availableAt},
            {id:state.issuanceId,userId:state.userId,emailCanonical:state.issueEmail,verificationId:state.issueVerificationId,
              consumedAt:state.consumedAt,supersededAt:state.supersededAt,failedAttempts:state.failedAttempts,expiresAt:state.issueExpiresAt},
            {id:state.userId,email:state.userEmail,emailVerified:state.emailVerified},time);
        const before=await load();
        if(!before)return "idle";
        const cancel=async()=>{await db!.query(`/* outbox:cancel */ UPDATE "product"."EmailOutbox" SET "status"='cancelled',"updatedAt"=$2 WHERE "id"=$1 AND "status"='pending'`,[id,now()]);};
        if(!eligible(before,now()) || before.attemptCount>=OUTBOX_ATTEMPT_LIMIT) {await cancel();return "cancelled";}
        const started=now(), until=new Date(started.getTime()+OUTBOX_RESERVATION_MS);
        // Autocommit reservation, not an open transaction across SMTP. A crashed
        // attempt stays spent; next eligibility is delayed, never reset to zero.
        const claim=await db.query(OUTBOX_RESERVE_SQL,[id,before.attemptCount,before.availableAt,until,started]);
        if(claim.rows.length!==1)return "idle";
        const attempt=claim.rows[0].attemptCount as number;
        const owned=(state: Joined | undefined): state is Joined =>!!state && state.attemptCount===attempt && state.availableAt.getTime()===until.getTime();
        let fresh=await load();
        if(!owned(fresh))return "idle";
        if(!eligible(fresh,now(),started)){await cancel();return "cancelled";}
        const payload=deps.secrets.open(fresh,fresh);
        if(payload.email!==fresh.userEmail || payload.email!==fresh.issueEmail ||
          !deps.secrets.matches(fresh.verifier,fresh.issuanceId,payload.email,payload.otp,fresh.verifierKeyId))throw new ProductAuthError();
        // Read again after decryption, immediately before handoff. A final SMTP
        // race cannot recall an already in-flight email; verification stays gated.
        fresh=await load();
        if(!db.alive())throw new ProductAuthError();
        if(!owned(fresh))return "idle";
        if(!eligible(fresh,now(),started)){await cancel();return "cancelled";}
        if(payload.email!==fresh.userEmail || payload.email!==fresh.issueEmail ||
          !deps.secrets.matches(fresh.verifier,fresh.issuanceId,payload.email,payload.otp,fresh.verifierKeyId))throw new ProductAuthError();
        let outcome: "accepted" | "rejected" | "unconfirmed";
        try {const result=await deps.mailer.sendVerification(payload,fresh.issueExpiresAt);outcome=result?.status==="accepted"?"accepted":"unconfirmed";}
        catch(error){outcome=error instanceof ProductAuthError && error.code==="email_delivery_rejected"?"rejected":"unconfirmed";}
        if(!db.alive())throw new ProductAuthError();
        const finished=now();
        if(outcome==="accepted") {
          const result=await db.query(`/* outbox:sent */ UPDATE "product"."EmailOutbox"
            SET "status"='sent',"sentAt"=$4,"availableAt"=$4,"updatedAt"=$4
            WHERE "id"=$1 AND "status"='pending' AND "attemptCount"=$2 AND "availableAt"=$3`,[id,attempt,until,finished]);
          return result.rowCount===1?"sent":"accepted_unrecorded";
        }
        const retryAt=new Date(finished.getTime()+15_000*2**(attempt-1));
        const retry=outcome==="rejected" && attempt<OUTBOX_ATTEMPT_LIMIT && retryAt<fresh.issueExpiresAt && retryAt<fresh.verificationExpiresAt!;
        const finalized=await db.query(`/* outbox:finish */ UPDATE "product"."EmailOutbox" SET "status"=$4,"availableAt"=$5,"updatedAt"=$6
          WHERE "id"=$1 AND "status"='pending' AND "attemptCount"=$2 AND "availableAt"=$3`,
          [id,attempt,until,retry?"pending":"cancelled",retry?retryAt:until,finished]);
        if(finalized.rowCount!==1)return "cancelled";
        return retry?"rejected_retry":outcome==="rejected"?"rejected_stop":"unconfirmed_stop";
      } catch {throw new ProductAuthError("email_worker_unavailable");}
      finally {if(db)try{await db.end();}catch{throw new ProductAuthError("email_worker_unavailable");}}
    },
  };
}
