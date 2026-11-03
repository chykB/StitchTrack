// File-only guard shared by Prisma configuration and owner-only proofs. No URLs/DB access.
import {createHash} from "node:crypto";
import {lstatSync, readFileSync, readdirSync} from "node:fs";
export const PRODUCT_MIGRATIONS = Object.freeze({
  "20261029_product_auth_initial": "7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff",
  "20261030_auth_rate_bucket": "282e3c62aad44f83ca1faf847c426fb70d1899ae7a87f4b8038ac17dbca2ac8c",
  "20261030_user_access_locks": "89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd",
  "20261102_password_reset": "2a13abcd028ab3a37b840f6c62d7a46d761e96d3029201a0a67f1eca927de4ed",
  "20261102_user_administrator": "e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665",
});
export function assertProductMigrationFiles(root = new URL("./migrations/", import.meta.url)) {
  try {
    const names = [...Object.keys(PRODUCT_MIGRATIONS), ".gitkeep", "migration_lock.toml"].sort();
    if (lstatSync(root).isSymbolicLink() || JSON.stringify(readdirSync(root).sort()) !== JSON.stringify(names)) throw new Error();
    for (const [name, checksum] of Object.entries(PRODUCT_MIGRATIONS)) {
      const dir = new URL(name + "/", root), file = new URL("migration.sql", dir);
      if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink() ||
          JSON.stringify(readdirSync(dir)) !== '["migration.sql"]' ||
          !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() ||
          createHash("sha256").update(readFileSync(file)).digest("hex") !== checksum) throw new Error();
    }
    for (const name of [".gitkeep", "migration_lock.toml"]) {
      const file = new URL(name, root);
      if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error();
    }
    if (readFileSync(new URL(".gitkeep", root)).length ||
        readFileSync(new URL("migration_lock.toml", root), "utf8").trim() !== 'provider = "postgresql"') throw new Error();
  } catch {throw new Error("Only the exact reviewed product migration files are authorized. Stop for review.");}
}
