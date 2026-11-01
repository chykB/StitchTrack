import { defineConfig } from "prisma/config";
import { readFileSync, lstatSync } from "node:fs";
import { assertGenerate, canonicalUrl, workUrl } from "./policy.ts";

// Owner-only offline generation. No datasource, migrations path, dotenv or URL.
for (const path of [workUrl, new URL("schema.prisma", workUrl), new URL("client", workUrl)]) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error("Symlinked drift output is forbidden.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
assertGenerate(process.argv.slice(2), process.env, readFileSync(canonicalUrl, "utf8"),
  readFileSync(new URL("schema.prisma", workUrl), "utf8"));
export default defineConfig({ schema: "./work/schema.prisma" });
