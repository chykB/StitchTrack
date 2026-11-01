// OWNER ONLY: importing this module opens no connection. Do not execute until
// product targets, migration SQL, privileges and test authorization are approved.
import {pathToFileURL} from "node:url";
import {productDatabaseConfig, PRODUCT_TARGETS} from "../../prisma/product/targets.ts";
export function authorizeProductIntegration(args, env) {
  if (args.length !== 1 || args[0] !== "--owner-integration" || env.PRODUCT_AUTH_INTEGRATION_CONFIRMED !== "true" ||
      env.PRODUCT_DATABASE_MODE !== "test") throw new Error("Explicit isolated product-test authorization required.");
  const config = productDatabaseConfig(env);
  if (config.database !== PRODUCT_TARGETS.test.database || config.user !== PRODUCT_TARGETS.test.role) throw new Error("Product test target required.");
  return config;
}
async function run(config) {
  await import("../../scripts/register-server-only.mjs");
  const {PrismaClient} = await import("../../prisma/product/generated/client.ts");
  const {PrismaPg} = await import("@prisma/adapter-pg");
  const {randomBytes, randomUUID, createHash} = await import("node:crypto");
  const {default: assert} = await import("node:assert/strict");
  const {createRegistrationService, REGISTRATION_STAGES, VERIFICATION_STAGES, deliveryEligible} = await import("../../lib/product-auth/registration.server.ts");
  const {createSecretTools} = await import("../../lib/product-auth/secrets.server.ts");
  const {hashPassword, verifyPassword} = await import("../../lib/auth/password.server.ts");
  const {betterAuth} = await import("better-auth");
  const {prismaAdapter} = await import("@better-auth/prisma-adapter");
  const modelNames = ["user", "account", "session", "verification", "termsVersion", "termsAcceptance", "emailOutbox", "emailVerificationIssuance"];
  globalThis.fetch = async () => {throw new Error("No external network allowed in product integration proof.");};
  const client = new PrismaClient({adapter: new PrismaPg({connectionString: config.url}, {schema: "product"}), log: []});
  try {
    const identity = await client.$queryRaw`SELECT current_database() AS database, current_user AS role, to_regnamespace('product')::text AS namespace`;
    assert.deepEqual(identity, [{database: config.database, role: config.user, namespace: "product"}]);
    const privileges = await client.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    assert.equal(privileges.length, 1); assert.ok(Object.values(privileges[0]).every(value => value === false));
    const access = await client.$queryRaw`SELECT
      has_schema_privilege(current_user,'product','CREATE') AS schema_create,
      has_table_privilege(current_user,'product._prisma_migrations','SELECT') AS history_read,
      has_table_privilege(current_user,'product._prisma_migrations','UPDATE') AS history_update,
      has_table_privilege(current_user,'product."Session"','INSERT') AS session_insert,
      has_any_column_privilege(current_user,'product."TermsVersion"','UPDATE') AS terms_update,
      has_table_privilege(current_user,'product."TermsVersion"','DELETE') AS terms_delete,
      has_column_privilege(current_user,'product."TermsVersion"','approvedAt','INSERT') AS terms_approve,
      has_any_column_privilege(current_user,'product."TermsAcceptance"','UPDATE') AS acceptance_update,
      has_table_privilege(current_user,'product."TermsAcceptance"','DELETE') AS acceptance_delete,
      has_column_privilege(current_user,'product."TermsVersion"','isTestFixture','INSERT') AS fixture_insert`;
    assert.deepEqual(access, [{schema_create:false, history_read:false, history_update:false, session_insert:false,
      terms_update:false, terms_delete:false, terms_approve:false, acceptance_update:false, acceptance_delete:false, fixture_insert:true}]);
    const constraints = await client.$queryRaw`SELECT c.contype::text AS kind, count(*)::int AS count FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'product' AND c.contype IN ('p', 'f', 'c') GROUP BY c.contype`;
    assert.deepEqual(Object.fromEntries(constraints.map(row => [row.kind, row.count])), {p: 9, f: 7, c: 15});
    const openIndex = await client.$queryRaw`SELECT indexdef FROM pg_indexes WHERE schemaname = 'product' AND indexname = 'Issuance_one_open_per_user'`;
    assert.equal(openIndex.length, 1); assert.match(openIndex[0].indexdef, /UNIQUE INDEX/u);
    assert.match(openIndex[0].indexdef, /consumedAt.*IS NULL.*supersededAt.*IS NULL/u);
    for (const name of modelNames) assert.equal(await client[name].count(), 0, "Reserved product-test database must be empty; no automatic cleanup.");
    console.log("PASS exact test database/role/namespace, nonprivileged role and empty product tables");
    const runId = randomUUID(), termsId = randomUUID();
    await client.termsVersion.create({data: {id: termsId, version: "synthetic-" + runId,
      contentDigest: createHash("sha256").update("Synthetic integration Terms only").digest("hex"),
      immutableDocumentRef: "synthetic://registration-proof", isTestFixture: true}});
    const keyConfig = {verifierKeys: {currentId: "synthetic-otp", keys: new Map([["synthetic-otp", randomBytes(32)]])},
      outboxKeys: {currentId: "synthetic-mail", keys: new Map([["synthetic-mail", randomBytes(32)]])}};
    const base = {mode: "test", allowSyntheticTerms: true, requiredTermsVersionId: termsId, authSecret: randomBytes(48).toString("base64url"),
      ...keyConfig, checkPassword: async () => "not_found"}; // Synthetic stub; HIBP separately tested, never called here.
    const tools = createSecretTools(keyConfig.verifierKeys, keyConfig.outboxKeys);
    const makeInput = suffix => ({name: "Synthetic Tailor", email: "synthetic-" + suffix + "-" + runId + "@example.invalid",
      password: " Exact synthetic passphrase e\u0301 ", termsAccepted: true, termsVersionId: termsId});
    const totals = async () => Object.fromEntries(await Promise.all(modelNames.map(async name => [name, await client[name].count()])));
    const baseline = await totals();
    for (const stage of REGISTRATION_STAGES) {
      const observed = [], service = createRegistrationService(client, {...base, testFault: stage, testObserver: value => observed.push(value)});
      await assert.rejects(service.register(makeInput(stage)));
      assert.equal(observed.at(-1), stage, "Injected write stage must genuinely be reached");
      assert.deepEqual(await totals(), baseline, "All required writes must roll back together");
      console.log("PASS real PostgreSQL rollback after " + stage + " write");
    }
    const service = createRegistrationService(client, base), duplicate = makeInput("duplicate");
    const concurrent = await Promise.allSettled([service.register(duplicate), service.register({...duplicate, email: " " + duplicate.email.toUpperCase() + " "})]);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
    const user = await client.user.findUnique({where: {email: duplicate.email}}); assert.ok(user); assert.equal(user.emailVerified, false);
    assert.equal(await client.user.count(), 1); assert.equal(await client.account.count(), 1);
    assert.equal(await client.termsAcceptance.count(), 1); assert.equal(await client.emailVerificationIssuance.count(), 1);
    assert.equal(await client.verification.count(), 1); assert.equal(await client.emailOutbox.count(), 1); assert.equal(await client.session.count(), 0);
    const credential = await client.account.findFirst({where: {userId: user.id}});
    assert.equal(await verifyPassword({hash: credential.password, password: duplicate.password}), true);
    assert.equal(await verifyPassword({hash: credential.password, password: duplicate.password.trim()}), false);
    const signin = betterAuth({baseURL: "http://127.0.0.1:3999", secret: base.authSecret,
      database: prismaAdapter(client, {provider: "postgresql", transaction: false}),
      telemetry: {enabled: false}, logger: {disabled: true},
      emailAndPassword: {enabled: true, autoSignIn: false, requireEmailVerification: true, minPasswordLength: 12,
        maxPasswordLength: Number.POSITIVE_INFINITY, password: {hash: hashPassword, verify: verifyPassword}},
      emailVerification: {sendOnSignUp: false, sendOnSignIn: false, autoSignInAfterVerification: false}});
    await assert.rejects(signin.api.signInEmail({body: {email: duplicate.email, password: duplicate.password}}), error => error.statusCode === 403);
    assert.equal(await client.session.count(), 0);
    console.log("PASS real library refuses unverified credential sign-in without a session");
    const job = await client.emailOutbox.findFirst({where: {issuance: {userId: user.id}}}), payload = tools.open(job, job);
    const verification = {email: duplicate.email, issuanceId: job.issuanceId, otp: payload.otp};
    const races = await Promise.allSettled([service.verify(verification), service.verify(verification)]);
    assert.equal(races.filter(value => value.status === "fulfilled" && value.value === "verified").length, 1);
    assert.equal(await service.verify(verification), "invalid"); assert.equal(await client.session.count(), 0);
    const stable = await client.emailVerificationIssuance.findUnique({where: {id: job.issuanceId}});
    assert.ok(stable.consumedAt); assert.equal(stable.verificationId, null); assert.equal((await client.emailOutbox.findUnique({where: {id: job.id}})).issuanceId, stable.id);
    console.log("PASS concurrent canonical duplicate, exact password, verification race/replay, stable FK and zero sessions");
    async function issued(suffix) {
      const input = makeInput(suffix), {issuanceId} = await service.register(input);
      const mail = await client.emailOutbox.findUnique({where: {issuanceId}});
      return {input, issuanceId, mail, payload: tools.open(mail, mail)};
    }
    for (const stage of VERIFICATION_STAGES) {
      const subject = await issued(stage), observed = [];
      const failing = createRegistrationService(client, {...base, testFault: stage, testObserver: value => observed.push(value)});
      const before = await client.emailVerificationIssuance.findUnique({where: {id: subject.issuanceId}});
      await assert.rejects(failing.verify({email: subject.input.email, issuanceId: subject.issuanceId, otp: subject.payload.otp}));
      assert.equal(observed.at(-1), stage);
      assert.equal((await client.user.findUnique({where: {email: subject.input.email}})).emailVerified, false);
      assert.equal((await client.emailVerificationIssuance.findUnique({where: {id: subject.issuanceId}})).consumedAt, null);
      assert.equal((await client.emailOutbox.findUnique({where: {id: subject.mail.id}})).status, "pending");
      assert.ok(await client.verification.findUnique({where: {id: before.verificationId}}));
      console.log("PASS real PostgreSQL verification rollback after " + stage);
    }
    const wrong = await issued("wrong"); const bad = wrong.payload.otp === "999999" ? "888888" : "999999";
    for (let attempt = 1; attempt <= 3; attempt++) {
      assert.equal(await service.verify({email: wrong.input.email, issuanceId: wrong.issuanceId, otp: bad}), "invalid");
      assert.equal((await client.emailVerificationIssuance.findUnique({where: {id: wrong.issuanceId}})).failedAttempts, attempt);
    }
    assert.equal(await service.verify({email: wrong.input.email, issuanceId: wrong.issuanceId, otp: wrong.payload.otp}), "invalid");
    const expired = await issued("expired");
    // Advance the injected test clock; never rewrite persisted issuance times.
    const expiredService = createRegistrationService(client, {...base, clock: () => new Date(Date.now() + 300_001)});
    assert.equal(await expiredService.verify({email: expired.input.email, issuanceId: expired.issuanceId, otp: expired.payload.otp}), "invalid");
    assert.equal((await client.user.findUnique({where: {email: expired.input.email}})).emailVerified, false);
    const old = await issued("reissue"); assert.equal(await service.reissue(old.input.email), null);
    const laterService = createRegistrationService(client, {...base, clock: () => new Date(Date.now() + 60_001)});
    const reissues = await Promise.allSettled([laterService.reissue(old.input.email), laterService.reissue(old.input.email)]);
    const replacements = reissues.filter(result => result.status === "fulfilled" && result.value !== null);
    assert.equal(replacements.length, 1); const fresh = replacements[0].value;

    const oldState = await client.emailVerificationIssuance.findUnique({where: {id: old.issuanceId}});
    const oldJob = await client.emailOutbox.findUnique({where: {id: old.mail.id}});
    assert.equal(await client.emailVerificationIssuance.count({where: {userId: oldState.userId, consumedAt: null, supersededAt: null}}), 1);
    assert.ok(oldState.supersededAt); assert.equal(oldJob.status, "cancelled");
    assert.equal(deliveryEligible(oldJob, oldState, await client.user.findUnique({where: {email: old.input.email}}), new Date()), false);
    assert.equal(await service.verify({email: old.input.email, issuanceId: old.issuanceId, otp: old.payload.otp}), "invalid");
    const freshMail = await client.emailOutbox.findUnique({where: {issuanceId: fresh.issuanceId}});
    assert.equal(await laterService.verify({email: old.input.email, issuanceId: fresh.issuanceId, otp: tools.open(freshMail, freshMail).otp}), "verified");
    assert.equal(await client.session.count(), 0);
    console.log("PASS three attempts, expiry, cooldown, supersession and stale-job eligibility (injected test clock)");
    console.log("Integration proof complete only if this owner-run process exits zero. No SMTP or HIBP was used. Synthetic records remain; no cleanup performed.");
  } finally {await client.$disconnect();}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {await run(authorizeProductIntegration(process.argv.slice(2), process.env));}
  catch (error) {
    const kind = error instanceof Error ? error.name : "UnknownError";
    const line = typeof error?.stack === "string"
      ? error.stack.match(/registration\.integration\.mjs:(\d+):\d+/u)?.[1]
      : undefined;
    console.error(`STOP: integration failed (${kind}${line ? `, test line ${line}` : ""}). Preserve results; no automatic retry or cleanup.`);
    process.exitCode = 1;
  }
}
