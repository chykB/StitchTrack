export type Environment = Readonly<Record<string, string | undefined>>;

export class AssessmentConfigurationError extends Error {
  constructor() {
    super("Explicit, confirmed assessment test-database configuration is required.");
    this.name = "AssessmentConfigurationError";
  }
}

export function assessmentEnabled(env: Environment = process.env): boolean {
  return env.NODE_ENV === "development" &&
    env.ENABLE_PERSISTENCE_EXPERIMENT === "true";
}

export function isLocalHost(host: string | null): boolean {
  if (!host || /[\s/@\\]/.test(host)) return false;
  try {
    const url = new URL("http://" + host);
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.host === host && url.pathname === "/";
  } catch {
    return false;
  }
}

export function localAssessmentRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "http:" && isLocalHost(url.host) &&
    request.headers.get("host") === url.host;
}

export type DatabaseConfig = {
  url: string;
  database: string;
  host: string;
  port: number;
  user: string;
};

export function verifiedDatabaseConfig(env: Environment = process.env): DatabaseConfig {
  try {
    if (env.NODE_ENV === "production") throw new AssessmentConfigurationError();
    const raw = env.EXPERIMENT_DATABASE_URL;
    const database = env.EXPERIMENT_EXPECTED_DATABASE;
    const host = env.EXPERIMENT_EXPECTED_HOST;
    const port = env.EXPERIMENT_EXPECTED_PORT;
    const user = env.EXPERIMENT_EXPECTED_USER;
    if (!raw || !database || !host || !port || !user) throw new AssessmentConfigurationError();
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.hostname || !url.port || !url.username || url.hash ||
        !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 ||
        url.hostname !== host || url.port !== String(Number(port)) ||
        decodeURIComponent(url.pathname.slice(1)) !== database ||
        decodeURIComponent(url.username) !== user ||
        database.includes("/") || raw !== raw.trim()) throw new AssessmentConfigurationError();
    // Only the shared libpq/pg TLS mode is supported; no service, schema,
    // alternate host, search_path, or hidden connection override.
    const params = [...url.searchParams];
    if (params.length > 1 || params.some(([key, value]) =>
      key !== "sslmode" || !["disable", "require", "verify-full"].includes(value))) {
      throw new AssessmentConfigurationError();
    }
    return { url: raw, database, host, port: Number(port), user };
  } catch {
    // Never include the URL, credentials, parser errors, or environment values.
    throw new AssessmentConfigurationError();
  }
}

export function applicationDatabaseConfig(env: Environment = process.env): DatabaseConfig {
  if (!assessmentEnabled(env)) throw new AssessmentConfigurationError();
  const config = verifiedDatabaseConfig(env);
  if (!env.EXPERIMENT_FAILURE_PORT) return config;
  if (!/^\d+$/.test(env.EXPERIMENT_FAILURE_PORT)) throw new AssessmentConfigurationError();
  const port = Number(env.EXPERIMENT_FAILURE_PORT);
  if (port < 1 || port > 65535 || (["127.0.0.1", "localhost", "[::1]"].includes(config.host) &&
      port === config.port)) throw new AssessmentConfigurationError();
  const url = new URL(config.url);
  url.hostname = "127.0.0.1";
  url.port = String(port);
  return { ...config, url: url.href, host: "127.0.0.1", port };
}

// Offline commands omit the datasource entirely, rather than using a fake URL.
// All other CLI invocations require explicit verified configuration.
export function offlinePrismaCommand(args: readonly string[]): boolean {
  return ["generate", "validate"].includes(args[0] ?? "") ||
    (args[0] === "migrate" && args[1] === "diff" &&
      args.includes("--from-empty") && args.includes("--to-schema") &&
      !args.some(arg => arg.includes("config-datasource")));
}
