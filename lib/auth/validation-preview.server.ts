import "server-only";
import { localAssessmentRequest, type Environment } from "../assessment/config.ts";
import { authJson, validateAuthRequest, type AuthOperation } from "./request.server.ts";
import {checkPwnedPassword, type BreachCheckResult} from "./breach-check.server.ts";

// Genuine HTTP validation boundaries, not functioning authentication endpoints.
export async function previewAuthRequest(request:Request,operation:AuthOperation,env:Environment,
  dependencies:{checkPassword?:(password:string)=>Promise<BreachCheckResult>}={}):Promise<Response> {
  if(env.NODE_ENV!=="development" || env.ENABLE_AUTH_VALIDATION_PREVIEW!=="true" || !localAssessmentRequest(request)) {
    return authJson({error:"not_found"},404);
  }
  return validateAuthRequest(request,operation,async input=>{
    const noActions={accountCreated:false,sessionCreated:false,persisted:false,emailSent:false};
    // Opt-in external lookup only in this already local-development-only preview.
    // A future real registration service must require the prerequisite unconditionally.
    if(input.operation==="signup" && env.ENABLE_AUTH_BREACH_CHECK==="true") {
      let result:BreachCheckResult="unavailable";
      try {result=await (dependencies.checkPassword ?? checkPwnedPassword)(input.data.password);} catch { /* Fail closed. */ }
      if(result==="breached") return authJson({error:"password_breached",fields:["password"],
        message:"This password has appeared in a data breach. Choose a different password.",...noActions},422);
      if(result!=="not_found") return authJson({error:"password_check_unavailable",
        message:"We cannot check your password right now. Please try again later.",...noActions},503,{"retry-after":"30"});
    }
    return authJson({error:"authentication_unavailable",...noActions},503);
  });
}
