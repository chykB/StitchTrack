import {request as httpRequest} from "node:http";
import {pathToFileURL} from "node:url";

export function authorizeEvidence(args, env) {
  if (env.NODE_ENV === "production" || env.TASK04_BREACH_EVIDENCE_CONFIRMED !== "true" || args.length !== 1 || args[0] !== "--owner-check") {
    throw new Error("Explicit owner consent and exact --owner-check command required.");
  }
}
export function verifyRejection(status, headers, body) {
  const allowed = ["error", "fields", "message", "accountCreated", "sessionCreated", "persisted", "emailSent"];
  if (status !== 422 || headers.has("set-cookie") || headers.get("cache-control") !== "no-store" ||
      !body || typeof body !== "object" || Object.keys(body).some(key => !allowed.includes(key)) ||
      body.error !== "password_breached" || JSON.stringify(body.fields) !== '["password"]' ||
      body.message !== "This password has appeared in a data breach. Choose a different password." ||
      ["accountCreated", "sessionCreated", "persisted", "emailSent"].some(key => body[key] !== false)) {
    throw new Error("Expected genuine breach rejection not observed. Preserve the result; no authentication success is claimed.");
  }
}
async function requestRejection() {
  // Fixed public known-compromised candidate only; never take user credentials or print this body.
  const body = JSON.stringify({name: "Synthetic Tailor", email: "breach-demo@example.invalid", password: "password1234"});
  return await new Promise((resolve, reject) => {
    const req = httpRequest({hostname: "127.0.0.1", port: 3110, path: "/api/auth/signup", method: "POST", agent: false,
      headers: {"content-type": "application/json", "content-length": Buffer.byteLength(body)}}, res => {
      let size = 0; const chunks = [];
      res.on("data", chunk => {size += chunk.length; if (size > 8192) {res.destroy(); reject(new Error("Unexpected response size."));} else chunks.push(chunk);});
      res.on("error", () => reject(new Error("Response interrupted.")));
      res.on("end", () => {
        console.log("HTTP status:", res.statusCode);
        try {resolve({status: res.statusCode, headers: new Headers(Object.entries(res.headers).flatMap(([key, value]) =>
          value === undefined ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]])), body: JSON.parse(Buffer.concat(chunks).toString("utf8"))});}
        catch {reject(new Error("Unexpected response format; raw response omitted."));}
      });
    });
    req.setTimeout(30_000, () => req.destroy());
    req.on("error", () => reject(new Error("Local HTTP request failed; no automatic retry.")));
    req.end(body);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    authorizeEvidence(process.argv.slice(2), process.env);
    console.log("Owner HTTP breach-check evidence: POST http://127.0.0.1:3110/api/auth/signup");
    console.log("Fixed public synthetic payload; password and hash omitted. Live HIBP prefix request occurs on the server.");
    const result = await requestRejection();
    verifyRejection(result.status, result.headers, result.body);
    console.log("cache-control:", result.headers.get("cache-control"));
    console.log(JSON.stringify(result.body));
    console.log("Actual HTTP breach rejection observed; no account, session, persistence or email action.");
  } catch (error) {console.error("STOP: " + error.message); process.exitCode = 1;}
}
