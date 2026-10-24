import test from "node:test";
import assert from "node:assert/strict";
import {
  assessmentEnabled, isLocalHost, verifiedDatabaseConfig, applicationDatabaseConfig,
  offlinePrismaCommand, AssessmentConfigurationError,
} from "../../lib/assessment/config.ts";
import {
  submitEnquiry, databaseUnavailable, confirmedReceipt,
} from "../../lib/assessment/enquiry.ts";
import type { Persist, RequestLog } from "../../lib/assessment/enquiry.ts";

const enabled = { NODE_ENV: "development", ENABLE_PERSISTENCE_EXPERIMENT: "true" };
const configured = {
  ...enabled,
  EXPERIMENT_DATABASE_URL: "postgresql://assessment:synthetic-password@127.0.0.1:5433/synthetic_assessment?sslmode=disable",
  EXPERIMENT_EXPECTED_DATABASE: "synthetic_assessment",
  EXPERIMENT_EXPECTED_HOST: "127.0.0.1",
  EXPERIMENT_EXPECTED_PORT: "5433",
  EXPERIMENT_EXPECTED_USER: "assessment",
};
const input = { name: "Assessment Customer A", enquiry: "Synthetic enquiry: Ankara blouse fitting." };

function request(body: unknown = input, extra: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:3000/api/assessment/enquiries", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000",
      "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
}

function harness(persist?: Persist, env: Record<string, string | undefined> = enabled) {
  let writes = 0;
  const logs: RequestLog[] = [];
  const handler = (req: Request) => submitEnquiry(req, {
    env, log: entry => logs.push(entry),
    persist: async (data, requestId) => {
      writes++;
      return persist ? persist(data, requestId) :
        { id: writes, requestId, createdAt: new Date("2026-10-23T12:00:00.123Z") };
    },
  });
  return { handler, logs, writes: () => writes };
}

test("assessment is disabled by default and cannot be enabled in production or test", () => {
  for (const env of [{}, { NODE_ENV: "development" },
    { NODE_ENV: "production", ENABLE_PERSISTENCE_EXPERIMENT: "true" },
    { NODE_ENV: "test", ENABLE_PERSISTENCE_EXPERIMENT: "true" }]) {
    assert.equal(assessmentEnabled(env), false);
  }
  assert.equal(assessmentEnabled(enabled), true);
});

test("loopback host gate rejects remote, malformed and misleading hosts", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) assert.ok(isLocalHost(host));
  for (const host of [null, "example.com", "localhost.evil:3000", "localhost:3000/path",
    "user@localhost:3000", "localhost:3000\\evil", "localhost:3000 "]) assert.equal(isLocalHost(host), false);
});

test("verified database config has no DATABASE_URL or PG defaults", () => {
  assert.throws(() => verifiedDatabaseConfig({ DATABASE_URL: configured.EXPERIMENT_DATABASE_URL }), AssessmentConfigurationError);
  assert.throws(() => verifiedDatabaseConfig({ PGDATABASE: "development" }), AssessmentConfigurationError);
  assert.equal(verifiedDatabaseConfig(configured).url, configured.EXPERIMENT_DATABASE_URL);
});

test("every confirmed identity value is required and must match", () => {
  for (const key of ["EXPERIMENT_DATABASE_URL", "EXPERIMENT_EXPECTED_DATABASE",
    "EXPERIMENT_EXPECTED_HOST", "EXPERIMENT_EXPECTED_PORT", "EXPERIMENT_EXPECTED_USER"]) {
    assert.throws(() => verifiedDatabaseConfig({ ...configured, [key]: undefined }), AssessmentConfigurationError);
    assert.throws(() => verifiedDatabaseConfig({ ...configured, [key]: "wrong" }), AssessmentConfigurationError);
  }
  assert.throws(() => verifiedDatabaseConfig({ ...configured, NODE_ENV: "production" }), AssessmentConfigurationError);
});

test("connection overrides, missing explicit port and invalid URLs fail without credentials", () => {
  for (const url of [
    "postgresql://assessment:secret@127.0.0.1/synthetic_assessment",
    configured.EXPERIMENT_DATABASE_URL + "&host=development",
    configured.EXPERIMENT_DATABASE_URL + "&schema=other",
    configured.EXPERIMENT_DATABASE_URL + "&sslmode=disable",
    "not-a-url-secret",
  ]) {
    assert.throws(() => verifiedDatabaseConfig({ ...configured, EXPERIMENT_DATABASE_URL: url }),
      error => error instanceof AssessmentConfigurationError && !error.message.includes("secret"));
  }
});

test("failure override affects only application adapter and requires local development", () => {
  const env = { ...configured, EXPERIMENT_FAILURE_PORT: "65432" };
  assert.equal(verifiedDatabaseConfig(env).url, configured.EXPERIMENT_DATABASE_URL);
  const failed = applicationDatabaseConfig(env);
  assert.equal(failed.host, "127.0.0.1");
  assert.equal(failed.port, 65432);
  assert.equal(failed.database, configured.EXPERIMENT_EXPECTED_DATABASE);
  assert.equal(configured.EXPERIMENT_DATABASE_URL, verifiedDatabaseConfig(configured).url);
  assert.throws(() => applicationDatabaseConfig({ ...env, ENABLE_PERSISTENCE_EXPERIMENT: "false" }));
  for (const port of ["0", "65536", "invalid", "5433"]) {
    assert.throws(() => applicationDatabaseConfig({ ...configured, EXPERIMENT_FAILURE_PORT: port }));
  }
});

test("only known offline Prisma commands bypass datasource configuration", () => {
  assert.ok(offlinePrismaCommand(["generate"]));
  assert.ok(offlinePrismaCommand(["validate"]));
  assert.ok(offlinePrismaCommand(["migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma"]));
  for (const args of [["migrate", "deploy"], ["migrate", "status"], ["db", "pull"],
    ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma"]]) {
    assert.equal(offlinePrismaCommand(args), false);
  }
});

test("disabled and production requests cannot invoke persistence", async () => {
  for (const env of [{}, { NODE_ENV: "production", ENABLE_PERSISTENCE_EXPERIMENT: "true" }]) {
    const h = harness(undefined, env);
    assert.equal((await h.handler(request())).status, 404);
    assert.equal(h.writes(), 0);
  }
});

test("remote host, mismatched Host and cross-origin requests cannot persist", async () => {
  const h = harness();
  const remote = new Request("http://example.com/api/assessment/enquiries", {
    method: "POST", headers: { host: "example.com" }, body: JSON.stringify(input),
  });
  assert.equal((await h.handler(remote)).status, 404);
  assert.equal((await h.handler(request(input, { host: "localhost:3000" }))).status, 404);
  assert.equal((await h.handler(request(input, { origin: "http://evil.example" }))).status, 403);
  const absent = request(); absent.headers.delete("origin");
  assert.equal((await h.handler(absent)).status, 403);
  assert.equal(h.writes(), 0);
});

test("invalid input is rejected with field errors before persistence", async () => {
  const h = harness();
  const response = await h.handler(request({ name: " ", enquiry: "short" }));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.ok(body.fields.name); assert.ok(body.fields.enquiry);
  for (const invalid of [{ ...input, extra: "unexpected" }, { ...input, name: "a".repeat(81) },
    { ...input, enquiry: "a".repeat(501) }, { name: 10, enquiry: null }]) {
    assert.equal((await h.handler(request(invalid))).status, 422);
  }
  assert.equal(h.writes(), 0);
});

test("content type, malformed JSON and advertised oversized body are rejected", async () => {
  const h = harness();
  assert.equal((await h.handler(request(input, { "content-type": "text/plain" }))).status, 415);
  const bad = request();
  const malformed = new Request(bad.url, { method: "POST", headers: bad.headers, body: "{" });
  assert.equal((await h.handler(malformed)).status, 400);
  assert.equal((await h.handler(request(input, { "content-length": "9000" }))).status, 413);
  assert.equal(h.writes(), 0);
});

test("streamed body limit works without Content-Length", async () => {
  const h = harness();
  const original = request();
  const streamed = new Request(original.url, {
    method: "POST", headers: original.headers,
    body: new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(8200))); controller.close();
    } }), duplex: "half",
  } as RequestInit);
  assert.equal((await h.handler(streamed)).status, 413);
  assert.equal(h.writes(), 0);
});

test("201 is withheld until the write resolves and returns its actual ID and timestamp", async () => {
  let resolve!: (saved: { id: number; requestId: string; createdAt: Date }) => void;
  let capturedId = "";
  let received: unknown;
  const h = harness(async (data, requestId) => {
    capturedId = requestId; received = data;
    return new Promise(done => { resolve = done; });
  });
  let completed = false;
  const pending = h.handler(request({ name: "  " + input.name + "  ", enquiry: " " + input.enquiry + " " }))
    .then(response => { completed = true; return response; });
  await new Promise(done => setImmediate(done));
  assert.equal(completed, false);
  assert.equal(h.logs.length, 0);
  assert.deepEqual(received, input);
  resolve({ id: 42, requestId: capturedId, createdAt: new Date("2026-10-23T12:00:00.123Z") });
  const response = await pending;
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, { id: 42, requestId: capturedId, createdAt: "2026-10-23T12:00:00.123Z" });
  assert.equal(response.headers.get("x-request-id"), capturedId);
  assert.equal(h.logs[0].id, body.id);
  assert.equal(h.logs[0].createdAt, body.createdAt);
  assert.equal(h.logs[0].requestId, body.requestId);
  assert.equal(h.logs[0].status, 201);
});

test("two different synthetic submissions receive distinct receipts", async () => {
  const h = harness();
  const a = await (await h.handler(request())).json();
  const b = await (await h.handler(request({
    name: "Assessment Customer B", enquiry: "Synthetic enquiry: Senator suit adjustment.",
  }))).json();
  assert.notEqual(a.id, b.id); assert.notEqual(a.requestId, b.requestId);
  assert.equal(h.writes(), 2);
});

test("recognized transport failures return 503 without a success receipt", async () => {
  for (const code of ["P1001", "P1002", "P1017", "ECONNREFUSED", "ETIMEDOUT"]) {
    const h = harness(async () => { throw Object.assign(new Error("secret database URL"), { code }); });
    const response = await h.handler(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.ok(body.requestId); assert.equal(body.id, undefined); assert.equal(body.createdAt, undefined);
    assert.equal(h.logs[0].outcome, "database_unavailable");
    assert.equal(h.logs[0].id, undefined);
    assert.ok(!JSON.stringify([body, h.logs]).includes("secret"));
  }
});

test("authentication, missing tables, constraints and unknown errors return 500", async () => {
  for (const code of ["P1000", "P2021", "P2002", "28P01", "unknown"]) {
    const h = harness(async () => { throw Object.assign(new Error("postgres://private:secret@database"), { code }); });
    const response = await h.handler(request());
    assert.equal(response.status, 500);
    assert.ok(!JSON.stringify([await response.json(), h.logs]).includes("secret"));
  }
});

test("missing verified configuration returns 500 before any database adapter is needed", async () => {
  const h = harness(async () => {
    verifiedDatabaseConfig({ DATABASE_URL: "postgresql://development" });
    throw new Error("unreachable");
  });
  const response = await h.handler(request());
  assert.equal(response.status, 500);
  assert.equal(h.logs[0].outcome, "configuration_rejected");
});

test("logs contain only allowlisted metadata and synthetic input never appears", async () => {
  const h = harness();
  await h.handler(request());
  const keys = Object.keys(h.logs[0]).sort();
  assert.deepEqual(keys, ["event", "at", "requestId", "method", "path", "status",
    "durationMs", "outcome", "id", "createdAt"].sort());
  const serialized = JSON.stringify(h.logs);
  assert.ok(!serialized.includes(input.name));
  assert.ok(!serialized.includes(input.enquiry));
  assert.ok(Number.isFinite(h.logs[0].durationMs));
  assert.ok(!Number.isNaN(Date.parse(h.logs[0].at)));
});

test("invalid database receipts never produce a creation response", async () => {
  const h = harness(async () => ({ id: 10, requestId: crypto.randomUUID(), createdAt: new Date() }));
  assert.equal((await h.handler(request())).status, 500);
});

test("browser receipt check requires 201 and a complete well-typed receipt", () => {
  const receipt = { id: 1, requestId: crypto.randomUUID(), createdAt: "2026-10-23T12:00:00.123Z" };
  assert.deepEqual(confirmedReceipt(201, receipt), receipt);
  for (const status of [200, 202, 400, 500, 503]) assert.equal(confirmedReceipt(status, receipt), null);
  for (const value of [null, { success: true }, { ...receipt, id: -1 },
    { ...receipt, createdAt: "invalid" }, { ...receipt, requestId: "invalid" }]) {
    assert.equal(confirmedReceipt(201, value), null);
  }
});

test("error classification does not infer unavailability from messages or loop forever", () => {
  assert.equal(databaseUnavailable(new Error("ECONNREFUSED P1001")), false);
  assert.equal(databaseUnavailable({ cause: { code: "ECONNREFUSED" } }), true);
  const cyclic: { cause?: unknown } = {}; cyclic.cause = cyclic;
  assert.equal(databaseUnavailable(cyclic), false);
});
