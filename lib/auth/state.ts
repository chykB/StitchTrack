export type AuthMode = "login" | "signup" | "reset";
// A verification screen is not a credential form mode.
export type AuthState = AuthMode | "verify";

// Public URLs are deliberately key-only. RSC requests serialize empty values
// and add _rsc internally; that transport syntax is not a public URL state.
export function resolveAuthState(search: string, rsc = false): AuthState | null {
  if (rsc) {
    const params = new URLSearchParams(search);
    if (params.getAll("_rsc").length > 1) return null;
    params.delete("_rsc");
    const entries = [...params.entries()];
    if (entries.length === 0) search = "";
    else if (entries.length === 1 && entries[0][1] === "") search = "?" + entries[0][0];
    else return null;
  }
  if (search === "" || search === "?") return "login";
  if (search === "?login") return "login";
  if (search === "?signup") return "signup";
  if (search === "?reset") return "reset";
  if (search === "?verify") return "verify";
  return null;
}
