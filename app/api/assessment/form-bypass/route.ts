import { observeFormBypass } from "../../../../lib/assessment/form-bypass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gate all methods before revealing the temporary fixture. No production auth path is changed.
async function handle(request: Request): Promise<Response> {
  return observeFormBypass(request, process.env);
}
export {
  handle as POST, handle as GET, handle as HEAD, handle as OPTIONS,
  handle as PUT, handle as PATCH, handle as DELETE,
};
