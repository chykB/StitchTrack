import { validationTimingRequest } from "../../../../lib/assessment/validation-timing.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(request:Request):Promise<Response> {return validationTimingRequest(request,process.env);}
export {handle as POST,handle as GET,handle as HEAD,handle as OPTIONS,handle as PUT,handle as PATCH,handle as DELETE};
