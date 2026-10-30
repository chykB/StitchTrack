import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../../scripts/register-server-only.mjs";
import { timingSummary } from "../../scripts/benchmark-passwords.mjs";
import { PASSWORD_MIN, signupPasswordSchema } from "../../lib/auth/schemas.ts";

const { hashPassword, verifyPassword, ARGON2ID_PARAMETERS, PASSWORD_SALT_BYTES, PasswordHashingError } =
  await import("../../lib/auth/password.server.ts");

const password = " Synthetic passphrase 🧵 ";
let first, second;
test.before(async () => {
  first = await hashPassword(password);
  second = await hashPassword(password);
});

test("same password creates different random salts and hashes, both verifying successfully", async () => {
  assert.ok(first !== second);
  assert.ok(first.split("$")[4] !== second.split("$")[4]);
  assert.equal(await verifyPassword({ password, hash: first }), true);
  assert.equal(await verifyPassword({ password, hash: second }), true);
});

test("encoded hashes use the explicit initial Argon2id profile", () => {
  assert.equal(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/.test(first), true);
  assert.equal(ARGON2ID_PARAMETERS.algorithm, 2);
  assert.equal(ARGON2ID_PARAMETERS.version, 1);
  assert.equal(ARGON2ID_PARAMETERS.memoryCost, 65536);
  assert.equal(ARGON2ID_PARAMETERS.timeCost, 3);
  assert.equal(ARGON2ID_PARAMETERS.parallelism, 1);
  assert.equal(ARGON2ID_PARAMETERS.outputLen, 32);
  assert.equal(PASSWORD_SALT_BYTES, 16);
  assert.equal(Buffer.from(first.split("$")[4], "base64").length, 16);
  assert.equal(Buffer.from(first.split("$")[5], "base64").length, 32);
  assert.equal(Object.isFrozen(ARGON2ID_PARAMETERS), true);
});

test("incorrect passwords, altered case, and leading/trailing whitespace differences fail", async () => {
  for (const altered of ["wrong password", password.trim(), password.trimStart(), password.trimEnd(), password.toLowerCase()]) {
    assert.equal(await verifyPassword({ password: altered, hash: first }), false);
  }
  assert.equal(await verifyPassword({ password, hash: first }), true);
});

test("Unicode composed and decomposed strings are distinct credentials", async () => {
  const decomposed = "Cafe\u0301 synthetic passphrase";
  const composed = decomposed.normalize("NFC");
  const encoded = await hashPassword(decomposed);
  assert.equal(await verifyPassword({ password: decomposed, hash: encoded }), true);
  assert.equal(await verifyPassword({ password: composed, hash: encoded }), false);
});

test("malformed, unsupported and excessive-cost hashes fail closed without raw exceptions", async () => {
  const malformed = ["", "not a hash", "$argon2id$v=19$bad", first.slice(0, -12),
    first.replace("$argon2id$", "$argon2i$"), first.replace("$v=19$", "$v=16$"),
    first.replace("m=65536", "m=4294967295"), first.replace("t=3", "t=999"),
    first.replace("p=1", "p=255"), "x".repeat(1000), null, undefined];
  for (const encoded of malformed) {
    assert.equal(await verifyPassword({ password, hash: encoded }), false);
  }
  assert.equal(await verifyPassword(null), false);
});

test("invalid Unicode is rejected instead of silently replacing isolated surrogates", async () => {
  await assert.rejects(hashPassword("\ud800"), error =>
    error instanceof PasswordHashingError && error.message === "Password hashing is unavailable." && !error.cause);
  assert.equal(await verifyPassword({ password: "\ud800", hash: first }), false);
});

test("hashing remains a primitive and does not change the 12-code-point Signup policy", async () => {
  assert.equal(PASSWORD_MIN, 12);
  assert.equal(signupPasswordSchema.safeParse("a".repeat(11)).success, false);
  assert.equal(signupPasswordSchema.safeParse("a".repeat(12)).success, true);
  assert.equal(signupPasswordSchema.safeParse("a".repeat(129)).success, true);
  const long = "x".repeat(129) + " ";
  const encoded = await hashPassword(long);
  assert.equal(await verifyPassword({ password: long, hash: encoded }), true);
  assert.equal(await verifyPassword({ password: long.slice(0, 128), hash: encoded }), false);
});

test("utilities do not log passwords/hashes or make external requests", async t => {
  for (const method of ["log", "info", "warn", "error"]) {
    t.mock.method(console, method, () => assert.fail("No application logging"));
  }
  t.mock.method(globalThis, "fetch", () => assert.fail("No network request"));
  assert.equal(await verifyPassword({ password, hash: first }), true);
  assert.equal(await verifyPassword({ password: "wrong", hash: first }), false);
  assert.equal(await verifyPassword({ password, hash: "invalid" }), false);
  const encoded = await hashPassword(password);
  assert.equal(await verifyPassword({ password, hash: encoded }), true);
});

test("server marker remains in the utility; SHA-256 is absent from credential code", () => {
  const source = readFileSync(new URL("../../lib/auth/password.server.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /sha256|createHash|console\.|fetch\(|localStorage|sessionStorage|\.trim\(|\.toLowerCase\(|\.normalize\(/);
});

test("benchmark arithmetic uses measured totals; importing it does not run the benchmark", () => {
  // Artificial arithmetic fixtures only: these are not recorded measurements.
  assert.deepEqual(timingSummary(120, 6), {
    totalMs: 120, operations: 6, meanMs: 20, operationsPerSecond: 50,
  });
  for (const [total, count] of [[0, 5], [-1, 5], [NaN, 5], [Infinity, 5], [1, 0], [1, 1.5]]) {
    assert.throws(() => timingSummary(total, count));
  }
});
