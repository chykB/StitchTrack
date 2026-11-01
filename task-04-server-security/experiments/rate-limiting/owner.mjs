import {request as httpRequest} from "node:http";
import {pathToFileURL} from "node:url";
import {timingFixtures} from "../../../lib/assessment/validation-timing-fixtures.ts";
import {IP_RATE_MARKER, IP_RATE_POLICIES} from "../../../lib/assessment/ip-rate-limit.ts";

export function authorizeOwner(args, env) {
  if (env.NODE_ENV === "production" || env.TASK04_RATE_LIMIT_OWNER_CONFIRMED !== "true" ||
      args.length !== 1 || !["--trigger", "--bypass"].includes(args[0])) {
    throw new Error("Explicit owner confirmation and exact trigger/bypass command required.");
  }
  return args[0];
}
export function verifyObservation(result, expectedPeer, expectedStatus) {
  if (result.status !== expectedStatus || result.localAddress !== expectedPeer ||
      result.headers["x-stitchtrack-observed-peer"] !== expectedPeer ||
      !/^[a-f0-9-]{36}$/.test(result.headers["x-stitchtrack-rate-instance"] ?? "") ||
      result.headers["set-cookie"] || result.body.assessmentFixture !== IP_RATE_MARKER ||
      ["accountCreated", "sessionCreated", "persisted", "emailSent"].some(key => result.body[key] !== false)) {
    throw new Error("Unexpected HTTP status, peer, instance, cookie or assessment response; preserve output and stop.");
  }
  if (expectedStatus === 429 && (result.body.error !== "rate_limited" || !(Number(result.headers["retry-after"]) > 0))) {
    throw new Error("A genuine unexpired 429 is required.");
  }
  if (expectedStatus === 200 && result.body.outcome !== "assessment_request_admitted") throw new Error("No assessment admission.");
  return result.headers["x-stitchtrack-rate-instance"];
}
function send(localAddress) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(timingFixtures.signup);
    let actualLocal;
    const req = httpRequest({hostname: "127.0.0.1", port: 3108, path: "/api/auth/signup", method: "POST", localAddress,
      agent: false, headers: {"content-type": "application/json", "content-length": Buffer.byteLength(body),
        "x-stitchtrack-assessment": IP_RATE_MARKER}}, res => {
      const chunks = []; let size = 0;
      res.on("data", chunk => {size += chunk.length; if (size > 8192) {res.destroy(); reject(new Error("Unexpected oversized response."));} else chunks.push(chunk);});
      res.on("error", () => reject(new Error("Response interrupted.")));
      res.on("end", () => {
        try {resolve({status: res.statusCode, headers: res.headers, localAddress: actualLocal,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8"))});}
        catch {reject(new Error("Unexpected non-JSON response."));}
      });
    });
    req.on("socket", socket => socket.once("connect", () => {actualLocal = socket.localAddress;}));
    req.setTimeout(10_000, () => req.destroy(new Error("Request timed out.")));
    req.on("error", () => reject(new Error("Local HTTP connection failed; no retry or forwarded-header fallback.")));
    req.end(body);
  });
}
function printResult(result) {
  // The server accepts only a fixed synthetic fixture. Do not print submitted credentials.
  console.log("HTTP", result.status, "client socket.localAddress=" + result.localAddress);
  for (const key of ["x-stitchtrack-observed-peer", "x-stitchtrack-rate-instance", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after", "cache-control"]) {
    if (result.headers[key] !== undefined) console.log(key + ": " + result.headers[key]);
  }
  console.log(JSON.stringify(result.body));
}
export async function runOwner(mode) {
  let instance;
  const step = async (peer, status) => {
    console.log("Actual HTTP POST http://127.0.0.1:3108/api/auth/signup; kernel localAddress=" + peer + "; fixed synthetic fixture; no forwarded-IP headers");
    const result = await send(peer); printResult(result);
    const observedInstance = verifyObservation(result, peer, status);
    if (instance && instance !== observedInstance) throw new Error("Server instance changed; no bypass proven.");
    instance = observedInstance;
  };
  if (mode === "--trigger") {
    for (let attempt = 1; attempt <= IP_RATE_POLICIES.signup.limit + 1; attempt++) {
      console.log("Attempt " + attempt);
      await step("127.0.0.1", attempt <= IP_RATE_POLICIES.signup.limit ? 200 : 429);
    }
    console.log("Trigger confirmed by actual HTTP 429. Capture the owner's real PNG; keep server running for bypass.");
  } else if (mode === "--bypass") {
    await step("127.0.0.1", 429);
    await step("127.0.0.2", 200);
    await step("127.0.0.1", 429);
    console.log("Actual source-IP bypass observed: alternate peer admitted while original peer remains blocked in the same process. No authentication performed.");
  } else throw new Error("Unsupported owner operation.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {await runOwner(authorizeOwner(process.argv.slice(2), process.env));}
  catch (error) {console.error("STOP: " + error.message); process.exitCode = 1;}
}
