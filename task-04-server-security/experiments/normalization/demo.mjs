// Owner-invoked terminal demonstration. Fixed synthetic fixtures only: no stdin,
// user-supplied email/password arguments, environment credentials or file writes.
import { pathToFileURL } from "node:url";
import { emailComparison,passwordComparison,unicodeAndCaseComparison } from "./comparison.ts";
export function authorizedMode(args, env) {
  if (env.NODE_ENV === "production" || env.TASK04_NORMALIZATION_EXPERIMENT !== "true" ||
      args.length !== 1 || !["--email", "--password-trim"].includes(args[0])) {
    throw new Error("Explicit owner synthetic comparison flag and one supported mode required.");
  }
  return args[0];
}
export function report(mode) {
  if(mode === "--email") {
    const result=emailComparison();
    console.log("EVIDENCE 09 DEMONSTRATION - fixed synthetic addresses, shared Signup/Login/Reset schemas");
    console.log("Parsed email: trim surrounding whitespace, then lowercase. Raw input stays unchanged.");
    console.table(result.rows);
    console.log("All equivalent synthetic inputs produce one canonical address:",result.equivalentInputs);
    console.log("No ownership check, account lookup, invitation authorization or registration occurred.");
  } else if(mode === "--password-trim") {
    console.log("EVIDENCE 10 DEMONSTRATION - ISOLATED assessment trim comparison");
    console.log("No passwords or hashes are printed. Rows contain only synthetic scenario metadata/results.");
    for (const row of passwordComparison()) console.log(JSON.stringify(row));
    console.log("Case and Unicode preservation:",JSON.stringify(unicodeAndCaseComparison()));
    console.log("trimmedEqualsBase may merge distinct strings; it does NOT mean successful sign-in.");
    console.log("Product policy: preserve accepted passwords exactly; assessment trim is NOT used by authentication.");
    console.log("Login is presence-only; Signup additionally enforces enrollment rules. Both preserve accepted characters.");
  } else throw new Error("Unsupported report mode.");
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { report(authorizedMode(process.argv.slice(2),process.env)); }
  catch { console.error("STOP: synthetic comparison did not complete; no successful evidence is claimed."); process.exitCode=1; }
}
