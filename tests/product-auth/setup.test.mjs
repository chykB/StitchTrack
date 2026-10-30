// Offline configuration imports and SQL source contracts only. Never connects.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const setup = p => read("../../prisma/product/setup/"+p);
const migration = read("../../prisma/product/migrations/20261029_product_auth_initial/migration.sql");
const config = read("../../prisma/product/prisma.config.ts");

test("real config imports remain offline without URLs; admitted migration config uses only confirmed migrator target", () => {
  const url = new URL("../../prisma/product/prisma.config.ts", import.meta.url).href;
  const load = (args, env={}) => spawnSync(process.execPath,["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--input-type=module","-e",
    `process.argv=["node","offline-proof",...${JSON.stringify(args)}];const c=(await import(${JSON.stringify(url)})).default;console.log(JSON.stringify({hasDatasource:!!c.datasource,schema:c.schema}));`],
    {encoding:"utf8",env:{PATH:process.env.PATH,NODE_ENV:"test",...env}});
  const approved={PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",
    PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
  const offline=load(["validate","--config","prisma/product/prisma.config.ts"]); assert.equal(offline.status,0,offline.stderr);
  assert.equal(JSON.parse(offline.stdout).hasDatasource,false);
  for(const cmd of ["deploy","status"]) {
    const args=["migrate",cmd,"--config","prisma/product/prisma.config.ts"];
    assert.notEqual(load(args).status,0);
    const result=load(args,approved); assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).hasDatasource,true);
    assert.doesNotMatch(result.stdout,/synthetic-only|postgresql:/u);
  }
  assert.ok(config.includes(createHash("sha256").update(migration).digest("hex")));
  assert.doesNotMatch(config,/import[^\n]*dotenv|shadowDatabaseUrl/u);
});
test("provisioning is fresh-target admin-only and creates only four unprivileged roles/two product databases", () => {
  const sql=setup("provision.sql");
  assert.match(sql,/current_database\(\)<>'postgres'/u); assert.match(sql,/rolname=current_user AND rolsuper/u);
  assert.match(sql,/Product target or role already exists/u);
  const roles=[...sql.matchAll(/CREATE ROLE (\w+) ([^;]+);/gu)]; assert.equal(roles.length,4);
  for(const [,name,flags] of roles) {
    assert.match(name,/^stitchtrack_product_(dev|test)_(migrator|app)$/u);
    for(const flag of ["NOINHERIT","NOSUPERUSER","NOCREATEDB","NOCREATEROLE","NOREPLICATION","NOBYPASSRLS"])assert.ok(flags.includes(flag));
  }
  assert.equal((sql.match(/^CREATE DATABASE /gmu)??[]).length,2);
  for(const mode of ["dev","test"]) {
    assert.ok(sql.includes(`REVOKE ALL ON DATABASE stitchtrack_product_${mode} FROM PUBLIC;`));
    assert.ok(sql.includes(`CREATE SCHEMA product AUTHORIZATION stitchtrack_product_${mode}_migrator;`));
    assert.ok(sql.includes(`GRANT USAGE ON SCHEMA product TO stitchtrack_product_${mode}_app;`));
  }
  assert.doesNotMatch(sql,/PASSWORD\s+'|\bDROP\b|assessment|task04_test|GRANT .*migrator TO/iu);
});
test("runtime privileges exclude history, session writes and Terms changes; fixture insert is test-only", () => {
  const sql=setup("permissions.sql");
  assert.match(sql,/current_user<>expected/u); assert.match(sql,/Migration history must exist only in product/u);
  assert.match(sql,/GRANT SELECT ON TABLE [\s\S]*?product\."TermsVersion"/u);
  const inserts=[...sql.matchAll(/GRANT INSERT[^;]+;/gu)].map(m=>m[0]);
  assert.equal(inserts.length,2); assert.doesNotMatch(inserts[0],/TermsVersion|Session/u);
  const exception=sql.match(/\\if :is_test([\s\S]*?)\\endif/u)?.[1]; assert.ok(exception);
  assert.ok(exception.includes(inserts[1])); assert.match(inserts[1],/TO stitchtrack_product_test_app/u);
  assert.doesNotMatch(inserts[1],/approvedAt|effectiveAt/u);
  assert.doesNotMatch(sql,/GRANT (?:ALL|UPDATE[^;]*(?:TermsVersion|TermsAcceptance)|DELETE[^;]*(?:TermsVersion|TermsAcceptance))|ON ALL TABLES/u);
  assert.match(sql,/GRANT DELETE ON product\."Verification"/u);
  assert.match(sql,/GRANT UPDATE \("emailVerified", "updatedAt"\)/u);
  assert.ok(sql.includes(createHash("sha256").update(migration).digest("hex")));
});
test("preflight is read-only and dynamically reads only fixed history columns; harness verifies permissions", () => {
  const sql=setup("preflight.sql"); assert.match(sql,/BEGIN READ ONLY;/u);
  assert.doesNotMatch(sql,/(?:^|\n)\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b|rolpassword|conninfo/iu);
  assert.match(sql,/SELECT 'SELECT migration_name, checksum,[^\n]+product\._prisma_migrations/u);
  const harness=read("./registration.integration.mjs");
  for(const name of ["history_read:false","session_insert:false","terms_approve:false","acceptance_update:false","fixture_insert:true","REGISTRATION_STAGES","VERIFICATION_STAGES"])assert.ok(harness.includes(name));
});
