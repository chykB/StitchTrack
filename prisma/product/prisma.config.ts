import {defineConfig} from "prisma/config";
import {assertProductMigrationFiles} from "./migration-files.ts";
import {productPrismaCommand, productMigrationConfig} from "./targets.ts";
const command=productPrismaCommand(process.argv.slice(2));
const offline=command==="validate" || command==="generate";
// Offline commands never read a URL; database commands have no dotenv/root fallback.
const target=offline?undefined:productMigrationConfig();
if(target) assertProductMigrationFiles();

export default defineConfig({schema:"./schema.prisma",migrations:{path:"./migrations"},
  ...(target?{datasource:{url:target.url}}:{})});
