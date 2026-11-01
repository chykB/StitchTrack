import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAuthState } from "./lib/auth/state";
import { verificationPreviewAllowed } from "./lib/auth/verification-preview";

export function proxy(request: NextRequest) {
  const mode = resolveAuthState(new URL(request.url).search, request.headers.get("rsc") === "1");
  if (mode === null || (mode === "verify" && !verificationPreviewAllowed(process.env, request.headers.get("host")))) {
    // Reject before streaming can commit a 200 response. Let Next render its
    // built-in not-found route; unrelated paths never enter this matcher.
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }
  const headers = new Headers(request.headers);
  // Always replace caller-supplied state. This is a navigation hint, not auth.
  headers.set("x-stitchtrack-auth-state", mode);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/auth"] };
