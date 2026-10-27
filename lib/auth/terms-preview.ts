import type { AuthMode } from "./state";

export type DraftTermsPreview = { terms: string; privacy: string };
type PreviewEnvironment = { NODE_ENV?: string; ENABLE_AUTH_TERMS_PREVIEW?: string };

export function draftPreviewAllowed(env: PreviewEnvironment, host: string | null): boolean {
  if (env.NODE_ENV !== "development" || env.ENABLE_AUTH_TERMS_PREVIEW !== "true" || !host) return false;
  try {
    const url = new URL("http://" + host);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.host.toLowerCase() === host.toLowerCase() &&
      url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

// The loader is never invoked outside the explicitly enabled local development preview.
export async function loadDraftTermsPreview(
  mode: AuthMode, env: PreviewEnvironment, host: string | null,
  load: () => Promise<DraftTermsPreview>,
): Promise<DraftTermsPreview | undefined> {
  if (mode !== "signup" || !draftPreviewAllowed(env, host)) return undefined;
  return load();
}
