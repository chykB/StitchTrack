import "server-only";
import { localAssessmentRequest, type Environment } from "../assessment/config.ts";
import { authJson, validateAuthRequest, type AuthOperation } from "./request.server.ts";

// Genuine HTTP validation boundaries, not functioning authentication endpoints.
export async function previewAuthRequest(request:Request,operation:AuthOperation,env:Environment):Promise<Response> {
  if(env.NODE_ENV!=="development" || env.ENABLE_AUTH_VALIDATION_PREVIEW!=="true" || !localAssessmentRequest(request)) {
    return authJson({error:"not_found"},404);
  }
  return validateAuthRequest(request,operation,async()=>authJson({error:"authentication_unavailable",
    accountCreated:false,sessionCreated:false,persisted:false,emailSent:false},503));
}
