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
// Prisma adapter-pg currently assumes UTC for timestamptz parameters/results.
// Fixed pg startup option for each product Prisma connection, never a URL/env override.
export const PRODUCT_PRISMA_CONNECTION_OPTIONS="-c timezone=UTC";
export type ProductMode=keyof typeof PRODUCT_TARGETS;
type Environment=Readonly<Record<string,string|undefined>>;
export const productConfigurationReasons=["configuration","database_environment","migration_confirmation","database_url_missing","database_url_whitespace",
  "database_url_syntax","database_protocol","database_host","database_port","database_fragment","database_name","database_role","database_password","database_schema","database_options"] as const;
type ProductConfigurationReason=typeof productConfigurationReasons[number];
export class ProductConfigurationError extends Error {
  readonly reason:ProductConfigurationReason;
  constructor(reason:ProductConfigurationReason="configuration"){
    super("Explicit confirmed isolated product configuration required.");this.name="ProductConfigurationError";
    this.reason=productConfigurationReasons.includes(reason)?reason:"configuration";
  }
}
export const PRODUCT_TEST_CLEANUP_ROLE="stitchtrack_product_test_cleanup";
export function productCleanupConfig(env:Environment=process.env) {
  if(env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||env.PRODUCT_CLEANUP_CONFIRMED!=="true"||
    env.PGOPTIONS||env.PGSERVICE||env.PGSERVICEFILE)throw new ProductConfigurationError();
  return parseProductTarget(env,false,true);
}
export function productDatabaseConfig(env:Environment=process.env) {return parseProductTarget(env, false);}
export function productMigrationConfig(env:Environment=process.env) {
  if(env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE)throw new ProductConfigurationError();
  return parseProductTarget(env, true);
}
function parseProductTarget(env:Environment, migration:boolean, cleanup=false) {
  let reason:ProductConfigurationReason="database_environment";
  try {
    const mode=env.PRODUCT_DATABASE_MODE;
    if(env.NODE_ENV==="production" || (mode!=="development" && mode!=="test") || env.PRODUCT_DATABASE_CONFIRMED!=="true")throw new Error();
    const target=PRODUCT_TARGETS[mode], user=cleanup?PRODUCT_TEST_CLEANUP_ROLE:migration?PRODUCT_MIGRATORS[mode]:target.role;
    reason="migration_confirmation";
    if(migration && env.PRODUCT_MIGRATION_CONFIRMED!=="true")throw new Error();
    const variable=cleanup?"PRODUCT_TEST_CLEANUP_DATABASE_URL":migration?(mode==="test"?"PRODUCT_TEST_MIGRATION_DATABASE_URL":"PRODUCT_DEV_MIGRATION_DATABASE_URL")
      :(mode==="test"?"PRODUCT_TEST_DATABASE_URL":"PRODUCT_DEV_DATABASE_URL");
    const raw=env[variable];
    reason="database_url_missing";if(!raw)throw new Error();
    reason="database_url_whitespace";if(raw!==raw.trim())throw new Error();
    reason="database_url_syntax";const url=new URL(raw);
    reason="database_protocol";if(!["postgresql:","postgres:"].includes(url.protocol))throw new Error();
    reason="database_host";if(url.hostname!=="127.0.0.1")throw new Error();
    reason="database_port";if(url.port!=="5432")throw new Error();
    reason="database_fragment";if(url.hash)throw new Error();
    reason="database_name";if(decodeURIComponent(url.pathname)!=="/"+target.database)throw new Error();
    reason="database_role";if(decodeURIComponent(url.username)!==user)throw new Error();
    reason="database_password";if(!decodeURIComponent(url.password))throw new Error();
    reason="database_schema";
    if(url.searchParams.getAll("schema").length!==1 || url.searchParams.get("schema")!=="product")throw new Error();
    reason="database_options";const entries=[...url.searchParams];
    if(url.searchParams.getAll("sslmode").length>1 || entries.some(([k,v])=>k!=="schema" && (k!=="sslmode" || v!=="disable")))throw new Error();
    return {mode,url:url.href,database:target.database,user,schema:"product",host:"127.0.0.1",port:5432} as const;
  } catch {throw new ProductConfigurationError(reason);}
}
export function productPrismaCommand(args:readonly string[]):"validate"|"generate"|"deploy"|"status" {
  if(args.length===3 && ["validate","generate"].includes(args[0]) && args[1]==="--config" && args[2]==="prisma/product/prisma.config.ts")return args[0] as "validate"|"generate";
  if(args.length===4 && args[0]==="migrate" && ["deploy","status"].includes(args[1]) && args[2]==="--config" && args[3]==="prisma/product/prisma.config.ts")return args[1] as "deploy"|"status";
  throw new Error("Product config permits explicit offline validate/generate and owner-confirmed isolated migrate deploy/status only.");
}
