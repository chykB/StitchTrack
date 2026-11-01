// Owner-approved V1 tailor policy. Isolated PostgreSQL test durations remain explicit.
export const TAILOR_SESSION_LIFETIME_SECONDS = 604_800;
export function localSessionOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      value === url.origin && !url.username && !url.password ? url.origin : null;
  } catch {return null;}
}

// Previously approved isolated browser-test budgets, NOT production policy.
// Keep run-scoped versions identical to the existing fixture cleanup contract.
export function localSessionRatePolicy(run:string) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(run))throw new Error("Exact local session run required.");
  const version=(suffix:string)=>"local-"+run.replaceAll("-","")+"-"+suffix;
  return {login:{version:version("l"),account:{capacity:3,refillIntervalMs:60000},ip:{capacity:10,refillIntervalMs:15000}},
    session:{version:version("s"),ip:{capacity:60,refillIntervalMs:1000}},logout:{version:version("o"),ip:{capacity:30,refillIntervalMs:2000}}};
}
