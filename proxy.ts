import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAuthState } from "./lib/auth/state";
import { verificationPreviewAllowed } from "./lib/auth/verification-preview";

export function proxy(request: NextRequest) {
  if(new URL(request.url).pathname==="/dashboard"){
    // Next's interactive dashboard needs its framework scripts. Use a fresh
    // nonce rather than allowing arbitrary inline script/style content.
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,"0")).join("");
    const development=process.env.NODE_ENV==="development";
    const policy=`default-src 'none'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development?" 'unsafe-eval'":""}; style-src 'self' 'nonce-${nonce}'; connect-src 'self'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
    const headers=new Headers(request.headers);headers.set("content-security-policy",policy);headers.set("x-nonce",nonce);
    const response=NextResponse.next({request:{headers}});
    response.headers.set("content-security-policy",policy);response.headers.set("cache-control","no-store");response.headers.set("referrer-policy","no-referrer");response.headers.set("x-content-type-options","nosniff");response.headers.set("x-robots-tag","noindex, nofollow");
    return response;
  }
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

export const config = { matcher: ["/auth", "/dashboard"] };
