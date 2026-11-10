// Filesystem/static validation only: no Docker CLI/API, pg, psql, Prisma deploy or database calls.
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,chmodSync,readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {prepareUnicodeDisposable,checkUnicodeContainer} from "../../scripts/prepare-unicode-disposable.mjs";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const repo=realpathSync(new URL("../../",import.meta.url)),read=f=>readFileSync(join(repo,f),"utf8");
const ninth="20261108_measurement_label_unicode",sha=b=>createHash("sha256").update(b).digest("hex");
const top=mkdtempSync(join(tmpdir(),"unicode-disposable-unit-"));chmodSync(top,0o700);
function env(purpose,root){return {PRODUCT_UNICODE_DISPOSABLE_CONFIRMED:"true",PRODUCT_UNICODE_DISPOSABLE_PURPOSE:purpose,PRODUCT_UNICODE_DISPOSABLE_ROOT:root,
 PRODUCT_UNICODE_POSTGRES_IMAGE:"postgres:16-bookworm@sha256:"+"a".repeat(64),PRODUCT_UNICODE_NODE_IMAGE:"node:24-bookworm@sha256:"+"b".repeat(64)};}
function fakeSecrets(start=0){let n=start;return {uuid:()=>"00000000-0000-4000-8000-"+(++n).toString(16).padStart(12,"0"),secret:()=> (++n).toString(16).padStart(64,"0"),
 hashPassword:async()=>"$argon2id$v=19$m=65536,t=3,p=1$"+"A".repeat(22)+"$"+"B".repeat(43)};}
const readEnv=path=>Object.fromEntries(readFileSync(path,"utf8").trim().split("\n").map(line=>[line.slice(0,line.indexOf("=")),line.slice(line.indexOf("=")+1)]));
const ready=new Map();
async function prepare(purpose){
 if(ready.has(purpose))return ready.get(purpose);
 const root=join(top,purpose),e=env(purpose,root),out=await prepareUnicodeDisposable(e,fakeSecrets(purpose==="collision"?0:100));assert.equal(out.status,"prepared_not_executed");
 const value={root,e};ready.set(purpose,value);return value;
}
test("eight-only bundle copies exact reviewed SQL and strict file guard; ninth and normal registry remain separate",async()=>{
 assertProductMigrationFiles();
 for(const purpose of ["collision","success"]){
  const {root}=await prepare(purpose),migrations=join(root,"baseline/prisma/product/migrations");
  const expected=Object.keys(PRODUCT_MIGRATIONS).filter(n=>n!==ninth);assert.deepEqual(readdirSync(migrations).sort(),[...expected,".gitkeep","migration_lock.toml"].sort());
  for(const name of expected)assert.equal(sha(readFileSync(join(migrations,name,"migration.sql"))),PRODUCT_MIGRATIONS[name]);
  const registry=await import(pathToFileURL(join(root,"baseline/prisma/product/migration-files.ts")).href);
  assert.equal(Object.keys(registry.PRODUCT_MIGRATIONS).length,8);registry.assertProductMigrationFiles();assert.equal(Object.hasOwn(registry.PRODUCT_MIGRATIONS,ninth),false);
  const actual=readFileSync(join(root,"reviewed/prisma/product/migrations",ninth,"migration.sql"));assert.equal(sha(actual),PRODUCT_MIGRATIONS[ninth]);
  assert.equal(readFileSync(join(root,"reviewed/prisma/product/prisma.config.ts"),"utf8"),'import "./disposable-context.ts";\n'+read("prisma/product/prisma.config.ts"));
  const baseline=readFileSync(join(root,"baseline/prisma/product/prisma.config.ts"),"utf8");
  for(const token of ['import "./disposable-context.ts"','assertProductMigrationFiles()','length!==8','PRODUCT_UNICODE_EIGHT_BASELINE_CONFIRMED','PRODUCT_MEASUREMENT_UNICODE_MIGRATION_CONFIRMED!==undefined','target.mode!=="test"','productMigrationConfig()'])assert.ok(baseline.includes(token));
  assert.match(readFileSync(join(root,"baseline/prisma/product/disposable-context.ts"),"utf8"),/\/run\/stitchtrack-unicode-context.json/u);
 }
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,9);
});
test("private credentials/scope are independent, no source env is copied, no ninth/write activation is pre-enabled",async()=>{
 const a=(await prepare("collision")).root,b=(await prepare("success")).root;
 for(const root of [a,b]){
  assert.equal(lstatSync(root).mode&0o777,0o700);
  for(const file of ["baseline.env","proof.env","fixtures.env","admin-password","migrator-password","app-password","pgpass","context.json","plan.json","plan.env"])assert.equal(lstatSync(join(root,file)).mode&0o777,0o600);
  const baseline=readEnv(join(root,"baseline.env")),proof=readEnv(join(root,"proof.env"));
  assert.equal(baseline.PRODUCT_MEASUREMENT_UNICODE_MIGRATION_CONFIRMED,undefined);assert.equal(proof.PRODUCT_MEASUREMENT_UNICODE_MIGRATION_CONFIRMED,undefined);assert.equal(proof.PRODUCT_MEASUREMENT_UNICODE_WRITES_CONFIRMED,undefined);
  assert.equal(baseline.PRODUCT_UNICODE_EIGHT_BASELINE_CONFIRMED,"true");
  assert.equal(new URL(proof.PRODUCT_TEST_MIGRATION_DATABASE_URL).hostname,"127.0.0.1");
  const pws=["admin-password","migrator-password","app-password"].map(f=>readFileSync(join(root,f),"utf8"));assert.equal(new Set(pws).size,3);
  assert.equal(readEnv(join(root,"fixtures.env")).PRODUCT_UNICODE_DISPOSABLE_PURPOSE,root===a?"collision":"success");
  for(const folder of ["baseline","reviewed"])assert.equal(readdirSync(join(root,folder)).some(n=>n.startsWith(".env")),false);
 }
 assert.notEqual(readEnv(join(a,"proof.env")).PRODUCT_TEST_MIGRATION_DATABASE_URL,readEnv(join(b,"proof.env")).PRODUCT_TEST_MIGRATION_DATABASE_URL);
 assert.notEqual(readEnv(join(a,"fixtures.env")).PRODUCT_UNICODE_FIXTURE_USER_A,readEnv(join(b,"fixtures.env")).PRODUCT_UNICODE_FIXTURE_USER_A);
});
test("preparation refuses existing roots, absent approval, mutable image tags and non-private/inside-repo output",async()=>{
 const {e}=await prepare("collision");await assert.rejects(()=>prepareUnicodeDisposable(e,fakeSecrets()));
 for(const patch of [{PRODUCT_UNICODE_DISPOSABLE_CONFIRMED:undefined},{PRODUCT_UNICODE_DISPOSABLE_PURPOSE:"other"},{PRODUCT_UNICODE_POSTGRES_IMAGE:"postgres:16"},{PRODUCT_UNICODE_NODE_IMAGE:"node:latest"},{PRODUCT_UNICODE_DISPOSABLE_ROOT:repo},{PRODUCT_UNICODE_DISPOSABLE_ROOT:"relative"}])await assert.rejects(()=>prepareUnicodeDisposable({...e,...patch},fakeSecrets()));
 const publicParent=join(top,"public-parent");mkdirSync(publicParent);chmodSync(publicParent,0o755);await assert.rejects(()=>prepareUnicodeDisposable({...e,PRODUCT_UNICODE_DISPOSABLE_ROOT:join(publicParent,"child")},fakeSecrets()));
});
function inspection(plan,id){return [{Id:id,Name:"/"+plan.containerName,Config:{Image:plan.postgresImage,Labels:{"com.stitchtrack.unicode-disposable":plan.runId+":"+plan.purpose},
 Entrypoint:["docker-entrypoint.sh"],Env:["PGDATA=/var/lib/postgresql/data","PG_MAJOR=16","POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256","POSTGRES_USER=stitchtrack_unicode_bootstrap_admin","POSTGRES_DB=postgres","POSTGRES_PASSWORD_FILE=/run/stitchtrack-unicode/admin-password"],Cmd:["postgres","-c","listen_addresses=127.0.0.1","-c","port=5432"]},
 State:{Running:true},HostConfig:{NetworkMode:"none",PublishAllPorts:false,Privileged:false,RestartPolicy:{Name:"no"},PortBindings:{},PidMode:"",IpcMode:"private"},
 Mounts:[{Destination:"/var/lib/postgresql/data",Type:"tmpfs",RW:true},{Destination:"/run/stitchtrack-unicode",Type:"bind",Source:plan.root,RW:false}]}];}
test("container binding checks only captured JSON; wrong identity, host ports, data volumes, networks and mounts refuse",async()=>{
 const {root,e}=await prepare("collision"),plan=JSON.parse(readFileSync(join(root,"plan.json"))),id="c".repeat(64),path=join(root,"inspection.json");
 writeFileSync(join(root,"container.id"),id+"\n",{mode:0o600,flag:"wx"});
 const check=items=>{writeFileSync(path,JSON.stringify(items),{mode:0o600});return checkUnicodeContainer({...e,PRODUCT_UNICODE_DISPOSABLE_INSPECT_PATH:path});};
 assert.equal(check(inspection(plan,id)).status,"container_binding_verified");
 for(const mutate of [x=>{x.Id="d".repeat(64);},x=>{x.Config.Labels["com.stitchtrack.unicode-disposable"]="other";},x=>{x.Config.Image="postgres:latest";},x=>{x.State.Running=false;},x=>{x.HostConfig.NetworkMode="host";},x=>{x.HostConfig.PortBindings={"5432/tcp":[{HostPort:"5432"}]};},x=>{x.Mounts[0].Type="bind";},x=>{x.Mounts[1].RW=true;},x=>{x.Config.Env.push("POSTGRES_PASSWORD=forbidden");},x=>{x.HostConfig.Privileged=true;}]){
  const items=inspection(plan,id);mutate(items[0]);assert.throws(()=>check(items));
 }
});
test("SQL proposals are test-only, fresh and marker-bound; fixture grants stay minimal and history is never invented",()=>{
 const provision=read("prisma/product/setup/unicode-disposable-provision.sql"),seed=read("prisma/product/setup/unicode-disposable-fixtures.sql");
 assert.doesNotMatch(provision,/stitchtrack_product_dev|DROP DATABASE|DROP ROLE|PASSWORD\s+'/u);
 assert.equal((provision.match(/^CREATE DATABASE /gmu)||[]).length,1);assert.match(provision,/LC_COLLATE 'C' LC_CTYPE 'C'/u);
 for(const token of ["stitchtrack_unicode_bootstrap_admin","127.0.0.1","CREATE ROLE stitchtrack_product_test_migrator","CREATE ROLE stitchtrack_product_test_app","NOBYPASSRLS","COMMENT ON DATABASE","CREATE SCHEMA product AUTHORIZATION stitchtrack_product_test_migrator"])assert.ok(provision.includes(token));
 for(const [name,digest]of Object.entries(PRODUCT_MIGRATIONS).filter(([n])=>n!==ninth)){assert.ok(seed.includes(name));assert.ok(seed.includes(digest));}
 for(const token of ["shobj_description","Fixture baseline must contain no existing product records","Distinct generated fixture scope required","current_setting('stitchtrack.unicode_purpose')='collision'","U&'\\00C9paule'","U&'\\00E9PAULE'","SET CONSTRAINTS ALL IMMEDIATE","GRANT UPDATE (\"updatedAt\")"])assert.ok(seed.includes(token),token);
 for(const sql of [provision,seed])assert.doesNotMatch(sql,/INSERT INTO product\._prisma_migrations|UPDATE product\._prisma_migrations|migrate resolve|DELETE FROM|TRUNCATE/u);
 assert.equal((seed.match(/^GRANT /gmu)||[]).length,2);assert.doesNotMatch(seed,/GRANT.*(?:DELETE|ON ALL|Measurement)/u);
});
test("builder source is filesystem-only and does not read old credentials or provide destruction/deploy execution",()=>{
 const source=read("scripts/prepare-unicode-disposable.mjs");assert.doesNotMatch(source,/child_process|from "pg"|import\("pg"\)|docker\.sock|spawn\(|exec\(|\.connect\(|rmSync|unlinkSync|\.env.local/u);
 assert.match(source,/flag:"wx",mode:0o600/u);assert.match(source,/mkdirSync\(root,\{mode:0o700\}\)/u);
});
