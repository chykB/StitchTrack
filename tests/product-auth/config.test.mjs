import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {productDatabaseConfig,productMigrationConfig,productPrismaCommand,ProductConfigurationError} from "../../prisma/product/targets.ts";
function fixture(mode="test") {
  const suffix=mode==="test"?"test":"dev";
  return {PRODUCT_DATABASE_MODE:mode,PRODUCT_DATABASE_CONFIRMED:"true",
    [mode==="test"?"PRODUCT_TEST_DATABASE_URL":"PRODUCT_DEV_DATABASE_URL"]:
      `postgresql://stitchtrack_product_${suffix}_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_${suffix}?schema=product`};
}
test("explicit product dev/test targets are separate and never infer assessment configuration",()=>{
  const dev=productDatabaseConfig(fixture("development")),test=productDatabaseConfig(fixture());
  assert.notEqual(dev.database,test.database);assert.notEqual(dev.user,test.user);
  assert.equal(test.schema,"product");assert.equal(test.host,"127.0.0.1");
  for(const env of [{},{DATABASE_URL:fixture().PRODUCT_TEST_DATABASE_URL},{TASK04_DATABASE_URL:fixture().PRODUCT_TEST_DATABASE_URL},
    {...fixture(),PRODUCT_DATABASE_CONFIRMED:"false"},{...fixture(),NODE_ENV:"production"},
    {...fixture(),PRODUCT_DATABASE_MODE:"development"}])assert.throws(()=>productDatabaseConfig(env),ProductConfigurationError);
});
test("wrong database, role, host, schema, password and connection overrides fail closed",()=>{
  for(const edit of [u=>u.pathname="/stitchtrack_assessment",u=>u.pathname="/stitchtrack_task04_shadow",u=>u.pathname="/stitchtrack_product_dev",
    u=>u.username="postgres",u=>u.username="stitchtrack_task04_test_app",u=>u.hostname="localhost",u=>u.hostname="example.com",
    u=>u.port="5433",u=>u.password="",u=>u.hash="override",u=>u.searchParams.set("schema","public"),
    u=>u.searchParams.append("schema","product"),u=>u.searchParams.set("options","override"),u=>u.searchParams.set("sslmode","prefer")]) {
    const env=fixture(),url=new URL(env.PRODUCT_TEST_DATABASE_URL);edit(url);env.PRODUCT_TEST_DATABASE_URL=url.href;
    assert.throws(()=>productDatabaseConfig(env),ProductConfigurationError);
  }
  const env=fixture();env.PRODUCT_TEST_DATABASE_URL=env.PRODUCT_TEST_DATABASE_URL.replace("synthetic-only","%ZZ");
  assert.throws(()=>productDatabaseConfig(env),ProductConfigurationError);
});
test("configuration rejection never prints supplied credentials or parser input",()=>{
  try {productDatabaseConfig({...fixture(),PRODUCT_TEST_DATABASE_URL:"postgresql://secret:never-print@example.com/wrong"});assert.fail();}
  catch(error){assert.ok(error instanceof ProductConfigurationError);assert.doesNotMatch(error.stack,/never-print|example.com|postgresql:/);assert.equal(error.cause,undefined);}
});
test("only exact offline or owner migration command shapes are permitted",()=>{
  for(const mode of ["validate","generate"])assert.equal(productPrismaCommand([mode,"--config","prisma/product/prisma.config.ts"]),mode);
  for(const args of [["generate"],["migrate","diff"],["migrate","deploy"],["migrate","dev"],["migrate","reset"],["db","push"],["migrate","resolve"],
    ["generate","--config","prisma.config.ts"],["generate","--config","prisma/product/prisma.config.ts","--schema=prisma/schema.prisma"]])assert.throws(()=>productPrismaCommand(args));
});
test("core storage remains distinct and outbox retains stable issuance after challenge removal",()=>{
  const schema=readFileSync(new URL("../../prisma/product/schema.prisma",import.meta.url),"utf8");
  assert.equal((schema.match(/^model /gmu)??[]).length,8);
  assert.equal((schema.match(/@@schema\("product"\)/gu)??[]).length,8);
  assert.match(schema,/@map\("emailCanonical"\)/u);
  assert.match(schema,/verificationId String\? @unique/u);
  assert.match(schema,/verification Verification\? @relation\([^\n]*onDelete:SetNull/u);
  assert.match(schema,/issuanceId String @unique/u);
  assert.match(schema,/issuance EmailVerificationIssuance @relation\([^\n]*onDelete:Restrict/u);
  assert.doesNotMatch(schema,/AssessmentEnquiry|task04_test|Payment|Retrieval/u);
});

test("migration credentials are separate, exact-role and explicitly confirmed without runtime/root fallback",()=>{
  for(const mode of ["test","development"]) {
    const env=fixture(mode), suffix=mode==="test"?"test":"dev";
    const runtimeKey=mode==="test"?"PRODUCT_TEST_DATABASE_URL":"PRODUCT_DEV_DATABASE_URL";
    const key=mode==="test"?"PRODUCT_TEST_MIGRATION_DATABASE_URL":"PRODUCT_DEV_MIGRATION_DATABASE_URL";
    const url=env[runtimeKey].replace("_app:","_migrator:");
    const approved={...env,PRODUCT_MIGRATION_CONFIRMED:"true",[key]:url};
    assert.equal(productMigrationConfig(approved).user,`stitchtrack_product_${suffix}_migrator`);
    for(const bad of [{...env,PRODUCT_MIGRATION_CONFIRMED:"true"},{...approved,PRODUCT_MIGRATION_CONFIRMED:"false"},
      {...approved,NODE_ENV:"production"},{...approved,PGOPTIONS:"-c search_path=public"},{...approved,PGSERVICE:"wrong"},{...approved,[key]:env[runtimeKey]},
      {...approved,[key]:url.replace("127.0.0.1","localhost")},{...approved,[key]:url.replace("schema=product","schema=public")},
      {...approved,[key]:url.replace("/stitchtrack_product_"+suffix+"?","/stitchtrack_assessment?")},
      {...approved,[key]:url.replace("_migrator:","_app:")}, {...approved,[key]:url+"&options=override"}]) {
      assert.throws(()=>productMigrationConfig(bad),ProductConfigurationError);
    }
    assert.throws(()=>productDatabaseConfig({...env,[runtimeKey]:url}),ProductConfigurationError);
  }
  for(const command of ["deploy","status"])assert.equal(productPrismaCommand(["migrate",command,"--config","prisma/product/prisma.config.ts"]),command);
  for(const args of [["migrate","reset","--config","prisma/product/prisma.config.ts"],
    ["migrate","deploy","--config","prisma.config.ts"],["migrate","deploy","--config","prisma/product/prisma.config.ts","--schema=prisma/schema.prisma"],
    ["migrate","resolve","--applied","anything","--config","prisma/product/prisma.config.ts"]])assert.throws(()=>productPrismaCommand(args));
});
