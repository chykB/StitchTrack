import test from "node:test";
import assert from "node:assert/strict";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
import {authorizeProductIntegration} from "./registration.integration.mjs";
const {createRegistrationService, REGISTRATION_STAGES, VERIFICATION_STAGES, deliveryEligible} = await import("../../lib/product-auth/registration.server.ts");
const {createSecretTools, ProductAuthError} = await import("../../lib/product-auth/secrets.server.ts");
const {verifyPassword} = await import("../../lib/auth/password.server.ts");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => assert.fail("Offline service tests may not use network");
test.after(() => {globalThis.fetch = originalFetch;});
function keys() {return {verifierKeys: {currentId: "otp-a", keys: new Map([["otp-a", Buffer.alloc(32, 1)]])}, outboxKeys: {currentId: "mail-a", keys: new Map([["mail-a", Buffer.alloc(32, 2)]])}};}
const input = {name: "\u1eccl\u00e1", email: " Synthetic@EXAMPLE.INVALID ", password: " Exact synthetic phrase ", termsAccepted: true, termsVersionId: "synthetic-terms"};
async function setup(overrides = {}) {
  const f = fakeProduct(); let time = new Date();
  await f.client.termsVersion.create({data: {id: input.termsVersionId, version: "synthetic-only", contentDigest: "synthetic-digest", immutableDocumentRef: "test-only", isTestFixture: true, approvedAt: null, effectiveAt: null}});
  const config = {mode: "test", allowSyntheticTerms: true, requiredTermsVersionId: input.termsVersionId, authSecret: "offline-only-authentication-secret-not-for-real-use", ...keys(),
    checkPassword: async () => {assert.equal(f.inTransaction(), false, "Breach screening must precede transaction"); return "not_found";}, clock: () => new Date(time), ...overrides};
  const service = createRegistrationService(f.client, config), secrets = createSecretTools(config.verifierKeys, config.outboxKeys);
  return {...f, config, service, secrets, advance: ms => {time = new Date(time.getTime() + ms);}, now: () => new Date(time)};
}
function mail(f, issuanceId) {const row = f.rows().emailOutbox.find(job => job.issuanceId === issuanceId); return f.secrets.open(row, row);}

test("keyed verifier binds issuance/email and AEAD binds job metadata; separate keys required", () => {
  const config = keys(), tools = createSecretTools(config.verifierKeys, config.outboxKeys);
  const expected = tools.mac("one", "synthetic@example.invalid", "004281");
  assert.equal(tools.matches(expected, "one", "synthetic@example.invalid", "004281", "otp-a"), true);
  assert.equal(tools.matches(expected, "two", "synthetic@example.invalid", "004281", "otp-a"), false);
  assert.equal(tools.matches(expected, "one", "other@example.invalid", "004281", "otp-a"), false);
  const context = {id: "job", issuanceId: "one", templateVersion: "v1"};
  const payload = {email: "synthetic@example.invalid", otp: "004281"};
  const first = tools.seal(context, payload), second = tools.seal(context, payload);
  assert.notDeepEqual(first.nonce, second.nonce); assert.deepEqual(tools.open(context, first), payload);
  for (const patch of [{id: "other"}, {issuanceId: "two"}, {templateVersion: "v2"}]) assert.throws(() => tools.open({...context, ...patch}, first), ProductAuthError);
  const tampered = {...first, payloadCiphertext: Uint8Array.from(first.payloadCiphertext)}; tampered.payloadCiphertext[0] ^= 1;
  assert.throws(() => tools.open(context, tampered), ProductAuthError);
  assert.throws(() => createSecretTools(config.verifierKeys, config.verifierKeys), ProductAuthError);
});
test("prepared registration uses actual Better Auth, exact Argon2id password and durable encrypted issuance", async () => {
  const f = await setup(), result = await f.service.register(input), rows = f.rows();
  assert.equal(rows.user.length, 1); assert.equal(rows.account.length, 1); assert.equal(rows.termsAcceptance.length, 1);
  assert.equal(Object.hasOwn(rows.emailOutbox[0], "userId"), false);
  assert.equal(rows.emailVerificationIssuance.length, 1); assert.equal(rows.verification.length, 1); assert.equal(rows.emailOutbox.length, 1); assert.equal(rows.session.length, 0);
  assert.equal(rows.user[0].name, input.name); assert.equal(rows.user[0].email, "synthetic@example.invalid"); assert.equal(rows.user[0].emailVerified, false);
  assert.equal(await verifyPassword({password: input.password, hash: rows.account[0].password}), true);
  assert.equal(await verifyPassword({password: input.password.trim(), hash: rows.account[0].password}), false);
  const payload = mail(f, result.issuanceId); assert.match(payload.otp, /^[0-9]{6}$/u);
  const issuance = rows.emailVerificationIssuance[0]; assert.equal(f.secrets.matches(issuance.verifier, issuance.id, payload.email, payload.otp, issuance.verifierKeyId), true);
  assert.equal(deliveryEligible(rows.emailOutbox[0], issuance, rows.user[0], f.now()), true);
});
test("delayed transaction keeps explicit issuance time and five-minute expiry independent of database default", async () => {
  const f = await setup();
  // Model transaction-start CURRENT_TIMESTAMP two seconds before the callback
  // issues the code. This is logical time, not PostgreSQL execution or a sleep.
  f.advance(-2_000); const transactionStart = f.now();
  const transaction = f.client.$transaction;
  f.client.$transaction = callback => transaction(async tx => {f.advance(2_000); return callback(tx);});
  for (const model of ["emailVerificationIssuance", "emailOutbox"]) {
    const create = f.client[model].create;
    f.client[model].create = ({data}) => create({data: {createdAt: transactionStart, ...data}});
  }
  const {issuanceId} = await f.service.register(input), rows = f.rows();
  const issuance = rows.emailVerificationIssuance[0], job = rows.emailOutbox[0];
  assert.equal(issuance.createdAt.getTime(), transactionStart.getTime() + 2_000);
  assert.equal(issuance.expiresAt.getTime() - issuance.createdAt.getTime(), 300_000);
  assert.ok(issuance.expiresAt <= rows.verification[0].expiresAt);
  // Using the default instead would incorrectly exceed the SQL lifetime bound.
  assert.ok(issuance.expiresAt.getTime() - transactionStart.getTime() > 300_000);
  assert.equal(job.createdAt.getTime(), issuance.createdAt.getTime());
  assert.equal(job.availableAt.getTime(), issuance.createdAt.getTime());
  assert.equal(deliveryEligible(job, issuance, rows.user[0], f.now()), true);
  f.advance(300_000);
  assert.equal(await f.service.verify({...mail(f, issuanceId), issuanceId}), "invalid");
  assert.equal(f.rows().session.length, 0);
});
test("orchestration double restores every dependent write after each injected stage (not PostgreSQL rollback proof)", async () => {
  for (const testFault of REGISTRATION_STAGES) {
    const f = await setup({testFault}); await assert.rejects(f.service.register(input));
    for (const [name, rows] of Object.entries(f.rows())) assert.equal(rows.length, name === "termsVersion" ? 1 : 0, testFault + ":" + name);
  }
});
test("invalid input/Terms/breach prerequisites fail before required registration writes", async () => {
  for (const edit of [{termsAccepted: false}, {termsVersionId: "other"}, {password: "short"}, {email: "\u1ecdl\u00e1@example.invalid"}]) {
    const f = await setup(); await assert.rejects(f.service.register({...input, ...edit})); assert.equal(f.rows().user.length, 0);
  }
  for (const result of ["breached", "unavailable"]) {const f = await setup({checkPassword: async () => result}); await assert.rejects(f.service.register(input)); assert.equal(f.events.includes("outer.begin"), false);}
  const f = await setup({allowSyntheticTerms: false}); await assert.rejects(f.service.register(input)); assert.equal(f.rows().user.length, 0);
});
test("correct OTP consumes stable issuance and cancels outbox; replay cannot create a session", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  assert.equal(await f.service.verify({...payload, issuanceId}), "verified");
  const rows = f.rows(); assert.equal(rows.user[0].emailVerified, true); assert.ok(rows.emailVerificationIssuance[0].consumedAt);
  assert.equal(rows.emailOutbox[0].issuanceId, issuanceId); assert.equal(rows.emailOutbox[0].status, "cancelled"); assert.equal(rows.verification.length, 0);
  assert.equal(await f.service.verify({...payload, issuanceId}), "invalid"); assert.equal(rows.session.length, 0);
});
test("installed OTP verification omits redundant email before the restricted Prisma user update", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  const update = f.client.user.update, writes = [];
  f.client.user.update = async args => {
    assert.equal(f.inTransaction(), true);
    assert.equal(Object.hasOwn(args.data, "email"), false, "Runtime must never receive an email update, even an identical value");
    assert.ok(Object.keys(args.data).every(key => ["emailVerified", "updatedAt"].includes(key)));
    writes.push(structuredClone(args)); return update(args);
  };
  assert.equal(await f.service.verify({...payload, issuanceId}), "verified");
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].where, {id: f.rows().user[0].id});
  assert.equal(writes[0].data.emailVerified, true);
  assert.equal(f.rows().user[0].email, payload.email); assert.equal(f.rows().session.length, 0);
  assert.equal(f.rows().verification.length, 0); assert.ok(f.rows().emailVerificationIssuance[0].consumedAt);
  assert.equal(await f.service.verify({...payload, issuanceId}), "invalid"); assert.equal(writes.length, 1);
});
test("unexpected verification identity is rejected before any User update and restores consumed OTP in the double", async () => {
  for (const mismatch of ["locked-email", "library-user-id"]) {
    const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
    const originalRows = structuredClone(f.rows()); let writes = 0;
    const update = f.client.user.update;
    f.client.user.update = async args => {writes++; return update(args);};
    // Simulate an inconsistent identity returned at each library/service lookup
    // boundary. These are delegate-double faults, not observed database failures.
    const method = mismatch === "locked-email" ? "findUnique" : "findFirst";
    const find = f.client.user[method];
    f.client.user[method] = async args => {
      const row = await find(args);
      return row ? {...row, ...(mismatch === "locked-email" ? {email: "unexpected@example.invalid"} : {id: "unexpected-user"})} : row;
    };
    await assert.rejects(f.service.verify({...payload, issuanceId}), error => error instanceof ProductAuthError && error.code === "verification_unavailable");
    assert.equal(writes, 0); assert.deepEqual(f.rows(), originalRows);
  }
});
test("three wrong codes commit product attempt budget without replacing the library row", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  const wrong = payload.otp === "999999" ? "888888" : "999999", original = f.rows().verification[0].id;
  for (let i = 1; i <= 3; i++) {assert.equal(await f.service.verify({...payload, issuanceId, otp: wrong}), "invalid"); assert.equal(f.rows().emailVerificationIssuance[0].failedAttempts, i); assert.equal(f.rows().verification[0].id, original);}
  assert.equal(await f.service.verify({...payload, issuanceId}), "invalid"); assert.equal(f.rows().user[0].emailVerified, false); assert.equal(f.rows().emailOutbox[0].status, "cancelled");
});
test("expired/malformed codes are refused and expired pending mail becomes ineligible", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  assert.equal(await f.service.verify({...payload, issuanceId, otp: "\uff11\uff12\uff13\uff14\uff15\uff16"}), "invalid");
  f.advance(300_001); assert.equal(await f.service.verify({...payload, issuanceId}), "invalid");
  const rows = f.rows(); assert.equal(deliveryEligible(rows.emailOutbox[0], rows.emailVerificationIssuance[0], rows.user[0], f.now()), false);
  assert.equal(rows.user[0].emailVerified, false); assert.equal(rows.emailOutbox[0].status, "cancelled");
});
test("reissue enforces cooldown and supersedes prior issuance/jobs while retaining stable history", async () => {
  const f = await setup(), first = await f.service.register(input), originalPayload = mail(f, first.issuanceId);
  assert.equal(await f.service.reissue(input.email), null); f.advance(60_001);
  const next = await f.service.reissue(input.email); assert.ok(next); assert.notEqual(next.issuanceId, first.issuanceId);
  const old = f.rows().emailVerificationIssuance.find(row => row.id === first.issuanceId);
  assert.ok(old.supersededAt); assert.equal(f.rows().emailOutbox.find(row => row.issuanceId === old.id).status, "cancelled");
  assert.equal(await f.service.verify({...originalPayload, issuanceId: old.id}), "invalid");
  assert.equal(await f.service.verify({...mail(f, next.issuanceId), issuanceId: next.issuanceId}), "verified");
});
test("missing library record leaves stable issuance/outbox history and cannot verify", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  await f.client.verification.deleteMany({where: {id: f.rows().verification[0].id}});
  assert.equal(await f.service.verify({...payload, issuanceId}), "invalid"); assert.equal(f.rows().emailVerificationIssuance[0].id, issuanceId); assert.equal(f.rows().emailOutbox[0].issuanceId, issuanceId);
});

test("PostgreSQL harness is inert on import and refuses missing/wrong target authorization", () => {
  const env = {PRODUCT_AUTH_INTEGRATION_CONFIRMED: "true", PRODUCT_DATABASE_MODE: "test", PRODUCT_DATABASE_CONFIRMED: "true",
    PRODUCT_TEST_DATABASE_URL: "postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
  assert.equal(authorizeProductIntegration(["--owner-integration"], env).mode, "test");
  for (const invalid of [{}, {...env, NODE_ENV: "production"}, {...env, PRODUCT_DATABASE_MODE: "development"},
    {...env, PRODUCT_AUTH_INTEGRATION_CONFIRMED: "false"}, {...env, PRODUCT_TEST_DATABASE_URL: env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?", "/stitchtrack_assessment?")}]) {
    assert.throws(() => authorizeProductIntegration(["--owner-integration"], invalid));
  }
  assert.throws(() => authorizeProductIntegration(["--owner-integration", "--reset"], env));
});
test("a correct third submission succeeds after two wrong codes", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  const wrong = payload.otp === "999999" ? "888888" : "999999";
  for (let i = 0; i < 2; i++) assert.equal(await f.service.verify({...payload, issuanceId, otp: wrong}), "invalid");
  assert.equal(await f.service.verify({...payload, issuanceId}), "verified");
});

test("verification failure stages restore plugin/user/issuance/outbox state in the double, not a PostgreSQL proof", async () => {
  for (const testFault of VERIFICATION_STAGES) {
    const f = await setup({testFault}), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
    await assert.rejects(f.service.verify({...payload, issuanceId}));
    assert.equal(f.rows().user[0].emailVerified, false); assert.equal(f.rows().verification.length, 1);
    assert.equal(f.rows().emailVerificationIssuance[0].consumedAt, null); assert.equal(f.rows().emailOutbox[0].status, "pending");
  }
});

test("delivery gate refuses every terminal issuance state even if a stale job still says pending", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input);
  const rows = f.rows(), job = rows.emailOutbox[0], issuance = rows.emailVerificationIssuance[0], user = rows.user[0];
  assert.equal(job.issuanceId, issuanceId);
  for (const patch of [{consumedAt: f.now()}, {supersededAt: f.now()}, {failedAttempts: 3}, {verificationId: null}, {expiresAt: f.now()}]) {
    assert.equal(deliveryEligible(job, {...issuance, ...patch}, user, f.now()), false);
  }
});


test("successful installed OTP verification preserves unrelated expired challenge history", async () => {
  const f = await setup(), {issuanceId} = await f.service.register(input), payload = mail(f, issuanceId);
  const historical = await f.client.verification.create({data: {id: "historical-expired-fixture", identifier: "historical-unrelated",
    value: "synthetic-historical-secret", expiresAt: new Date(Date.now() - 60_000)}});
  const remove = f.client.verification.deleteMany;
  f.client.verification.deleteMany = args => {
    assert.equal(Object.hasOwn(args.where, "expiresAt"), false, "No global expiry sweep during OTP lookup");
    return remove(args);
  };
  assert.equal(await f.service.verify({...payload, issuanceId}), "verified");
  assert.deepEqual(await f.client.verification.findUnique({where: {id: historical.id}}), historical);
  assert.equal(f.rows().verification.length, 1);
  assert.equal(await f.service.verify({...payload, issuanceId}), "invalid");
});
