import { submitEnquiry } from "../../../../lib/assessment/enquiry";
import type { Persist } from "../../../../lib/assessment/enquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const persist: Persist = async (input, requestId) => {
  // Loaded only after the local-development gate and validation pass.
  const { persistEnquiry } = await import("../../../../lib/assessment/prisma");
  return persistEnquiry(input, requestId);
};

export async function POST(request: Request): Promise<Response> {
  return submitEnquiry(request, {
    env: process.env,
    persist,
    log: entry => console.info(JSON.stringify(entry)),
  });
}
