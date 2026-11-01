type VerificationPreviewEnvironment = { NODE_ENV?: string; ENABLE_CODE_INPUT_EXPERIMENT?: string };

// UI availability only, not authentication. Keep the existing opt-in flag for local setup compatibility.
// Bind development to loopback; do not expose this unfinished verification view through a public proxy.
export function verificationPreviewAllowed(env: VerificationPreviewEnvironment, host: string | null): boolean {
  if (env.NODE_ENV !== "development" || env.ENABLE_CODE_INPUT_EXPERIMENT !== "true" || !host) return false;
  try {
    const url = new URL("http://" + host);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.host.toLowerCase() === host.toLowerCase() &&
      url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
