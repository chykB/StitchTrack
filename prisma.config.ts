import { defineConfig } from "prisma/config";
import { offlinePrismaCommand, verifiedDatabaseConfig } from "./lib/assessment/config.ts";

const offline = offlinePrismaCommand(process.argv.slice(2));

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(offline ? {} : {
    datasource: { url: verifiedDatabaseConfig().url },
  }),
});
