import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {workingSchemas,assertGenerate,connectionOptions,requireDriftOwner,canonicalUrl,workUrl,configPath,
  probeLine,assertMigrationFiles} from "../experiments/runtime-drift/policy.ts";
import {assertMetadata,assertUsers,fetchUsers} from "../experiments/runtime-drift/read-users.mjs";
import {parseReadOutput} from "../experiments/runtime-drift/run.mjs";
import {taskFourCommand,TASK_FOUR_INITIAL_SQL_SHA256,TASK_FOUR_REQUIRED_NAME_SHA256} from "../prisma/config.ts";
const canonical=readFileSync(canonicalUrl,"utf8");
const schemas=workingSchemas(canonical);
const flag={TASK04_RUNTIME_DRIFT_CONFIRMED:"true"};
function env() {
  return {...flag,TASK04_DATABASE_URL:"postgresql://stitchtrack_task04_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_assessment?schema=task04_test",
    TASK04_DATABASE_CONFIRMED:"true",TASK04_EXPECTED_HOST:"127.0.0.1",TASK04_EXPECTED_PORT:"5432"};
}
function metadata() {
  return {database:"stitchtrack_assessment",role:"stitchtrack_task04_test_app",readOnly:"on",schemaOwned:true,userCount:2,
    columns:["id","emailCanonical","createdAt","name"].map(name=>({name,type:name==="createdAt"?"timestamp(3) with time zone":"text",required:true,default:false})),
    constraints:[{name:"User_name_nonblank_check",validated:true}],
    history:[{migration_name:"20261028_task04_initial",checksum:TASK_FOUR_INITIAL_SQL_SHA256,finished_at:"done",rolled_back_at:null},
      {id:"e91a14f3-686e-4929-8e3f-bcec0baaff30",migration_name:"20261028_task04_user_name",checksum:TASK_FOUR_REQUIRED_NAME_SHA256,finished_at:null,rolled_back_at:"resolved",logs:"23502 original diagnostic"},
      {migration_name:"20261028_task04_user_name",checksum:TASK_FOUR_REQUIRED_NAME_SHA256,finished_at:"done",rolled_back_at:null}]};
}
test("working drift adds only one missing scalar; canonical schema is never changed",()=>{
  assert.equal(schemas.drifted.replace(probeLine,""),schemas.correct);
  assert.ok(schemas.correct.endsWith(canonical));
  assert.match(schemas.correct,/provider = "prisma-client"/u);
  assert.match(schemas.correct,/output = "\.\/client"/u);
  assert.match(schemas.correct,/importFileExtension = "ts"/u);
  assert.throws(()=>workingSchemas(canonical+"\n"));
});
test("default-off, production and conflicting owner phases cannot enable drift",()=>{
  for(const e of [{},{...flag,NODE_ENV:"production"},...['false','TRUE',' true '].map(v=>({TASK04_RUNTIME_DRIFT_CONFIRMED:v})),
    ...["TASK04_INITIAL_DEPLOY_CONFIRMED","TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED","TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED","TASK04_REQUIRED_NAME_RESOLVE_CONFIRMED"].map(k=>({...flag,[k]:"true"}))]) {
    assert.throws(()=>requireDriftOwner(e));
  }
});
test("generation permits only the reviewed copy/config and never migration/database commands",()=>{
  for(const working of [schemas.correct,schemas.drifted]) assert.doesNotThrow(()=>assertGenerate(["generate","--config",configPath],flag,canonical,working));
  for(const args of [["generate"],["generate","--config","prisma.config.ts"],["generate","--config",configPath,"--schema=prisma/schema.prisma"],
    ["migrate","reset"],["db","push"],["db","execute"],["migrate","deploy"],["migrate","dev"],["migrate","resolve"],
    ["generate","--config="+configPath]]) assert.throws(()=>assertGenerate(args,flag,canonical,schemas.correct));
  assert.throws(()=>assertGenerate(["generate","--config",configPath],{},canonical,schemas.correct));
  assert.throws(()=>assertGenerate(["generate","--config",configPath],flag,canonical,schemas.correct.replace('./client','../../../app/generated/prisma')));
  assert.throws(()=>taskFourCommand(["generate","--config","task-04-server-security/prisma/prisma.config.ts"]));
  const config=readFileSync(new URL("../experiments/runtime-drift/prisma.config.ts",import.meta.url),"utf8");
  assert.doesNotMatch(config.replace(/\/\/[^\n]*/gu,""),/datasource:|migrations:|dotenv/u);
});
test("runtime target and explicit read-only pool settings cannot fall back to product or ambient PG values",()=>{
  const options=connectionOptions({...env(),PGDATABASE:"product",PGHOST:"example.com",PGUSER:"postgres",PGOPTIONS:"override"});
  assert.equal(options.database,"stitchtrack_assessment");assert.equal(options.user,"stitchtrack_task04_test_app");assert.equal(options.host,"127.0.0.1");
  assert.match(options.options,/default_transaction_read_only=on/u);assert.match(options.options,/statement_timeout=10000/u);
  assert.equal(options.password(),"synthetic-only");assert.equal(options.ssl,false);
  for(const edit of [u=>u.pathname="/product",u=>u.username="postgres",u=>u.hostname="example.com",u=>u.searchParams.set("schema","public")]) {
    const e=env(),u=new URL(e.TASK04_DATABASE_URL);edit(u);e.TASK04_DATABASE_URL=u.href;assert.throws(()=>connectionOptions(e));
  }
  assert.throws(()=>connectionOptions({DATABASE_URL:env().TASK04_DATABASE_URL,...flag}));
});
test("metadata requires the actual recovered lab shape, two rows and resolved preserved failure",()=>{
  const good=metadata();assert.doesNotThrow(()=>assertMetadata(good));
  for(const edit of [m=>m.database="product",m=>m.role="postgres",m=>m.readOnly="off",m=>m.schemaOwned=false,m=>m.userCount=3,
    m=>m.columns.push({name:"task04DriftProbe"}),m=>m.columns[3].required=false,m=>m.columns[3].default=true,
    m=>m.constraints[0].validated=false,m=>m.history[1].rolled_back_at=null,m=>m.history[1].logs="lost",m=>m.history[2].checksum="changed"]) {
    const bad=structuredClone(good);edit(bad);assert.throws(()=>assertMetadata(bad));
  }
});
test("the same ORM read selects all scalar fields and validates the two synthetic identities",async()=>{
  const rows=[1,2].map(n=>({id:"task04-required-name-0"+n,emailCanonical:"required-name-0"+n+"@example.invalid",name:"Synthetic User 0"+n}));
  let args;const prisma={user:{findMany:async input=>{args=input;return rows;}}};
  assert.equal(await fetchUsers(prisma),rows);assert.deepEqual(args,{orderBy:{id:"asc"}});assert.doesNotThrow(()=>assertUsers(rows));
  assert.throws(()=>assertUsers(rows.slice(1)));assert.throws(()=>assertUsers([{...rows[0],name:"replaced"},rows[1]]));
});
test("captured output parser preserves actual row/metadata records without inventing success",()=>{
  assert.deepEqual(parseReadOutput('TASK04_METADATA={"x":1}\nTASK04_ROWS=[{"id":"synthetic"}]\n'),{metadata:{x:1},rows:[{id:"synthetic"}]});
  assert.deepEqual(parseReadOutput('failed before records\n'),{metadata:null,rows:null});
});
test("owner sources restore in finally, use real P2022 and contain no migration or persistence path",()=>{
  const run=readFileSync(new URL("../experiments/runtime-drift/run.mjs",import.meta.url),"utf8");
  const reader=readFileSync(new URL("../experiments/runtime-drift/read-users.mjs",import.meta.url),"utf8");
  assert.match(run,/finally \{[\s\S]*writeFileSync\(file,schemas.correct\)[\s\S]*generate\("restored"\)/u);
  assert.doesNotMatch(run,/writeFileSync\(canonicalUrl|migrate.*(?:deploy|reset|dev)|db.*push/u);
  assert.match(reader,/error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022"/u);
  assert.doesNotMatch(reader,/new Prisma.PrismaClientKnownRequestError|\.user\.(?:create|update|delete)|\$executeRaw/u);
  assert.match(reader,/isolationLevel:"RepeatableRead"/u);
  assert.doesNotThrow(()=>assertMigrationFiles());
  assert.equal(existsSync(workUrl),false,"Offline tests must not create the owner working schema/client");
});
