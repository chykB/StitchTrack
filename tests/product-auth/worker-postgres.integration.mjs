// OWNER ONLY. Import is inert. No worker, SMTP, dotenv or key loading.
import {pathToFileURL} from "node:url";
import {productDatabaseConfig} from "../../prisma/product/targets.ts";
export function authorizeWorkerPostgres(args,env) {
  if(args.length!==2 || args[0]!=="--owner-test" || !["--before-grant","--after-grant"].includes(args[1]) ||
    env.NODE_ENV!=="test" || env.PRODUCT_DATABASE_MODE!=="test" || env.PRODUCT_WORKER_PG_TEST_CONFIRMED!=="true" ||
    env.PRODUCT_EMAIL_WORKER_ENABLED==="true" || env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE) {
    throw new Error("Explicit isolated product-test verification required.");
  }
  return {...productDatabaseConfig(env),phase:args[1]==="--before-grant"?"before":"after"};
}
async function run(target) {
  const {Client}=await import("pg");
  const {randomUUID}=await import("node:crypto");
  const {default:assert}=await import("node:assert/strict");
  await import("../../scripts/register-server-only.mjs");
  const {OUTBOX_LOCK,OUTBOX_APPROVED_TERMS_SQL,OUTBOX_RESERVE_SQL}=await import("../../lib/product-auth/outbox-worker.server.ts");
  const marker="st-worker-proof-"+randomUUID(),clients=[];
  assert.ok(Buffer.byteLength(marker+"-loss")<=63,"Backend marker must not be truncated");
  const watchdog=setTimeout(()=>{console.error("STOP: test deadline exceeded; inspect state. Open test transactions roll back on disconnect.");process.exit(1);},60_000);
  const connect=async suffix=>{
    const client=new Client({connectionString:target.url,application_name:marker+suffix,connectionTimeoutMillis:5000,query_timeout:5000,
      options:"-c search_path=pg_catalog -c statement_timeout=5000 -c lock_timeout=1000"});
    const record={client,ended:false,errors:[]};clients.push(record);
    record.endPromise=new Promise(resolve=>client.on("end",()=>{record.ended=true;resolve();}));
    client.on("error",error=>record.errors.push(error.code)); // No raw diagnostic is printed.
    await client.connect();
    const rows=(await client.query(`SELECT current_database() AS database,current_user AS role,to_regnamespace('product')::text AS namespace,
      pg_backend_pid() AS pid,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user`)).rows;
    assert.equal(rows.length,1);const identity=rows[0];
    assert.equal(identity.database,"stitchtrack_product_test");assert.equal(identity.role,"stitchtrack_product_test_app");assert.equal(identity.namespace,"product");
    for(const field of ["rolsuper","rolcreatedb","rolcreaterole","rolbypassrls"])assert.equal(identity[field],false);
    record.pid=identity.pid;record.name=marker+suffix;return record;
  };
  const lock=async record=>(await record.client.query("SELECT pg_try_advisory_lock($1::int,$2::int) AS locked",[...OUTBOX_LOCK])).rows[0].locked;
  const unlock=async record=>(await record.client.query("SELECT pg_advisory_unlock($1::int,$2::int) AS unlocked",[...OUTBOX_LOCK])).rows[0].unlocked;
  const inRollback=async(client,callback)=>{
    await client.query("BEGIN");
    try{return await callback();}finally{await client.query("ROLLBACK");}
  };
  const denied=async(client,label,sql,values=[])=>{
    await client.query("SAVEPOINT permission_probe");let code;
    try{await client.query(sql,values);}catch(error){code=error.code;}
    finally{await client.query("ROLLBACK TO SAVEPOINT permission_probe");await client.query("RELEASE SAVEPOINT permission_probe");}
    assert.equal(code,"42501",label+" must fail specifically for privilege denial");
    console.log("PASS denied "+label+" (42501)");
  };
  const snapshot=async client=>{
    const tables=["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailVerificationIssuance","EmailOutbox"];
    const counts={};for(const table of tables)counts[table]=(await client.query(`SELECT count(*)::int AS count FROM "product"."${table}"`)).rows[0].count;
    const metadata=(await client.query(`SELECT "id","status","attemptCount","availableAt","updatedAt","sentAt" FROM "product"."EmailOutbox" ORDER BY "id"`)).rows;
    return {counts,metadata}; // Metadata only; never read/password/OTP/decrypt or print rows.
  };
  try {
    console.log("Product-test worker PostgreSQL checks: "+target.phase+" grant; "+process.version+"; "+new Date().toISOString());
    let a=await connect("-a");const b=await connect("-b");assert.notEqual(a.pid,b.pid);
    const other=(await b.client.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname=current_database() AND usename=current_user AND application_name NOT LIKE $1`,[marker+"%"])).rows[0].count;
    assert.equal(other,0,"Quiesce other product-test runtime sessions before testing");
    assert.equal(await lock(a),true,"Another worker owns the lock; stop rather than interfere");
    assert.equal(await lock(b),false);console.log("PASS independent PostgreSQL sessions exclude simultaneous advisory-lock ownership");
    assert.equal(await unlock(a),true);assert.equal(await lock(b),true);assert.equal(await unlock(b),true);
    console.log("PASS explicit unlock transfers advisory-lock availability");
    assert.equal(await lock(a),true);
    await a.client.end();await a.endPromise;
    assert.equal(await lock(b),true);assert.equal(await unlock(b),true);
    console.log("PASS intentional owning-session shutdown releases the advisory lock");
    a=await connect("-loss");assert.equal(await lock(a),true);
    // Terminate ONLY the precisely marked, same-role connection created above.
    // Never accept a PID/role/name from the command line or enumerate other jobs.
    const killed=await b.client.query(`SELECT pg_terminate_backend(pid,5000) AS terminated FROM pg_stat_activity
      WHERE pid=$1 AND pid<>pg_backend_pid() AND datname=current_database() AND usename=current_user
        AND application_name=$2 AND backend_type='client backend'`,[a.pid,a.name]);
    assert.equal(killed.rows.length,1);assert.equal(killed.rows[0].terminated,true);
    await a.endPromise;assert.equal(a.ended,true);assert.equal(await lock(b),true);assert.equal(await unlock(b),true);
    console.log("PASS deliberate loss of our own marked backend releases the session lock");
    a=await connect("-a2");assert.equal(await lock(a),true);
    const baseline=await snapshot(a.client);
    const ownership=(await a.client.query(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relkind='r' ORDER BY c.relname`)).rows;
    assert.equal(ownership.length,9);for(const row of ownership)assert.equal(row.owner,"stitchtrack_product_test_migrator");
    const locations=(await a.client.query(`SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations'`)).rows;
    assert.deepEqual(locations,[{nspname:"product"}]);
    assert.equal((await a.client.query("SELECT has_schema_privilege(current_user,'product','CREATE') AS allowed")).rows[0].allowed,false);
    for(const column of ["attemptCount","availableAt","sentAt"]) {
      const allowed=(await a.client.query(`SELECT has_column_privilege(current_user,'product."EmailOutbox"',$1,'UPDATE') AS allowed`,[column])).rows[0].allowed;
      assert.equal(allowed,target.phase==="after","Unexpected/partial worker grant state; do not repair automatically");
    }
    for(const column of ["id","issuanceId","templateVersion","payloadCiphertext","nonce","authTag","keyId","createdAt"]) {
      assert.equal((await a.client.query(`SELECT has_column_privilege(current_user,'product."EmailOutbox"',$1,'UPDATE') AS allowed`,[column])).rows[0].allowed,false);
    }
    await inRollback(a.client,async()=>{
      for(const [label,sql] of [
        ["canonical email update",`UPDATE "product"."User" SET "emailCanonical"="emailCanonical" WHERE false`],
        ["identity ID update",`UPDATE "product"."User" SET "id"="id" WHERE false`],
        ["credential replacement",`UPDATE "product"."Account" SET "password"="password" WHERE false`],
        ["Terms version update",`UPDATE "product"."TermsVersion" SET "version"="version" WHERE false`],
        ["Terms acceptance deletion",`DELETE FROM "product"."TermsAcceptance" WHERE false`],
        ["session creation",`INSERT INTO "product"."Session" ("id","token","userId","expiresAt","updatedAt") SELECT 'synthetic-permission-probe','synthetic-probe','synthetic-user',CURRENT_TIMESTAMP+INTERVAL '1 hour',CURRENT_TIMESTAMP WHERE false`],
        ["migration history read",`SELECT migration_name FROM "product"._prisma_migrations LIMIT 0`],
        ["migration history update",`UPDATE "product"._prisma_migrations SET migration_name=migration_name WHERE false`],
      ])await denied(a.client,label,sql);
      if(target.phase==="before")await denied(a.client,"outbox attempt reservation",OUTBOX_RESERVE_SQL,["synthetic-no-row",0,new Date(),new Date(),new Date()]);
    });
    const fixtureWhere=`EXISTS(SELECT 1 FROM "product"."TermsAcceptance" f JOIN "product"."TermsVersion" ft ON ft."id"=f."termsVersionId"
      WHERE f."userId"=i."userId" AND f."context"='synthetic-test' AND ft."isTestFixture")`;
    const fixtureFrom=`FROM "product"."EmailOutbox" j JOIN "product"."EmailVerificationIssuance" i ON i."id"=j."issuanceId"`;
    const exclusion=(await a.client.query(`SELECT count(*)::int AS fixtures,count(*) FILTER(WHERE ${OUTBOX_APPROVED_TERMS_SQL})::int AS allowed
      ${fixtureFrom} WHERE ${fixtureWhere}`)).rows[0];
    assert.ok(exclusion.fixtures>0,"No historical synthetic fixture jobs found; stop for separate fixture authorization");assert.equal(exclusion.allowed,0);
    console.log("PASS existing synthetic Terms-fixture jobs fail the exact production Terms eligibility predicate; no worker called");
    if(target.phase==="after") {
      const fixtures=(await a.client.query(`SELECT j."id",j."attemptCount",j."availableAt" ${fixtureFrom}
        WHERE j."status"='pending' AND j."attemptCount"<3 AND ${fixtureWhere} ORDER BY j."id" LIMIT 1`)).rows;
      assert.equal(fixtures.length,1,"A pending synthetic metadata fixture is required; no seeding performed");
      const fixture=fixtures[0],time=new Date(),until=new Date(Math.max(+time,+fixture.availableAt)+60_000);
      const values=[fixture.id,fixture.attemptCount,fixture.availableAt,until,time];
      await inRollback(a.client,async()=>{
        const first=await a.client.query(OUTBOX_RESERVE_SQL,values);assert.equal(first.rowCount,1);
        await inRollback(b.client,async()=>{
          await b.client.query("SET LOCAL lock_timeout='250ms'");
          let code;try{await b.client.query(OUTBOX_RESERVE_SQL,values);}catch(error){code=error.code;}
          assert.equal(code,"55P03","Competing reservation must be blocked by the real row lock");
        });
        assert.equal((await a.client.query(OUTBOX_RESERVE_SQL,values)).rowCount,0,"Stale reservation token must not update twice");
        // Require all three added columns, still rollback-only; no sent status.
        assert.equal((await a.client.query(`UPDATE "product"."EmailOutbox" SET "sentAt"=NULL WHERE "id"=$1`,[fixture.id])).rowCount,1);
      });
      console.log("PASS real competing row-lock refusal (55P03), stale-token zero rows, and rollback of reservation metadata");
      console.log("LIMIT: no committed winner/loser CAS test or eligible dispatch was performed");
    } else console.log("PENDING: reservation contention requires the separately reviewed additive worker grant");
    assert.deepEqual(await snapshot(a.client),baseline,"Post-test application counts/outbox metadata must match baseline");
    console.log("PASS application counts/outbox metadata unchanged after explicit rollbacks");
  } finally {
    const closed=await Promise.allSettled(clients.map(record=>record.ended?Promise.resolve():record.client.end()));
    clearTimeout(watchdog);
    if(closed.some(result=>result.status==="rejected") || clients.some(record=>!record.ended))throw new Error("Session cleanup incomplete; inspect before continuing.");
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{await run(authorizeWorkerPostgres(process.argv.slice(2),process.env));console.log("Product-test verification completed; no worker/SMTP started. Connection cleanup completed.");}
  catch{console.error("STOP: PostgreSQL verification did not complete. Preserve output; inspect target/privileges/cleanup privately. No retry, reset or repair performed.");process.exitCode=1;}
}
