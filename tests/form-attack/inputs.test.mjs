import test from "node:test";
import assert from "node:assert/strict";
import { attackCases, observeAttack } from "./cases.mjs";

for (const item of attackCases) {
  test(item.id + ": " + item.label, () => {
    const observed = observeAttack(item);
    console.log("ATTACK_RESULT " + JSON.stringify(observed));
    const blocked = observed.outcome === "BLOCKED" || observed.outcome === "BLOCKED_FORMAT";
    assert.equal(blocked, item.blocked, item.id);
    assert.equal(observed.inputPreserved, true);
    if (!blocked && item.mode !== "verify") assert.equal(observed.unavailable, true);
  });
}
