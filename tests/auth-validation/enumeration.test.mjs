import test from "node:test";
import assert from "node:assert/strict";
import { initialValidationState, reduceValidation, visibleErrors } from "../../lib/auth/validation.ts";

// Neither address represents a known account: no backend or database is involved.
for (const mode of ["login", "reset"]) {
  test(mode + ": different format-valid addresses produce the same unavailable state without account lookup", () => {
    const outcomes = ["tailor-a@example.com", "tailor-b@example.net"].map(email => {
      const state = reduceValidation(mode, initialValidationState(), {
        type: "submit", values: { email, password: mode === "login" ? "x" : "" },
      });
      return { unavailable: state.unavailable, errors: visibleErrors(mode, state), emailFormatActive: state.emailFormatActive };
    });
    assert.deepEqual(outcomes[0], { unavailable: true, errors: {}, emailFormatActive: false });
    assert.deepEqual(outcomes[1], outcomes[0]);
  });
}
