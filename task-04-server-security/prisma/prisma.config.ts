import { defineConfig } from "prisma/config";
import { taskFourCommand, taskFourDatasource, assertTaskFourInitialDeploy } from "./config.ts";

const command = taskFourCommand(process.argv.slice(2));
if (command === "deploy") assertTaskFourInitialDeploy();

export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  // Validation is offline: no secret loading, datasource or database connection.
  // Owner-run status/deploy receive the checked main/shadow configuration.
  ...(command === "validate" ? {} : {
    datasource: taskFourDatasource(),
  }),
  // Only initial deploy is enabled; no reset, generation, seed or URL fallback.
});
