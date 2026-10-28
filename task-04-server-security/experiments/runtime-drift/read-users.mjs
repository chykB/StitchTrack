// Same real Prisma ORM read in baseline, drifted and restored subprocesses.
// Importing this module in offline tests does not import a generated client or pg.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { canonicalUrl, workUrl, workingSchemas, connectionOptions, probeField,
  assertMigrationFiles } from "./policy.ts";
import { TASK_FOUR_INITIAL_SQL_SHA256, TASK_FOUR_REQUIRED_NAME_SHA256 } from "../../prisma/config.ts";

export function assertMetadata(meta) {
  if (meta.database !== "stitchtrack_assessment" || meta.role !== "stitchtrack_task04_test_app" ||
      meta.readOnly !== "on" || meta.schemaOwned !== true || meta.userCount !== 2) throw new Error("Unexpected target or lab state.");
  const expected = ["id", "emailCanonical", "createdAt", "name"];
  if (!Array.isArray(meta.columns) || meta.columns.length !== 4 || expected.some(name =>
    !meta.columns.some(c => c.name === name && c.required && !c.default &&
      c.type === (name === "createdAt" ? "timestamp(3) with time zone" : "text")))) throw new Error("Expected recovered User schema, without probe column.");
  if (!meta.constraints.some(c => c.name === "User_name_nonblank_check" && c.validated)) throw new Error("Validated name CHECK missing.");
  if (!Array.isArray(meta.history) || meta.history.length !== 3 || meta.history.some(h => !h.finished_at && !h.rolled_back_at)) throw new Error("History is not reconciled.");
  const initial = meta.history.find(h => h.migration_name === "20261028_task04_initial" && h.finished_at && !h.rolled_back_at);
  const applied = meta.history.find(h => h.migration_name === "20261028_task04_user_name" && h.finished_at && !h.rolled_back_at);
  const failed = meta.history.find(h => h.id === "e91a14f3-686e-4929-8e3f-bcec0baaff30" && !h.finished_at && h.rolled_back_at);
  if (initial?.checksum !== TASK_FOUR_INITIAL_SQL_SHA256 || applied?.checksum !== TASK_FOUR_REQUIRED_NAME_SHA256 ||
      failed?.checksum !== TASK_FOUR_REQUIRED_NAME_SHA256 || !failed.logs?.includes("23502")) throw new Error("Original migration history/diagnostic mismatch.");
}
export function assertUsers(rows) {
  if (!Array.isArray(rows) || rows.length !== 2 || rows.some((r,i) =>
    r.id !== "task04-required-name-0" + (i+1) || r.emailCanonical !== "required-name-0" + (i+1) + "@example.invalid" ||
    r.name !== "Synthetic User 0" + (i+1))) throw new Error("Original two synthetic users must be preserved.");
}
export async function fetchUsers(prisma) {
  // No select/omit: Prisma selects every scalar field known to THIS generated client.
  return prisma.user.findMany({ orderBy: { id: "asc" } });
}
async function ownerRead(args) {
  if (args.length !== 2 || args[0] !== "--owner-read" || !["baseline", "drifted", "restored"].includes(args[1])) throw new Error("Explicit owner read phase required.");
  const options = connectionOptions(); // Reject before importing/constructing any client.
  assertMigrationFiles();
  const schemas = workingSchemas(readFileSync(canonicalUrl,"utf8"));
  const schema = readFileSync(new URL("schema.prisma",workUrl),"utf8");
  if (schema !== schemas[args[1] === "drifted" ? "drifted" : "correct"]) throw new Error("Working schema phase mismatch.");
  if (readFileSync(new URL("client/models/User.ts",workUrl),"utf8").includes(probeField) !== (args[1] === "drifted")) throw new Error("Generated client phase mismatch.");
  const {PrismaClient,Prisma} = await import(new URL("client/client.ts",workUrl).href);
  const {PrismaPg} = await import("@prisma/adapter-pg");
  const {default:pg} = await import("pg");
  const pool = new pg.Pool(options);
  pool.on("error",()=>{});
  const prisma = new PrismaClient({adapter:new PrismaPg(pool,{schema:"task04_test",disposeExternalPool:true}),
    log:[{emit:"event",level:"error"}],errorFormat:"minimal"});
  try {
    await prisma.$transaction(async tx => {
      const [record] = await tx.$queryRaw`
        SELECT jsonb_build_object(
          'database',current_database(),'role',CURRENT_USER,'readOnly',current_setting('transaction_read_only'),
          'schemaOwned',EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
            WHERE n.nspname='task04_test' AND r.rolname=CURRENT_USER),
          'userCount',(SELECT count(*)::int FROM "task04_test"."User"),
          'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',pg_catalog.format_type(atttypid,atttypmod),
            'required',attnotnull,'default',atthasdef) ORDER BY attnum) FROM pg_catalog.pg_attribute
            WHERE attrelid='"task04_test"."User"'::regclass AND attnum>0 AND NOT attisdropped),
          'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'validated',convalidated,
            'definition',pg_catalog.pg_get_constraintdef(oid)) ORDER BY conname)
            FROM pg_catalog.pg_constraint WHERE conrelid='"task04_test"."User"'::regclass),
          'history',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.started_at,m.id) FROM "task04_test"."_prisma_migrations" m)
        ) AS metadata`;
      console.log("TASK04_METADATA="+JSON.stringify(record.metadata));
      assertMetadata(record.metadata);
      console.log('ORM read: prisma.user.findMany({ orderBy: { id: "asc" } })');
      const rows = await fetchUsers(tx);
      assertUsers(rows);
      console.log("TASK04_ROWS="+JSON.stringify(rows));
    },{isolationLevel:"RepeatableRead",timeout:15000,maxWait:5000});
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      // Genuine error produced by the generated Prisma Client, never synthesized.
      console.error(inspect(error,{depth:10,colors:false}));
      process.exitCode=2;
    } else {
      console.error("Unexpected client-read failure; no expected drift result is claimed.",
        {name:error?.name,code:error?.code});
      process.exitCode=1;
    }
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ownerRead(process.argv.slice(2)).catch(()=>{
    console.error("STOP: owner read setup/cleanup failed; no drift result is claimed.");process.exitCode=1;
  });
}
