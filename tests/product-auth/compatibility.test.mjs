// Installed-library execution against delegate doubles only. No Prisma connection,
// database transaction, SMTP, HTTP listener or authentication route is created.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHmac} from "node:crypto";
import {betterAuth} from "better-auth";
import {prismaAdapter} from "@better-auth/prisma-adapter";
import {emailOTP} from "better-auth/plugins/email-otp";
import {getAuthTables} from "@better-auth/core/db";
import {z} from "zod";
import {signupSchema} from "../../lib/auth/schemas.ts";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {assert.fail("Offline compatibility checks cannot make network requests");};
test.after(() => {globalThis.fetch = originalFetch;});
const publicTestSecret = "offline-only-synthetic-secret-not-for-authentication-177";
const code = "004281";
const otpHash = async value => createHmac("sha256", publicTestSecret).update(value).digest("hex");
const canonical = "synthetic@example.invalid";

// Small delegate double, not an implementation of PostgreSQL or its isolation.
function fixture({transaction = false, plugin = {}, verification = {}} = {}) {
  const rows = Object.fromEntries(["user", "account", "session", "verification"].map(key => [key, []]));
  const events = []; let nextId = 0, hashInput;
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every(part => matches(row, part));
    if (key === "OR") return value.some(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("lt" in value) return row[key] < value.lt;
      if ("in" in value) return value.in.includes(row[key]);
      if ("equals" in value) return row[key] === value.equals;
      throw new Error("Unexpected offline query shape");
    }
    return row[key] === value;
  });
  const client = {};
  for (const model of Object.keys(rows)) client[model] = {
    async create({data}) {const row = {...data, id: data.id ?? "offline-" + (++nextId)}; rows[model].push(row); events.push(model + ".create"); return {...row};},
    async findFirst({where}) {return rows[model].find(row => matches(row, where)) ?? null;},
    async findMany({where, orderBy, take} = {}) {let result = rows[model].filter(row => matches(row, where)); if (orderBy?.createdAt === "desc") result = result.toReversed(); return result.slice(0, take ?? result.length);},
    async update({where, data}) {const row = rows[model].find(row => matches(row, where)); if (!row) throw Object.assign(new Error("Synthetic missing row"), {code: "P2025"}); Object.assign(row, data); return {...row};},
    async updateMany({where, data}) {let count = 0; for (const row of rows[model]) if (matches(row, where)) {Object.assign(row, data); count++;} return {count};},
    async deleteMany({where}) {const prior = rows[model].length; rows[model] = rows[model].filter(row => !matches(row, where)); return {count: prior - rows[model].length};},
    async delete({where}) {const row = rows[model].find(row => matches(row, where)); if (!row) throw Object.assign(new Error("Synthetic missing row"), {code: "P2025"}); rows[model] = rows[model].filter(value => value !== row); return row;},
  };
  client.$transaction = async callback => {
    assert.equal(transaction, true, "A transaction-scoped client must not start a nested transaction");
    events.push("adapter.transaction.begin");
    const result = await callback(client);
    events.push("adapter.transaction.return"); return result;
  };
  const auth = betterAuth({
    baseURL: "http://127.0.0.1:3999", secret: publicTestSecret,
    database: prismaAdapter(client, {provider: "postgresql", transaction, debugLogs: false}),
    logger: {disabled: true}, telemetry: {enabled: false}, rateLimit: {enabled: false},
    emailAndPassword: {enabled: true, autoSignIn: false, requireEmailVerification: true,
      minPasswordLength: 12, maxPasswordLength: Number.POSITIVE_INFINITY,
      password: {hash: async value => {hashInput = value; events.push("password.hash"); return "offline-opaque-credential";}, verify: async () => true}},
    emailVerification: {sendOnSignUp: false, autoSignInAfterVerification: false, ...verification},
    databaseHooks: {user: {create: {after: async () => {events.push("user.after");}}}},
    plugins: [emailOTP({otpLength: 6, expiresIn: 300, allowedAttempts: 3, disableSignUp: true,
      storeOTP: {hash: otpHash}, sendVerificationOnSignUp: false,
      generateOTP: () => code, sendVerificationOTP: async () => assert.fail("No email delivery allowed"), ...plugin})],
  });
  return {auth, client, rows, events, getHashInput: () => hashInput};
}
async function signup(f, password = " Synthetic exact password ") {
  const parsed = signupSchema.parse({name: "Synthetic Tailor", email: " Synthetic@EXAMPLE.INVALID ", password});
  return await f.auth.api.signUpEmail({body: parsed});
}
async function challenge(f, type = "email-verification") {
  return await f.auth.api.createVerificationOTP({body: {email: canonical, type}});
}

test("installed public exports resolve at 1.7.7 with Prisma 7.10.1 pins", () => {
  for (const name of ["better-auth", "@better-auth/prisma-adapter", "@better-auth/core"]) {
    const data = JSON.parse(readFileSync(new URL("../../node_modules/" + name + "/package.json", import.meta.url), "utf8"));
    assert.equal(data.version, "1.7.7");
  }
  for (const name of ["prisma", "@prisma/client"]) assert.equal(JSON.parse(readFileSync(new URL("../../node_modules/" + name + "/package.json", import.meta.url), "utf8")).version, "7.10.1");
  assert.equal(typeof betterAuth, "function"); assert.equal(typeof prismaAdapter, "function"); assert.equal(typeof emailOTP, "function");
});
test("all installed core scalar fields/types/nullability fit the proposed eight-table schema", () => {
  const schema = readFileSync(new URL("../../prisma/product/schema.prisma", import.meta.url), "utf8");
  const models = Object.fromEntries([...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)].map(([, name, body]) => [name, body]));
  const types = {string: "String", boolean: "Boolean", date: "DateTime", number: "Int"};
  const tables = getAuthTables({plugins: [emailOTP({sendVerificationOTP: async () => assert.fail()})]});
  assert.deepEqual(Object.keys(tables).sort(), ["account", "session", "user", "verification"]);
  for (const [name, table] of Object.entries(tables)) {
    const body = models[name[0].toUpperCase() + name.slice(1)]; assert.ok(body);
    assert.match(body, /id String @id/u);
    for (const [field, options] of Object.entries(table.fields)) {
      const line = body.split("\n").find(line => line.trim().startsWith(field + " ")); assert.ok(line, name + "." + field);
      assert.ok(line.trim().startsWith(field + " " + types[options.type]), name + "." + field);
      if (options.required) assert.ok(!line.trim().startsWith(field + " " + types[options.type] + "?"), name + "." + field);
    }
  }
  assert.equal(Object.keys(models).length, 8);
  assert.match(models.User, /email String @unique @map\("emailCanonical"\)/u);
  assert.match(models.Account, /@@unique\(\[providerId,accountId\]\)/u);
  assert.match(models.Session, /token String @unique/u);
});
test("public Prisma adapter addresses Prisma email, never the physical emailCanonical column", async () => {
  let data;
  const adapter = prismaAdapter({user: {create: async args => {data = args.data; return args.data;}}}, {provider: "postgresql", transaction: false})({logger: {disabled: true}});
  await adapter.create({model: "user", data: {name: "Synthetic", email: canonical, emailVerified: false}});
  assert.equal(data.email, canonical); assert.equal(Object.hasOwn(data, "emailCanonical"), false);
});
test("transaction:false keeps signup and server-only OTP creation on supplied delegates, no nested transaction/session/email", async () => {
  const f = fixture(); const result = await signup(f);
  assert.equal(result.token, null); assert.equal(f.rows.user.length, 1); assert.equal(f.rows.account.length, 1);
  assert.equal(f.rows.user[0].emailVerified, false); assert.equal(f.rows.session.length, 0);
  assert.equal(f.rows.account[0].providerId, "credential"); assert.equal(f.rows.account[0].accountId, f.rows.user[0].id);
  assert.equal(f.rows.verification.length, 0);
  const start = Date.now(); assert.equal(await challenge(f), code);
  assert.equal(f.rows.verification.length, 1); assert.equal(f.rows.verification[0].value, await otpHash(code) + ":0");
  assert.ok(f.rows.verification[0].expiresAt.getTime() >= start + 299_000);
  assert.ok(f.rows.verification[0].expiresAt.getTime() <= Date.now() + 301_000);
  assert.equal(f.rows.session.length, 0);
  assert.equal(f.auth.api.createVerificationOTP.path, undefined);
});
test("library-owned transaction encloses hashing and delegates; database after-hook follows its return", async () => {
  const f = fixture({transaction: true}); await signup(f);
  assert.ok(f.events.indexOf("adapter.transaction.begin") < f.events.indexOf("password.hash"));
  assert.ok(f.events.indexOf("adapter.transaction.return") > f.events.indexOf("account.create"));
  assert.ok(f.events.indexOf("user.after") > f.events.indexOf("adapter.transaction.return"));
});
test("inline email callback failure is swallowed by library background-or-await helper", async () => {
  let callbackFailed = false;
  const f = fixture({verification: {sendOnSignUp: true}, plugin: {overrideDefaultEmailVerification: true,
    sendVerificationOTP: async () => {callbackFailed = true; throw new Error("Synthetic outbox failure");}}});
  const result = await signup(f);
  assert.equal(callbackFailed, true); assert.equal(result.token, null);
  assert.equal(f.rows.user.length, 1); assert.equal(f.rows.account.length, 1); assert.equal(f.rows.verification.length, 1);
});
test("automatic signup OTP after-hook writes after the library transaction callback returns", async () => {
  let deliveryCallbacks = 0;
  const f = fixture({transaction: true, plugin: {sendVerificationOnSignUp: true, sendVerificationOTP: async () => {deliveryCallbacks++;}}});
  await signup(f);
  assert.ok(f.events.indexOf("verification.create") > f.events.indexOf("adapter.transaction.return"));
  assert.equal(deliveryCallbacks, 1); // Callback observation only: no email transport exists.
});
test("duplicate signup may return a synthetic user; returned user alone is no creation receipt", async () => {
  const f = fixture(); const first = await signup(f), second = await signup(f);
  assert.equal(f.rows.user.length, 1); assert.equal(f.rows.account.length, 1);
  assert.notEqual(first.user.id, second.user.id); assert.equal(second.token, null);
});
test("custom hash callback receives exact whitespace/Unicode and passwords above 128 with configured maximum override", async () => {
  for (const value of [" Synthetic exact password ", "synthetic-\u00e9-password", "synthetic-e\u0301-password", "x".repeat(129)]) {
    const f = fixture(); await signup(f, value); assert.equal(f.getHashInput(), value);
  }
});
test("unverified credential sign-in creates no session", async () => {
  const f = fixture(); await signup(f);
  await assert.rejects(f.auth.api.signInEmail({body: {email: canonical, password: " Synthetic exact password "}}), error => error.statusCode === 403);
  assert.equal(f.rows.session.length, 0);
});
test("OTP verification preserves leading zeros, consumes challenge and creates no automatic session", async () => {
  const f = fixture(); await signup(f); await challenge(f);
  await f.auth.api.verifyEmailOTP({body: {email: canonical, otp: code}});
  assert.equal(f.rows.user[0].emailVerified, true); assert.equal(f.rows.verification.length, 0); assert.equal(f.rows.session.length, 0);
  await assert.rejects(f.auth.api.verifyEmailOTP({body: {email: canonical, otp: code}}));
});
test("three invalid OTP attempts exhaust the challenge and unknown-user OTP sign-in cannot sign up", async () => {
  const f = fixture(); await signup(f); await challenge(f);
  for (let i = 0; i < 3; i++) {
    await assert.rejects(f.auth.api.verifyEmailOTP({body: {email: canonical, otp: "999999"}}));
    assert.equal(f.rows.verification.length, 1); assert.ok(f.rows.verification[0].value.endsWith(":" + (i + 1)));
  }
  await assert.rejects(f.auth.api.verifyEmailOTP({body: {email: canonical, otp: code}}));
  assert.equal(f.rows.verification.length, 0);
  assert.equal(f.rows.user[0].emailVerified, false); assert.equal(f.rows.session.length, 0);
  const unknown = fixture(); await challenge(unknown, "sign-in");
  await assert.rejects(unknown.auth.api.signInEmailOTP({body: {email: canonical, otp: code}}));
  assert.equal(unknown.rows.user.length, 0); assert.equal(unknown.rows.account.length, 0); assert.equal(unknown.rows.session.length, 0); assert.equal(unknown.rows.verification.length, 0);
});
test("OTP password reset can add a credential to a passwordless user: product must gate this path", async () => {
  const f = fixture();
  f.rows.user.push({id: "synthetic-client", name: "Synthetic Client", email: canonical, emailVerified: true, createdAt: new Date(), updatedAt: new Date()});
  await challenge(f, "forget-password");
  await f.auth.api.resetPasswordEmailOTP({body: {email: canonical, otp: code, password: " Synthetic exact password "}});
  assert.equal(f.rows.account.length, 1); assert.equal(f.rows.account[0].providerId, "credential");
});
test("approved ASCII email policy matches Better Auth; UTF-16 length checks still need code-point guard", () => {
  assert.equal(signupSchema.safeParse({name: "Synthetic", email: "\u00f2la@example.invalid", password: "synthetic password"}).success, false);
  assert.equal(z.email().safeParse("\u00f2la@example.invalid").success, false);
  const short = "\u{1F9F5}".repeat(6); assert.equal(short.length, 12);
  assert.equal(signupSchema.safeParse({name: "Synthetic", email: canonical, password: short}).success, false);
});
