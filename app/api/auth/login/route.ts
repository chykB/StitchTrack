import { previewAuthRequest } from "../../../../lib/auth/validation-preview.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(request:Request):Promise<Response> {
  return previewAuthRequest(request,"login",process.env);
}
export {handle as POST,handle as GET,handle as HEAD,handle as OPTIONS,handle as PUT,handle as PATCH,handle as DELETE};
