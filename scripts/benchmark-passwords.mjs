import { createHash } from "node:crypto";
import { cpus, platform, arch, release } from "node:os";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// This script has no imported side effects: tests may import the arithmetic
// helper without executing a benchmark or loading the native hashing utility.
export function timingSummary(totalMs, operations) {
  if (!Number.isFinite(totalMs) || totalMs <= 0 ||
      !Number.isSafeInteger(operations) || operations <= 0) {
    throw new Error("Positive elapsed time and operation count are required.");
  }
  const meanMs = totalMs / operations;
  return { totalMs, operations, meanMs, operationsPerSecond: operations * 1000 / totalMs };
}

function printTiming(label, summary) {
  console.log(label + ": operations=" + summary.operations);
  console.log("elapsed_ms=" + summary.totalMs.toFixed(6));
  console.log("mean_ms_per_operation = " + summary.totalMs.toFixed(6) + " / " +
    summary.operations + " = " + summary.meanMs.toFixed(6));
  console.log("estimated_operations_per_second = " + summary.operations + " * 1000 / " +
    summary.totalMs.toFixed(6) + " = " + summary.operationsPerSecond.toFixed(3));
}

export async function main(args = []) {
  if (args.length > 1 || (args.length && !["--hashes", "--timings"].includes(args[0]))) {
    throw new Error("Usage: node scripts/benchmark-passwords.mjs [--hashes|--timings]");
  }
  await import("./register-server-only.mjs");
  const { hashPassword, verifyPassword, ARGON2ID_PARAMETERS, PASSWORD_SALT_BYTES } =
    await import("../lib/auth/password.server.ts");
  const require = createRequire(import.meta.url);
  const password = " StitchTrack synthetic benchmark passphrase 🧵 ";
  const metadata = {
    timestamp: new Date().toISOString(),
    node: process.version,
    os: platform(),
    release: release(),
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpus: cpus().length,
    argon2Package: require("@node-rs/argon2/package.json").version,
    parameters: ARGON2ID_PARAMETERS,
    saltBytes: PASSWORD_SALT_BYTES,
  };
  console.log("StitchTrack: manual synthetic-only password experiment");
  console.log(JSON.stringify(metadata, null, 2));
  console.log("No accounts, database, email or authentication session.");
  console.log("SHA-256 is benchmark comparison ONLY; never credential storage.");
  console.log("The password is fixed synthetic source data; no password arguments or environment input are accepted.");

  if (args[0] !== "--timings") {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    const firstVerified = await verifyPassword({ password, hash: first });
    const secondVerified = await verifyPassword({ password, hash: second });
    if (first === second || !firstVerified || !secondVerified) {
      throw new Error("Synthetic hash experiment failed.");
    }
    // Explicit evidence-mode stdout only; the application utilities never log hashes.
    console.log("Evidence 07: same synthetic password, independent random salts");
    console.log("synthetic_hash_1=" + first);
    console.log("synthetic_hash_2=" + second);
    console.log("different_hashes=" + (first !== second));
    console.log("first_verifies=" + firstVerified + "; second_verifies=" + secondVerified);
  }
  if (args[0] !== "--hashes") {
    const argonOperations = 5, shaOperations = 100000;
    // Warmups are outside both measured intervals.
    await hashPassword(password);
    for (let i = 0; i < 1000; i++) createHash("sha256").update(password, "utf8").digest();
    const argonStart = performance.now();
    for (let i = 0; i < argonOperations; i++) await hashPassword(password);
    const argonElapsed = performance.now() - argonStart;
    const shaStart = performance.now();
    for (let i = 0; i < shaOperations; i++) createHash("sha256").update(password, "utf8").digest();
    const shaElapsed = performance.now() - shaStart;
    console.log("Evidence 08: sequential local-machine measurements");
    printTiming("Argon2id (fresh salt + encoded hash + asynchronous scheduling)", timingSummary(argonElapsed, argonOperations));
    printTiming("SHA-256 (one unsalted digest; comparison only)", timingSummary(shaElapsed, shaOperations));
    console.log("Estimates describe this sequential program, not attacker GPU throughput or a deployment-load test.");
    console.log("Argon2id includes salt generation and PHC encoding; this is not a raw-KDF-only comparison.");
    console.log("Repeat manually on an idle machine; record load and power/thermal conditions.");
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(() => {
    console.error("Password experiment failed. No real credentials should be used.");
    process.exitCode = 1;
  });
}
