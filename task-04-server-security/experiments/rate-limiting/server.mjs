import "../../../scripts/register-server-only.mjs";
import {createServer} from "node:http";
import {Readable} from "node:stream";
import {randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {AssessmentIpLimiter, assessmentPeer} from "../../../lib/assessment/ip-rate-limit.ts";
const {assessmentRateRequest, rateExperimentEnabled} = await import("../../../lib/assessment/auth-rate-limit.server.ts");

export function authorizeServer(args, env) {
  if (args.length !== 1 || args[0] !== "--owner-serve" || !rateExperimentEnabled(env)) {
    throw new Error("Explicit owner CLI, development mode and rate-limit flag required.");
  }
}
// No listener, external request or environment/credential loading occurs on import.
export function createAssessmentServer(env) {
  if (!rateExperimentEnabled(env)) throw new Error("Development-only experiment is disabled.");
  const limiter = new AssessmentIpLimiter(), instance = randomUUID();
  const server = createServer(async (incoming, outgoing) => {
    let status = 500;
    const peer = assessmentPeer(incoming.socket.remoteAddress);
    try {
      const rawPath = incoming.url ?? "";
      if (!rawPath.startsWith("/") || rawPath.startsWith("//")) throw new Error("Invalid request target.");
      const request = new Request("http://127.0.0.1:3108" + rawPath, {
        method: incoming.method, headers: incoming.headers,
        ...(["GET", "HEAD"].includes(incoming.method ?? "GET") ? {} : {body: Readable.toWeb(incoming), duplex: "half"}),
      });
      const response = await assessmentRateRequest(request, incoming.socket.remoteAddress, env, limiter, instance);
      status = response.status;
      // Close instead of retaining any unread rejected body. No body/header/credential logging.
      outgoing.writeHead(status, {...Object.fromEntries(response.headers), connection: "close"});
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(503, {"content-type": "application/json", "cache-control": "no-store", connection: "close"});
      outgoing.end(JSON.stringify({error: "assessment_unavailable"}));
      status = 503;
    }
    console.log(JSON.stringify({assessment: "ip-rate-limit-v1", peer: peer ?? "rejected", status, instance}));
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.timeout = 15_000;
  server.maxHeadersCount = 32;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    authorizeServer(process.argv.slice(2), process.env);
    const server = createAssessmentServer(process.env);
    server.on("error", () => {console.error("Assessment listener failed; stop and inspect port availability."); process.exitCode = 1;});
    server.listen(3108, "127.0.0.1", () => console.log("Assessment IP-only limiter: http://127.0.0.1:3108; no authentication/DB/email. Stop with Ctrl+C."));
  } catch {
    console.error("STOP: owner-only local development rate-limit server not authorized."); process.exitCode = 1;
  }
}
