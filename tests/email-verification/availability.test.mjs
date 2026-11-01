import test from "node:test";
import assert from "node:assert/strict";
import { verificationPreviewAllowed } from "../../lib/auth/verification-preview.ts";

const enabled = { NODE_ENV: "development", ENABLE_CODE_INPUT_EXPERIMENT: "true" };

test("unfinished verification is default-off and cannot activate in production or test", () => {
  for (const env of [{}, { NODE_ENV: "development" }, { ...enabled, ENABLE_CODE_INPUT_EXPERIMENT: "TRUE" },
    { ...enabled, NODE_ENV: "production" }, { ...enabled, NODE_ENV: "test" }])
    assert.equal(verificationPreviewAllowed(env, "127.0.0.1:3000"), false);
});
test("verification availability requires explicit opt-in and a canonical approved loopback Host", () => {
  for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"])
    assert.equal(verificationPreviewAllowed(enabled, host), true, host);
  for (const host of [null, "", "example.com", "localhost.evil.test", "127.0.0.2", "0.0.0.0:3000",
    "user@localhost:3000", "localhost:3000/path", "localhost:3000?x", " localhost:3000",
    "localhost:3000#x", "localhost:3000,example.com", "localhost:99999"])
    assert.equal(verificationPreviewAllowed(enabled, host), false, String(host));
});
