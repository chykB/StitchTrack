import "server-only";
import { localAssessmentRequest, type Environment } from "./config.ts";
import { VALIDATION_TIMING_MARKER, timingFixtures, matchesTimingFixture, type TimingOperation } from "./validation-timing-fixtures.ts";
import { authJson, decodeAuthRequest, parseAuthInput } from "../auth/request.server.ts";

// This fixed-synthetic no-op comparison never invokes any authentication service.
export async function validationTimingRequest(request:Request,env:Environment):Promise<Response> {
  if(env.NODE_ENV!=="development" || env.ENABLE_AUTH_VALIDATION_TIMING!=="true" || !localAssessmentRequest(request)) {
    return authJson({error:"not_found"},404);
  }
  const started=performance.now();
  if(request.headers.get("x-stitchtrack-assessment")!==VALIDATION_TIMING_MARKER)return authJson({error:"assessment_marker_required"},400);
  const operation=request.headers.get("x-stitchtrack-operation");
  const variant=request.headers.get("x-stitchtrack-validation");
  if(!operation || !Object.hasOwn(timingFixtures,operation) || (variant!=="baseline" && variant!=="validated"))return authJson({error:"unsupported_comparison"},400);
  const body=await decodeAuthRequest(request);if(!body.ok)return body.response;
  if(!matchesTimingFixture(operation as TimingOperation,body.value))return authJson({error:"fixed_synthetic_payload_required"},422);
  let schemaMs=0;
  if(variant==="validated") {
    const schemaStart=performance.now();
    const result=parseAuthInput(operation as TimingOperation,body.value);
    schemaMs=performance.now()-schemaStart;
    if(!result.ok)return authJson({error:"fixture_schema_mismatch"},500);
  }
  const handlerMs=performance.now()-started;
  return authJson({assessmentFixture:VALIDATION_TIMING_MARKER,outcome:"fixture_completed",
    accountCreated:false,sessionCreated:false,persisted:false,emailSent:false},200,{
    "server-timing":`handler;dur=${handlerMs.toFixed(6)}, schema;dur=${schemaMs.toFixed(6)}`,
    "x-stitchtrack-validation-variant":variant,
  });
}
