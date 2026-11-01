// OWNER ONLY. Import opens no connection/socket/file and creates no fixtures.
import {pathToFileURL} from "node:url";
import {randomUUID, randomBytes} from "node:crypto";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig, productMigrationConfig} from "../../prisma/product/targets.ts";
import {assertProductMigrationFiles, PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";

export const ACCOUNT_PROOF_LABELS = Object.freeze(["login-first", "lock-first", "simultaneous", "deletion", "rollback", "commit-failure", "unrelated", "unverified"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LOCK_NAME = "stitchtrack/account-access-proof";
export function accountProofFixtures(runId) {
  if (!UUID.test(runId)) throw new Error("Exact synthetic proof UUID required.");
  return Object.fromEntries(ACCOUNT_PROOF_LABELS.map(label => {
    const id = "al-proof-" + runId + "-" + label;
    return [label, Object.freeze({id, email: id + "@example.invalid", name: "Synthetic account-lock proof " + runId,
      credentialId: "credential-" + id, verified: label !== "unverified"})];
  }));
}
export function authorizeAccountProof(args, env) {
  if (process.platform !== "linux" || args.length !== 1 || args[0] !== "--owner-integration" || env.NODE_ENV !== "test" ||
      env.PRODUCT_DATABASE_MODE !== "test" || env.PRODUCT_ACCOUNT_ACCESS_PROOF_CONFIRMED !== "true" ||
      env.PRODUCT_EMAIL_WORKER_ENABLED === "true" || env.ENABLE_PRODUCT_SESSION_HTTP === "true" ||
      ["PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "DEBUG", "NODE_DEBUG", "RUST_LOG", "PRISMA_LOG_LEVEL", "NODE_OPTIONS"].some(k => env[k])) {
    throw new Error("Explicit isolated product-test account proof authorization required.");
  }
  return {runtime: productDatabaseConfig(env), migrator: productMigrationConfig(env)};
}
const mutationMethods = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
export function assertAccountProofMutation(model, method, args, fixture) {
  if (!mutationMethods.has(method)) return;
  const insert = model === "session" && method === "create" && args?.data?.userId === fixture.id && /^hmac-sha256:v1:[0-9a-f]{64}$/u.test(args.data.token);
  const revoke = model === "session" && method === "deleteMany" && args?.where?.userId === fixture.id && Object.keys(args.where).length === 1;
  if (!insert && !revoke) throw new Error("Unplanned fixture mutation refused.");
}
export async function closeAccountProofClients(clients) {
  const outcomes = await Promise.allSettled(clients.map(c => Promise.resolve().then(() => c.$disconnect())));
  if (outcomes.some(o => o.status === "rejected")) throw new Error("Account proof client shutdown unconfirmed.");
}
const watched = promise => {promise.catch(() => {}); return promise;};
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
async function bounded(promise, milliseconds = 1200) {
  let timer;
  try {return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error("Barrier deadline exceeded.")), milliseconds);})]);}
  finally {clearTimeout(timer);}
}
function pgConfig(target, name) {
  return {connectionString: target.url, application_name: name, ssl: false, connectionTimeoutMillis: 5000,
    query_timeout: 7000, statement_timeout: 5000, lock_timeout: 2500, idle_in_transaction_session_timeout: 12_000,
    keepAlive: true, keepAliveInitialDelayMillis: 1000};
}
async function assertIdentity(pg, target) {
  const {rows} = await pg.query(`SELECT current_database() AS db,current_user AS role,session_user AS session_role,
    current_setting('port') AS port,current_setting('server_version_num')::integer AS version,pg_backend_pid() AS pid,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`);
  if (rows.length !== 1 || rows[0].db !== target.database || rows[0].role !== target.user || rows[0].session_role !== target.user ||
      rows[0].port !== "5432" || rows[0].version < 160000 || rows[0].version >= 170000 || rows[0].safe !== true) throw new Error("Exact restricted PostgreSQL target required.");
  return rows[0].pid;
}
async function inspectPrerequisites(Client, targets) {
  const pg = new Client(pgConfig(targets.migrator, "stitchtrack-account-preflight")); pg.on("error", () => {});
  try {
    await pg.connect(); await pg.query("BEGIN READ ONLY"); await pg.query("SET LOCAL search_path=pg_catalog");
    await assertIdentity(pg, targets.migrator);
    const owners = (await pg.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relkind='r' AND pg_get_userbyid(c.relowner)=current_user`)).rows;
    if (owners.length !== 10 || !(await pg.query("SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user")).rowCount ||
        (await pg.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND n.nspname<>'product'")).rowCount) throw new Error();
    const history = (await pg.query("SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations")).rows;
    if (history.length !== 3 || new Set(history.map(r => r.migration_name)).size !== 3 || history.some(r => PRODUCT_MIGRATIONS[r.migration_name] !== r.checksum || !r.finished_at || r.rolled_back_at || r.logs !== null || r.applied_steps_count !== 1)) throw new Error();
    const fields = (await pg.query(`SELECT a.attname,a.attnotnull,a.atthasdef,a.atttypid='timestamptz'::regtype AND a.atttypmod=3 AS type_ok
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='product' AND c.relname='User' AND a.attname IN ('disabledAt','deletionRequestedAt') AND NOT a.attisdropped`)).rows;
    if (fields.length !== 2 || fields.some(f => f.attnotnull || f.atthasdef || !f.type_ok)) throw new Error();
    const tables = ["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailVerificationIssuance","EmailOutbox","AuthRateBucket"];
    for (const table of tables) if (!(await pg.query("SELECT has_table_privilege($1,$2,'SELECT') AS yes", [targets.runtime.user, 'product."' + table + '"'])).rows[0].yes) throw new Error();
    for (const table of ["User","Account"]) if (!(await pg.query("SELECT has_table_privilege($1,$2,'INSERT') AS yes", [targets.runtime.user, 'product."' + table + '"'])).rows[0].yes) throw new Error();
    if ((await pg.query(`SELECT has_table_privilege($1,'product."Session"','INSERT') OR has_any_column_privilege($1,'product."Session"','UPDATE') AS broad`, [targets.runtime.user])).rows[0].broad) throw new Error();
    for (const col of ["id","token","userId","expiresAt","ipAddress","userAgent","createdAt","updatedAt"]) {
      if (!(await pg.query(`SELECT has_column_privilege($1,'product."Session"',$2,'INSERT') AS yes`, [targets.runtime.user,col])).rows[0].yes) throw new Error();
    }
    for (const col of ["disabledAt","deletionRequestedAt","updatedAt"]) if (!(await pg.query("SELECT has_column_privilege($1,'product.\"User\"',$2,'UPDATE') AS yes", [targets.runtime.user,col])).rows[0].yes) throw new Error();
    const privileges = (await pg.query(`SELECT has_table_privilege($1,'product."Session"','DELETE') AS revoke,
      has_schema_privilege($1,'product','CREATE') AS ddl,has_table_privilege($1,'product."User"','UPDATE,DELETE,TRUNCATE') AS broad,
      has_column_privilege($1,'product."User"','emailCanonical','UPDATE') AS email,
      has_table_privilege($1,'product._prisma_migrations','SELECT,INSERT,UPDATE,DELETE') AS history,pg_has_role($1,current_user,'MEMBER') AS elevated`, [targets.runtime.user])).rows[0];
    if (!privileges.revoke || privileges.ddl || privileges.broad || privileges.email || privileges.history || privileges.elevated) throw new Error();
    for (const fn of ["pg_catalog.pg_terminate_backend(integer,bigint)","pg_catalog.pg_blocking_pids(integer)","pg_catalog.sha256(bytea)"]) {
      if (!(await pg.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS yes", [targets.runtime.user,fn])).rows[0].yes) throw new Error();
    }
    if ((await pg.query('SELECT count(*)::integer AS n FROM product."User"')).rows[0].n !== 10) throw new Error("Expected ten existing users; stop for review.");
    await pg.query("COMMIT");
  } catch {await pg.query("ROLLBACK").catch(() => {}); throw new Error("Read-only account proof preflight failed; no fixtures authorized.");}
  finally {await pg.end();}
}
async function run(targets) {
  assertProductMigrationFiles();
  const runId = randomUUID(), fixtures = accountProofFixtures(runId), all = Object.values(fixtures), ids = all.map(f => f.id);
  await import("../../scripts/register-server-only.mjs");
  const {default: assert} = await import("node:assert/strict");
  const {Client} = await import("pg");
  const {PrismaClient} = await import("../../prisma/product/generated/client.ts");
  const {PrismaPg} = await import("@prisma/adapter-pg");
  const {hashPassword} = await import("../../lib/auth/password.server.ts");
  const {createSessionService} = await import("../../lib/product-auth/session.server.ts");
  const {createAccountAccessService,readAccountAccess} = await import("../../lib/product-auth/account-access.server.ts");
  const {setTimeout: sleep} = await import("node:timers/promises");
  const name = "stitchtrack-account-proof-" + runId, clients = [], errors = [];
  const control = new Client(pgConfig(targets.runtime, name)); let controlAlive = true;
  control.on("error", () => {controlAlive = false;}); control.on("end", () => {controlAlive = false;});
  const fetcher = globalThis.fetch; globalThis.fetch = async () => {throw new Error("External requests forbidden.");};
  try {
    await control.connect(); const controlPid = await assertIdentity(control, targets.runtime);
    await control.query("SET search_path=pg_catalog"); await control.query("SET TIME ZONE 'UTC'");
    assert.equal((await control.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [LOCK_NAME])).rows[0].acquired,true);
    console.log("Synthetic account proof run_id=" + runId); // Lock held before ID publication; no persistent writes yet.
    console.log("Stage: read-only migration/permission preflight"); await inspectPrerequisites(Client, targets);
    console.log("PASS read-only migrator history/permission verification and connection close.");
    const connect = () => {
      const state = {expected: false, failed: false}; errors.push(state);
      const db = new PrismaClient({adapter: new PrismaPg({...pgConfig(targets.runtime,name),max:1,options:PRODUCT_PRISMA_CONNECTION_OPTIONS}, {schema:"product",
        onPoolError: () => {if (!state.expected) state.failed = true;}, onConnectionError: () => {if (!state.expected) state.failed = true;}}), log:[]});
      clients.push(db); return {db,state};
    };
    const a = connect(), b = connect();
    const pids = await Promise.all([a.db,b.db].map(async db => (await db.$queryRaw`SELECT pg_backend_pid() AS pid,current_database() AS db,current_user AS role`)[0]));
    assert.equal(new Set([controlPid,...pids.map(r => r.pid)]).size,3);
    for (const r of pids) {assert.equal(r.db,targets.runtime.database);assert.equal(r.role,targets.runtime.user);}
    const snapshot = async () => {
      const out = {};
      for (const table of ["User","Account","Session","Verification","TermsVersion","TermsAcceptance","EmailVerificationIssuance","EmailOutbox","AuthRateBucket"]) {
        const where = table === "User" ? ' WHERE t."id"<>ALL($1::text[])' : ["Account","Session"].includes(table) ? ' WHERE t."userId"<>ALL($1::text[])' : '';
        // Hash full rows inside PostgreSQL: no credentials, tokens, OTP state or
        // private payload columns are returned, logged or archived by the harness.
        out[table] = (await control.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM product."${table}" t${where} ORDER BY digest`,where ? [ids] : [])).rows.map(r=>r.digest);
      }
      return out;
    };
    const baseline = await snapshot(); assert.equal(baseline.User.length,10);
    assert.equal((await control.query('SELECT count(*)::integer AS n FROM product."User" WHERE id=ANY($1::text[])',[ids])).rows[0].n,0);
    const password = " Exact synthetic " + randomBytes(24).toString("base64url") + " e\u0301 ", encoded = await hashPassword(password);
    const config = {mode:"test",authSecret:randomBytes(48).toString("base64url"),sessionTokenKey:randomBytes(32),expiresInSeconds:600,renewal:"none"};
    console.log("Stage: eight fresh session-only fixture pairs");
    await a.db.$transaction(async tx => {
      for (const f of all) {
        assert.ok(controlAlive);
        await tx.user.create({data:{id:f.id,name:f.name,email:f.email,emailVerified:f.verified,image:null}});
        await tx.account.create({data:{id:f.credentialId,userId:f.id,accountId:f.id,providerId:"credential",password:encoded}});
      }
    });
    const cookie = result => new Headers({cookie:result.headers.getSetCookie().map(s=>s.split(";")[0]).join("; ")});
    const rejected = e => e?.code === "login_rejected" && !e.headers;
    const count = f => b.db.session.count({where:{userId:f.id}});
    function scoped(real, fixture, hooks = {}) {
      let active = false;
      const wrap = (db, transactional, context) => new Proxy(db,{get(target,prop) {
        if (prop === "$transaction") return undefined;
        if (prop === "$queryRawUnsafe" || prop === "$executeRawUnsafe") return () => {throw new Error("Unsafe SQL refused.");};
        if (prop === "$executeRaw") return (strings,...values) => {
          const sql=strings.join("").trim();
          if (!transactional || !controlAlive || values.length || !["SET LOCAL lock_timeout = '3s'","SET LOCAL statement_timeout = '5s'"].includes(sql)) throw new Error("Unplanned raw execution refused.");
          return target.$executeRaw(strings,...values);
        };
        if (prop === "$queryRaw") return async (strings,...values) => {
          const sql = strings.join("");
          if (!controlAlive) throw new Error("Proof control connection lost.");
          const metadata=sql.trimStart().startsWith("SELECT current_database()") && values.length===0;
          const userQuery=sql.includes('FROM "product"."User"') || sql.includes('UPDATE "product"."User"');
          if (!metadata && !userQuery) throw new Error("Unplanned raw query refused.");
          if (!transactional && active) throw new Error("Root query escaped account transaction.");
          if (sql.includes('"product"."User"') && (values.length !== 1 || ![fixture.id,fixture.email].includes(values[0]))) throw new Error("Historical target refused.");
          if ((sql.includes("FOR UPDATE") || sql.includes('UPDATE "product"."User"')) && !transactional) throw new Error("Account write/lock requires tx.");
          const rows = await target.$queryRaw(strings,...values);
          if (sql.includes("FOR UPDATE") && hooks.afterLock) await hooks.afterLock(context);
          return rows;
        };
        if (["user","account","session","verification","termsVersion","termsAcceptance","emailVerificationIssuance","emailOutbox","authRateBucket"].includes(prop)) {
          const delegate = target[prop];
          return new Proxy(delegate,{get(model,method) {const fn = model[method]; if (typeof fn !== "function") return fn;
            return async args => {
              if (!transactional && active) throw new Error("Root delegate escaped transaction.");
              if (mutationMethods.has(method)) {
                if (!controlAlive) throw new Error("Proof control connection lost.");
                if (!transactional) throw new Error("Unexpected nontransactional mutation.");
                assertAccountProofMutation(prop,method,args,fixture);
              }
              const result = await fn.call(model,args);
              if (prop === "session" && method === "deleteMany" && hooks.failAfterRevoke) {
                await hooks.revokeReached(target);
                await target.$queryRaw`SELECT 1 / 0`;
              }
              return result;
            };
          }});
        }
        const value = Reflect.get(target,prop); return typeof value === "function" ? value.bind(target) : value;
      }});
      const root = wrap(real,false);
      return new Proxy(root,{get(target,prop) {
        if (prop !== "$transaction") return Reflect.get(target,prop);
        return async (callback,options) => {active=true; try {return await real.$transaction(async tx => {
          const context = {pid:(await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid,tx}; hooks.started?.(context);
          const result = await callback(wrap(tx,true,context));
          if (hooks.beforeCommit) await hooks.beforeCommit(context,result);
          return result;
        },options);} finally {active=false;}};
      }});
    }
    const login = (db,f,hooks) => createSessionService(scoped(db,f,hooks),config);
    const lifecycle = (db,f,kind,hooks) => createAccountAccessService(scoped(db,f,hooks),{mode:"test",authorize:async(tx,req,state)=>{
      if (req.userId!==f.id || state.id!==f.id || req.kind!==kind) return false;
      const user=await tx.user.findUnique({where:{id:f.id}});
      return user?.name===f.name && user.email===f.email && await tx.account.count({where:{id:f.credentialId,userId:f.id,accountId:f.id,providerId:"credential"}})===1;
    }});
    const input = f => ({email:f.email,password});
    const request = (f,kind) => ({userId:f.id,kind});
    const waitForBlock = async (waiter,blocker) => {
      const deadline=performance.now()+1200;
      while(performance.now()<deadline) {
        if ((await control.query("SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) AS waiting",[blocker,waiter])).rows[0].waiting) return;
        await sleep(15);
      }
      throw new Error("Actual PostgreSQL blocking not observed.");
    };
    const assertHistorical = async () => {assert.ok(controlAlive && errors.every(s=>!s.failed)); assert.deepEqual(await snapshot(),baseline);};
    const unrelated = login(b.db,fixtures.unrelated), unrelatedResult=await unrelated.login(input(fixtures.unrelated));
    const fixtureSnapshot = async f => {
      const out={};
      for(const table of ["User","Account","Session"]) {
        const key=table==="User"?'id':'userId';
        out[table]=(await control.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM product."${table}" t WHERE "${key}"=$1 ORDER BY digest`,[f.id])).rows;
      }
      return out;
    };
    const unrelatedState=await fixtureSnapshot(fixtures.unrelated);
    await assert.rejects(login(a.db,fixtures.unverified).login(input(fixtures.unverified)),rejected);
    await assert.rejects(createAccountAccessService(scoped(b.db,fixtures.rollback),{mode:"test",authorize:async()=>false}).lock(request(fixtures.rollback,"disable")),e=>e.code==="account_lock_refused");
    console.log("PASS hard verification gating and explicit fixture-only lifecycle authorization.");
    console.log("Stage: login-first PostgreSQL lock ordering");
    const entered=deferred(),release=deferred(),second=deferred(),first=fixtures["login-first"];
    let firstPid; const service=login(a.db,first,{afterLock:async c=>{firstPid=c.pid;entered.resolve();await release.promise;}});
    const firstJob=watched(service.login(input(first))); const jobs=[firstJob]; let firstResult;
    try {
      await bounded(entered.promise);
      jobs.push(watched(lifecycle(b.db,first,"disable",{started:c=>second.resolve(c.pid)}).lock(request(first,"disable"))));
      await waitForBlock(await bounded(second.promise),firstPid); release.resolve();
      const results=await Promise.all(jobs);firstResult=results[0];
    } finally {release.resolve();await Promise.allSettled(jobs);}
    assert.equal(await count(first),0);assert.equal((await service.lookup(cookie(firstResult))).session,null);await assertHistorical();
    console.log("PASS login-first: actual blocked locker revoked the newly committed session.");
    console.log("Stage: lock-first PostgreSQL lock ordering");
    const locked=deferred(),unlock=deferred(),waiting=deferred(),f2=fixtures["lock-first"];let lockerPid;
    const f2service=login(a.db,f2),old=await f2service.login(input(f2));
    const lockJob=watched(lifecycle(b.db,f2,"disable",{afterLock:async c=>{lockerPid=c.pid;locked.resolve();await unlock.promise;}}).lock(request(f2,"disable")));
    const lockJobs=[lockJob];
    try {
      await bounded(locked.promise);
      const newLogin=login(a.db,f2,{started:c=>waiting.resolve(c.pid)}).login(input(f2));
      lockJobs.push(watched(assert.rejects(newLogin,rejected)));
      await waitForBlock(await bounded(waiting.promise),lockerPid);unlock.resolve();await Promise.all(lockJobs);
    } finally {unlock.resolve();await Promise.allSettled(lockJobs);}
    assert.equal(await count(f2),0);assert.equal((await f2service.lookup(cookie(old))).session,null);await assertHistorical();
    console.log("PASS lock-first: PostgreSQL-blocked login rejected after lock commit.");
    console.log("Stage: simultaneous login and locking");
    const race=fixtures.simultaneous,raceService=login(a.db,race),gate=deferred();
    const raceJobs=[gate.promise.then(()=>raceService.login(input(race))),gate.promise.then(()=>lifecycle(b.db,race,"disable").lock(request(race,"disable")))];gate.resolve();
    const outcomes=await Promise.allSettled(raceJobs);assert.equal(outcomes[1].status,"fulfilled");
    if(outcomes[0].status==="rejected")assert.ok(rejected(outcomes[0].reason));else assert.equal((await raceService.lookup(cookie(outcomes[0].value))).session,null);
    assert.equal(await count(race),0);await assert.rejects(raceService.login(input(race)),rejected);await assertHistorical();
    console.log("PASS simultaneous real connections: no session survived the committed lock.");
    console.log("Stage: deletion lock and fresh lookup");
    const deletion=fixtures.deletion,ds=login(a.db,deletion),d1=await ds.login(input(deletion)),d2=await ds.login(input(deletion));
    const retained=(await b.db.session.findMany({where:{userId:deletion.id}}))[0];
    assert.equal((await lifecycle(b.db,deletion,"deletion-request").lock(request(deletion,"deletion-request"))).revokedSessions,2);
    assert.equal(await count(deletion),0);assert.equal((await ds.lookup(cookie(d1))).session,null);assert.equal((await ds.lookup(cookie(d2))).session,null);
    await assert.rejects(ds.login(input(deletion)),rejected);
    const state=await readAccountAccess(b.db,deletion.id);assert.ok(state.deletionRequestedAt instanceof Date);assert.equal(state.disabledAt,null);
    // Only this run's own retired, unexpired Session is reinserted as a legacy
    // fixture. It must remain unusable; this is NOT a successful login after lock.
    assert.equal(retained.userId,deletion.id);assert.match(retained.token,/^hmac-sha256:v1:[0-9a-f]{64}$/u);
    assert.ok(controlAlive);await b.db.session.create({data:retained});assert.equal(await count(deletion),1);
    assert.equal((await ds.lookup(cookie(d1))).session,null);assert.equal((await ds.lookup(cookie(d2))).session,null);assert.equal(await count(deletion),1);
    await assertHistorical();console.log("PASS deletion lock revokes both sessions; fresh flags also reject a retained legacy row.");
    console.log("Stage: actual PostgreSQL transaction failure after required writes");
    const rollback=fixtures.rollback,rs=login(a.db,rollback),rc=await rs.login(input(rollback));
    const before=await readAccountAccess(b.db,rollback.id),beforeSessions=await b.db.session.findMany({where:{userId:rollback.id}});
    let rollbackReached=false;
    await assert.rejects(lifecycle(b.db,rollback,"deletion-request",{failAfterRevoke:true,revokeReached:async tx=>{
      assert.ok((await readAccountAccess(tx,rollback.id)).deletionRequestedAt instanceof Date);
      assert.equal(await tx.session.count({where:{userId:rollback.id}}),0);rollbackReached=true;
    }}).lock(request(rollback,"deletion-request")),e=>e.code==="account_access_unavailable");
    assert.equal(rollbackReached,true);
    assert.deepEqual(await readAccountAccess(b.db,rollback.id),before);assert.deepEqual(await b.db.session.findMany({where:{userId:rollback.id}}),beforeSessions);
    assert.equal((await rs.lookup(cookie(rc))).session.user.id,rollback.id);await assertHistorical();
    console.log("PASS injected failing SQL after both required writes rolled back status and revocation together.");
    console.log("Stage: login pre-commit backend termination");
    const commit=fixtures["commit-failure"];let candidate=false,terminated=false;
    const failed=login(a.db,commit,{beforeCommit:async(c,value)=>{
      candidate=!!value.headers?.getSetCookie().length;assert.equal(candidate,true);
      assert.equal(await c.tx.session.count({where:{userId:commit.id}}),1);a.state.expected=true;
      const own=await control.query(`SELECT backend_start::text AS started FROM pg_stat_activity WHERE pid=$1 AND pid<>pg_backend_pid()
        AND datname=current_database() AND usename=current_user AND application_name=$2 AND backend_type='client backend'`,[c.pid,name]);
      assert.equal(own.rowCount,1);
      const killed=await control.query(`SELECT pg_terminate_backend(pid,1000) AS terminated FROM pg_stat_activity WHERE pid=$1 AND pid<>pg_backend_pid()
        AND datname=current_database() AND usename=current_user AND application_name=$2 AND backend_start::text=$3 AND backend_type='client backend'`,[c.pid,name,own.rows[0].started]);
      assert.equal(killed.rowCount,1);assert.equal(killed.rows[0].terminated,true);terminated=true;
    }});
    await assert.rejects(failed.login(input(commit)),e=>e.code==="session_unavailable" && !e.headers);
    assert.ok(candidate && terminated);assert.equal(await count(commit),0);await assertHistorical();
    console.log("PASS real pre-commit connection loss: prepared cookie was not returned and uncommitted session rolled back.");
    assert.equal((await unrelated.lookup(cookie(unrelatedResult))).session.user.id,fixtures.unrelated.id);
    assert.deepEqual(await fixtureSnapshot(fixtures.unrelated),unrelatedState);await assertHistorical();
    assert.equal((await control.query('SELECT count(*)::integer AS n FROM product."User"')).rows[0].n,18);
    console.log("PASS ten historical users, historical authentication rows and unrelated fixture session remained unchanged.");
    console.log("PROOF COMPLETE: separate exact-UUID owner cleanup required; eight synthetic User/Account pairs remain.");
  } finally {
    globalThis.fetch=fetcher;
    const closed=await Promise.allSettled([closeAccountProofClients(clients),Promise.resolve().then(()=>control.end())]);
    if(closed.some(o=>o.status==="rejected"))throw new Error("Account proof connections did not close cleanly.");
    console.log("Runtime account proof database connections closed.");
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await run(authorizeAccountProof(process.argv.slice(2),process.env));}
  catch {console.error("STOP: account proof unconfirmed. Preserve run_id and observed stage; no automatic retry, reset or cleanup.");process.exitCode=1;}
}
