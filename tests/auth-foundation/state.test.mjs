import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthState } from "../../lib/auth/state.ts";

test("public auth state is an exact key-only allow-list", () => {
  for (const [search, expected] of [["", "login"], ["?login", "login"], ["?signup", "signup"], ["?reset", "reset"], ["?verify", "verify"]]) {
    assert.equal(resolveAuthState(search), expected);
  }
  for (const invalid of ["?mode=login", "?mode=forgot-password", "?smjshdsljf", "?login&signup", "?reset&reset", "?signup=", "?login=true", "?reset=1", "?LOGIN", "?login&", "?%6cogin", "?_rsc=x", "?constructor", "?verify=", "?verify=1", "?VERIFY", "?verify&verify", "?verify&signup", "?login&verify", "?reset&verify", "?mode=verify", "?verify&unknown", "?verify&", "?%76erify"]) {
    assert.equal(resolveAuthState(invalid), null, invalid);
  }
});

test("RSC transport serialization preserves the same state allow-list", () => {
  assert.equal(resolveAuthState("?signup=&_rsc=test", true), "signup");
  assert.equal(resolveAuthState("?reset&_rsc=test", true), "reset");
  assert.equal(resolveAuthState("?_rsc=test", true), "login");
  assert.equal(resolveAuthState("?verify=&_rsc=test", true), "verify");
  for (const invalid of ["?login=&signup=&_rsc=test", "?login=&login=&_rsc=test", "?mode=login&_rsc=test", "?reset=1&_rsc=test", "?unknown&_rsc=test", "?signup&_rsc=a&_rsc=b", "?verify=&login=&_rsc=test", "?verify=&verify=&_rsc=test", "?verify=1&_rsc=test"]) {
    assert.equal(resolveAuthState(invalid, true), null, invalid);
  }
});
