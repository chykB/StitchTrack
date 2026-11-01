import { defineConfig } from "prisma/config";
import { taskFourCommand, taskFourDatasource, assertTaskFourDeploy, assertTaskFourRequiredNameResolution } from "./config.ts";

const command = taskFourCommand(process.argv.slice(2));
if (command === "deploy") assertTaskFourDeploy();
if (command === "resolve-required-name") assertTaskFourRequiredNameResolution();

export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  // Validation is offline: no secret loading, datasource or database connection.
  // Owner-run status/deploy receive the checked main/shadow configuration.
  ...(command === "validate" ? {} : {
    datasource: taskFourDatasource(),
  }),
  // Only reviewed deploy/exact resolution phases; no reset, generation, seed or URL fallback.
});
