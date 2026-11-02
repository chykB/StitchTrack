import {defineConfig} from "prisma/config";
import {assertProductMigrationFiles} from "./migration-files.ts";
import {productPrismaCommand, productMigrationConfig} from "./targets.ts";
const command=productPrismaCommand(process.argv.slice(2));
const offline=command==="validate" || command==="generate";
// Offline commands never read a URL; database commands have no dotenv/root fallback.
const target=offline?undefined:productMigrationConfig();
if(target) {
  // This new migration is for owner-reviewed product-test execution only.
  if(command==="deploy" && (target.mode!=="test" || process.env.PRODUCT_PASSWORD_RESET_MIGRATION_CONFIRMED!=="true"))
    throw new Error("Separate owner confirmation for product-test password-reset migration required.");
  assertProductMigrationFiles();
}

export default defineConfig({schema:"./schema.prisma",migrations:{path:"./migrations"},
  ...(target?{datasource:{url:target.url}}:{})});
