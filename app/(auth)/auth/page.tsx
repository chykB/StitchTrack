import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadDraftTermsPreview } from "../../../lib/auth/terms-preview";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveAuthState } from "../../../lib/auth/state";
import AuthScreen from "./AuthScreen";
import EmailVerificationForm from "../_components/EmailVerificationForm";
import { verificationPreviewAllowed } from "../../../lib/auth/verification-preview";

async function authState() {
  const requestHeaders = await headers();
  const state = requestHeaders.get("x-stitchtrack-auth-state");
  const mode = state === null ? null : resolveAuthState("?" + state);
  if (mode === null || (mode === "verify" && !verificationPreviewAllowed(process.env, requestHeaders.get("host")))) notFound();
  return mode;
}

export async function generateMetadata(): Promise<Metadata> {
  const mode = await authState();
  const titles = {
    signup: "Create your tailor account | StitchTrack",
    login: "Tailor login | StitchTrack",
    reset: "Reset your password | StitchTrack",
    verify: "Verify your email | StitchTrack",
  };
  return { title: titles[mode] };
}

export default async function AuthPage() {
  const mode = await authState();
  // The UI-only verification preview remains local/opt-in until backend integration.
  // The guard above also runs during metadata generation.
  if (mode === "verify") return <EmailVerificationForm />;
  const requestHeaders = await headers();
  const draftPreview = await loadDraftTermsPreview(mode, process.env, requestHeaders.get("host"), async () => {
    const directory = join(process.cwd(), "task-03-client-validation", "docs");
    const [terms, privacy] = await Promise.all([
      readFile(join(directory, "platform-terms-draft.md"), "utf8"),
      readFile(join(directory, "privacy-policy-draft.md"), "utf8"),
    ]);
    return { terms, privacy };
  });
  return <AuthScreen mode={mode} draftPreview={draftPreview} />;
}
