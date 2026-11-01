// Proposed NEW targets, not assertions that these databases/roles exist.
// Owner must approve/provision and confirm privileges before any connection.
export const PRODUCT_TARGETS = Object.freeze({
  development:{database:"stitchtrack_product_dev",role:"stitchtrack_product_dev_app"},
  test:{database:"stitchtrack_product_test",role:"stitchtrack_product_test_app"},
});
export const PRODUCT_MIGRATORS = Object.freeze({
  development: "stitchtrack_product_dev_migrator",
  test: "stitchtrack_product_test_migrator",
});
export type ProductMode=keyof typeof PRODUCT_TARGETS;
type Environment=Readonly<Record<string,string|undefined>>;
export class ProductConfigurationError extends Error {
  constructor(){super("Explicit confirmed isolated product configuration required.");this.name="ProductConfigurationError";}
}
export function productDatabaseConfig(env:Environment=process.env) {return parseProductTarget(env, false);}
export function productMigrationConfig(env:Environment=process.env) {
  if(env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE)throw new ProductConfigurationError();
  return parseProductTarget(env, true);
}
function parseProductTarget(env:Environment, migration:boolean) {
  try {
    const mode=env.PRODUCT_DATABASE_MODE;
    if(env.NODE_ENV==="production" || (mode!=="development" && mode!=="test") || env.PRODUCT_DATABASE_CONFIRMED!=="true")throw new Error();
    const target=PRODUCT_TARGETS[mode], user=migration?PRODUCT_MIGRATORS[mode]:target.role;
    if(migration && env.PRODUCT_MIGRATION_CONFIRMED!=="true")throw new Error();
    const variable=migration?(mode==="test"?"PRODUCT_TEST_MIGRATION_DATABASE_URL":"PRODUCT_DEV_MIGRATION_DATABASE_URL")
      :(mode==="test"?"PRODUCT_TEST_DATABASE_URL":"PRODUCT_DEV_DATABASE_URL");
    const raw=env[variable];
    if(!raw || raw!==raw.trim())throw new Error();
    const url=new URL(raw);
    if(!["postgresql:","postgres:"].includes(url.protocol) || url.hostname!=="127.0.0.1" || url.port!=="5432" || url.hash ||
      decodeURIComponent(url.pathname)!=="/"+target.database || decodeURIComponent(url.username)!==user || !decodeURIComponent(url.password))throw new Error();
    const entries=[...url.searchParams];
    if(url.searchParams.getAll("schema").length!==1 || url.searchParams.get("schema")!=="product" ||
      url.searchParams.getAll("sslmode").length>1 || entries.some(([k,v])=>k!=="schema" && (k!=="sslmode" || v!=="disable")))throw new Error();
    return {mode,url:url.href,database:target.database,user,schema:"product",host:"127.0.0.1",port:5432} as const;
  } catch {throw new ProductConfigurationError();}
}
export function productPrismaCommand(args:readonly string[]):"validate"|"generate"|"deploy"|"status" {
  if(args.length===3 && ["validate","generate"].includes(args[0]) && args[1]==="--config" && args[2]==="prisma/product/prisma.config.ts")return args[0] as "validate"|"generate";
  if(args.length===4 && args[0]==="migrate" && ["deploy","status"].includes(args[1]) && args[2]==="--config" && args[3]==="prisma/product/prisma.config.ts")return args[1] as "deploy"|"status";
  throw new Error("Product config permits explicit offline validate/generate and owner-confirmed isolated migrate deploy/status only.");
}
