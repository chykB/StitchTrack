import {defineConfig} from "prisma/config";
import {createHash} from "node:crypto";
import {readFileSync, readdirSync} from "node:fs";
import {productPrismaCommand, productMigrationConfig} from "./targets.ts";
const command=productPrismaCommand(process.argv.slice(2));
const offline=command==="validate" || command==="generate";
// Offline commands never read a URL; database commands have no dotenv/root fallback.
const target=offline?undefined:productMigrationConfig();
if(target) {
  const root=new URL("./migrations/",import.meta.url);
  const entries=readdirSync(root).sort();
  if(JSON.stringify(entries)!==JSON.stringify([".gitkeep","20261029_product_auth_initial","migration_lock.toml"].sort()) ||
     readdirSync(new URL("20261029_product_auth_initial/",root)).join()!=="migration.sql" ||
     createHash("sha256").update(readFileSync(new URL("20261029_product_auth_initial/migration.sql",root))).digest("hex")!=="7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff" ||
     readFileSync(new URL("migration_lock.toml",root),"utf8").trim()!=='provider = "postgresql"') {
    throw new Error("Only the reviewed initial product migration is authorized. Stop for review.");
  }
}
export default defineConfig({schema:"./schema.prisma",migrations:{path:"./migrations"},
  ...(target?{datasource:{url:target.url}}:{})});
