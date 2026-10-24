import "server-only";
import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { applicationDatabaseConfig, AssessmentConfigurationError } from "./config.ts";
import type { Persist } from "./enquiry.ts";

const assessmentGlobal = globalThis as typeof globalThis & {
  assessmentPrisma?: { url: string; client: PrismaClient };
};

function assessmentClient(config: ReturnType<typeof applicationDatabaseConfig>): PrismaClient {
  if (assessmentGlobal.assessmentPrisma) {
    // Require a server restart rather than reusing a connection to another target.
    if (assessmentGlobal.assessmentPrisma.url !== config.url) throw new AssessmentConfigurationError();
    return assessmentGlobal.assessmentPrisma.client;
  }
  const url = new URL(config.url);
  const pool = new Pool({
    connectionString: config.url,
    // Explicit values prevent pg's ambient PG* defaults from selecting another DB.
    host: config.host, port: config.port, database: config.database, user: config.user,
    password: () => decodeURIComponent(url.password),
    connectionTimeoutMillis: 2000,
    max: 1,
  });
  // pg can emit errors on idle connections. Never print the raw error.
  pool.on("error", () => {});
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  const client = new PrismaClient({
    adapter,
    log: [{ emit: "event", level: "error" }],
    errorFormat: "minimal",
  });
  assessmentGlobal.assessmentPrisma = { url: config.url, client };
  return client;
}

export const persistEnquiry: Persist = async (input, requestId) => {
  const config = applicationDatabaseConfig();
  const client = assessmentClient(config);
  // Recheck server-reported identity before the insert. No product data is read.
  const identity = await client.$queryRaw<Array<{ database: string; user: string }>>
    `SELECT current_database() AS database, current_user AS "user"`;
  if (identity.length !== 1 || identity[0].database !== config.database || identity[0].user !== config.user) {
    throw new AssessmentConfigurationError();
  }
  return client.assessmentEnquiry.create({
    data: { ...input, requestId },
    select: { id: true, requestId: true, createdAt: true },
  });
};
