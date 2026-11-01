// OWNER ONLY. Import is inert. No connection or fixture write occurs without exact authorization.
import {pathToFileURL} from "node:url";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig} from "../../prisma/product/targets.ts";
export function authorizeSessionIntegration(args, env) {
  if (args.length !== 1 || args[0] !== "--owner-integration" || env.NODE_ENV !== "test" ||
      env.PRODUCT_DATABASE_MODE !== "test" || env.PRODUCT_SESSION_INTEGRATION_CONFIRMED !== "true") {
    throw new Error("Explicit isolated product-test session authorization required.");
  }
  return productDatabaseConfig(env);
}
// Own every successfully constructed client, even if the next constructor fails.
// Tests inject inert clients here; only run() supplies real Prisma clients.
export async function withSessionProofClients(connect, operation) {
  const clients = [];
  try {
    clients.push(connect());
    clients.push(connect());
    return await operation(...clients);
  } finally {
    const outcomes = await Promise.allSettled(clients.map(client => Promise.resolve().then(() => client.$disconnect())));
    if (outcomes.some(value => value.status === "rejected")) throw new Error("Session proof disconnect failed");
    console.log("Session proof connection cleanup completed");
  }
}
async function run(target) {
  await import("../../scripts/register-server-only.mjs");
  const {default: assert} = await import("node:assert/strict");
  const {randomUUID, randomBytes} = await import("node:crypto");
  const {PrismaClient} = await import("../../prisma/product/generated/client.ts");
  const {PrismaPg} = await import("@prisma/adapter-pg");
  const {hashPassword} = await import("../../lib/auth/password.server.ts");
  const {createSessionService} = await import("../../lib/product-auth/session.server.ts");
  const {sessionTokenDigester} = await import("../../lib/product-auth/session-adapter.server.ts");
  const connect = () => new PrismaClient({adapter: new PrismaPg({connectionString: target.url, options:PRODUCT_PRISMA_CONNECTION_OPTIONS}, {schema: "product"}), log: []});
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {throw new Error("External network prohibited in session proof");};
  const models = ["user", "account", "session", "verification", "termsVersion", "termsAcceptance", "emailVerificationIssuance", "emailOutbox"];
  const runId = randomUUID();
  const userIds = ["session-proof-" + runId + "-verified", "session-proof-" + runId + "-unverified"];
  console.log("Synthetic session proof run_id=" + runId); // Cleanup correlation only, never a credential.
  try {
    return await withSessionProofClients(connect, async (writer, reader) => {
      // Reviewed permissions.sql grants table SELECT on all eight models, not history.
      // A missing effective SELECT fails this baseline before any fixture write.
      const totals = async () => Object.fromEntries(await Promise.all(models.map(async name => [name, await reader[name].count()])));
      const probe = db => db.$transaction(async tx => (await tx.$queryRaw`SELECT current_database() AS database, current_user AS role,
        to_regnamespace('product')::text AS namespace, pg_backend_pid() AS pid,
        NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe FROM pg_roles WHERE rolname=current_user`)[0]);
      const identities = await Promise.all([probe(writer), probe(reader)]);
      for (const row of identities) {
        assert.equal(row.database, target.database); assert.equal(row.role, target.user); assert.equal(row.namespace, "product"); assert.equal(row.safe, true);
      }
      assert.notEqual(identities[0].pid, identities[1].pid);
      const privileges = await reader.$queryRaw`SELECT
        has_table_privilege(current_user,'product."Session"','SELECT') AS read,
        has_table_privilege(current_user,'product."Session"','DELETE') AS remove,
        has_any_column_privilege(current_user,'product."Session"','UPDATE') AS renew,
        has_column_privilege(current_user,'product."Session"','token','INSERT') AS insert_token,
        has_schema_privilege(current_user,'product','CREATE') AS schema_create,
        has_table_privilege(current_user,'product._prisma_migrations','SELECT') AS history_read`;
      assert.deepEqual(privileges, [{read: true, remove: true, renew: false, insert_token: true, schema_create: false, history_read: false}]);
      const before = await totals();
      const unknownEmail = "unknown-" + runId + "@example.invalid";
      assert.equal(await reader.user.findUnique({where: {email: unknownEmail}}), null,
        "Unknown-account probe must not target an existing identity; pause all other test writers");
      const password = " Exact synthetic session e\u0301 phrase ", encoded = await hashPassword(password);
      const config = {mode: "test", authSecret: randomBytes(48).toString("base64url"), sessionTokenKey: randomBytes(32), expiresInSeconds: 600, renewal: "none"};
      const digest = sessionTokenDigester(config.sessionTokenKey);
      const cookies = result => new Headers({cookie: result.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")});
      const rawToken = result => decodeURIComponent(result.headers.getSetCookie().find(value => value.startsWith("better-auth.session_token="))
        .split(";")[0].split("=").slice(1).join("=")).split(".")[0];
      // Atomic fixture setup COMMIT, unlike the original rollback-only harness.
      // These are session-only fixtures, not registration/OTP/Terms approval evidence.
      await writer.$transaction(async tx => {
        for (const [index, id] of userIds.entries()) {
          await tx.user.create({data: {id, name: "Synthetic session proof " + runId, email: id + "@example.invalid", emailVerified: index === 0}});
          await tx.account.create({data: {id: "credential-" + id, userId: id, accountId: id, providerId: "credential", password: encoded}});
        }
      });
      const service = createSessionService(writer, config), independent = createSessionService(reader, config);
      const input = {email: userIds[0] + "@example.invalid", password};
      for (const edit of [{password: password.trim()}, {email: unknownEmail}, {email: userIds[1] + "@example.invalid"}]) {
        await assert.rejects(service.login({...input, ...edit}), error => error.code === "login_rejected");
      }
      assert.equal(await reader.session.count({where: {userId: {in: userIds}}}), 0);
      console.log("PASS wrong, unknown and unverified login refused; no fixture session created");
      const first = await service.login({...input, email: " " + input.email.toUpperCase() + " "});
      const second = await service.login(input);
      const raw = [rawToken(first), rawToken(second)], rows = await reader.session.findMany({where: {userId: userIds[0]}});
      assert.equal(rows.length, 2); assert.notEqual(raw[0], raw[1]);
      assert.deepEqual(new Set(rows.map(row => row.token)), new Set(raw.map(digest)));
      for (const row of rows) {assert.match(row.token, /^hmac-sha256:v1:[0-9a-f]{64}$/u); assert.ok(!raw.includes(row.token));}
      for (const result of [first, second]) assert.equal((await independent.lookup(cookies(result))).session?.user.id, userIds[0]);
      assert.equal((await independent.lookup(new Headers({cookie: "better-auth.session_token=forged"}))).session, null);
      console.log("PASS two distinct tokens/digests, committed digest-only storage and independent-connection lookup");
      const expiration = (await independent.lookup(cookies(first))).session.expiresAt;
      assert.equal((await independent.lookup(cookies(first))).session.expiresAt.getTime(), expiration.getTime());
      await independent.logout(cookies(first));
      assert.equal((await service.lookup(cookies(first))).session, null);
      assert.ok((await service.lookup(cookies(second))).session);
      console.log("PASS individual logout revokes only its digest and clears its cookie");
      const brief = createSessionService(writer, {...config, expiresInSeconds: 1});
      const expiring = cookies(await brief.login(input));
      await new Promise(resolve => setTimeout(resolve, 1_100));
      assert.equal((await independent.lookup(expiring)).session, null);
      assert.equal(await reader.session.count({where: {userId: userIds[0]}}), 1);
      await independent.logoutAll(cookies(second));
      assert.equal((await service.lookup(cookies(second))).session, null);
      assert.equal(await reader.session.count({where: {userId: {in: userIds}}}), 0);
      console.log("PASS actual expiry cleanup and authenticated user-wide revocation across connections");
      const expected = {...before, user: before.user + 2, account: before.account + 2};
      assert.deepEqual(await totals(), expected, "Pause other product-test writers; only the two fresh fixture pairs may remain");
      console.log("PASS aggregate counts match expected fixture-only changes; no Terms/issuance/outbox writes");
      console.log("STOP FOR OWNER CLEANUP: two committed synthetic User/Account fixtures remain. Use the reviewed run_id cleanup SQL; no automatic cleanup or rerun.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {await run(authorizeSessionIntegration(process.argv.slice(2), process.env));}
  catch {console.error("STOP: session PostgreSQL proof failed; preserve output, inspect rollback/cleanup, do not reset or automatically rerun."); process.exitCode = 1;}
}
