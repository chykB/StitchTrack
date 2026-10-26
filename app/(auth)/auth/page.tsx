import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveAuthState } from "../../../lib/auth/state";
import AuthScreen from "./AuthScreen";

async function authState() {
  const state = (await headers()).get("x-stitchtrack-auth-state");
  const mode = state === null ? null : resolveAuthState("?" + state);
  if (mode === null) notFound();
  return mode;
}

export async function generateMetadata(): Promise<Metadata> {
  const mode = await authState();
  const titles = {
    signup: "Create your tailor account | StitchTrack",
    login: "Tailor login | StitchTrack",
    reset: "Reset your password | StitchTrack",
  };
  return { title: titles[mode] };
}

export default async function AuthPage() {
  return <AuthScreen mode={await authState()} />;
}
