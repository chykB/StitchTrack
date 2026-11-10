// Offline source contracts only. No PostgreSQL, connection, fixtures or SQL execution.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const schema=read("prisma/product/schema.prisma");
const migrationName="20261106_business_ownership";
const sql=read("prisma/product/migrations/"+migrationName+"/migration.sql");
const code=sql.replace(/--[^\n]*/gu,"");
const grants=read("prisma/product/setup/business-test-permissions.sql");
const grantCode=grants.replace(/--[^\n]*/gu,"");
const model=name=>schema.match(new RegExp("model "+name+" \\{([\\s\\S]*?)\n\\}"))[1];

test("the sixth migration is registered exactly and preserves every historical file checksum",()=>{
 assertProductMigrationFiles();assert.ok(Object.hasOwn(PRODUCT_MIGRATIONS,migrationName));
 for(const [name,digest] of Object.entries(PRODUCT_MIGRATIONS)){
  assert.equal(createHash("sha256").update(read("prisma/product/migrations/"+name+"/migration.sql")).digest("hex"),digest);
  if(name<migrationName){assert.ok(sql.includes(digest));assert.ok(grants.includes(digest));}
 }
 assert.ok(grants.includes(PRODUCT_MIGRATIONS[migrationName]));
});
test("business profile scalars match SQL, with trimmed Unicode names and only the approved timezone",()=>{
 const business=model("Business");
 for(const field of ["id","primaryOwnerUserId","name","timeZone"])assert.match(business,new RegExp("  "+field+" String.*@db.Text"));
 assert.match(code,/"name" TEXT NOT NULL/);assert.match(code,/char_length\("name"\) BETWEEN 2 AND 120/);
 assert.match(code,/"name"=btrim\("name", U&'/);assert.ok(code.includes("\\00A0"));assert.ok(code.includes("\\FEFF"));
 assert.match(business,/timeZone String @default\("Africa\/Lagos"\)/);assert.match(code,/CHECK \("timeZone"='Africa\/Lagos'\)/);
 for(const field of ["createdAt","updatedAt"]){assert.match(business,new RegExp(field+" DateTime.*@db.Timestamptz\\(3\\)"));assert.ok(code.includes('"'+field+'" TIMESTAMPTZ(3) NOT NULL'));}
 assert.doesNotMatch(business,/name String[^\n]*@unique/);assert.doesNotMatch(code,/UNIQUE[^;]*\("name"\)/);
});
test("one owning business is enforced without globally unique membership user IDs",()=>{
 const business=model("Business"),member=model("BusinessMember");
 assert.match(business,/primaryOwnerUserId String @unique/);
 assert.match(code,/CREATE UNIQUE INDEX "Business_primaryOwnerUserId_key" ON product\."Business"\("primaryOwnerUserId"\)/);
 assert.match(member,/@@id\(\[businessId,userId\]\)/);assert.match(member,/@@index\(\[userId\]\)/);
 assert.doesNotMatch(member,/userId String[^\n]*@unique|@@unique/);
 assert.doesNotMatch(code,/CREATE UNIQUE INDEX[^;]+ON product\."BusinessMember"/);
 assert.match(code,/PRIMARY KEY \("businessId","userId"\)/);
});
test("every business requires an owner member of that same business at commit; no cascade or trigger machinery",()=>{
 assert.match(code,/"primaryOwnerUserId" TEXT NOT NULL/);
 assert.match(code,/FOREIGN KEY \("id","primaryOwnerUserId"\) REFERENCES product\."BusinessMember"\("businessId","userId"\)\s+ON DELETE NO ACTION ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED/);
 assert.match(model("Business"),/fields:\[id,primaryOwnerUserId\],references:\[businessId,userId\],onDelete:NoAction,onUpdate:Restrict/);
 for(const [field,parent] of [["businessId","Business"],["userId","User"]])assert.ok(code.includes('FOREIGN KEY ("'+field+'") REFERENCES product."'+parent+'"("id") ON DELETE RESTRICT ON UPDATE RESTRICT'));
 assert.doesNotMatch(code,/CASCADE|CREATE (?:FUNCTION|TRIGGER)/);
});
test("migration targets only the isolated migrator and two new tables after five completed migrations",()=>{
 for(const token of ["current_database()<>'stitchtrack_product_test'","current_user<>'stitchtrack_product_test_migrator'","session_user<>current_user","inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet","current_setting('port')<>'5432'","count(*) FROM product._prisma_migrations)<>6","applied_steps_count=0","SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='15s'"])assert.ok(code.includes(token),token);
 assert.equal((code.match(/finished_at IS NOT NULL/g)||[]).length,5);
 assert.deepEqual([...code.matchAll(/CREATE TABLE product\."(\w+)"/g)].map(m=>m[1]),["Business","BusinessMember"]);
 for(const [,table] of code.matchAll(/ALTER TABLE product\."(\w+)"/g))assert.ok(["Business","BusinessMember"].includes(table));
 assert.doesNotMatch(code,/stitchtrack_product_dev|GRANT|CREATE (?:ROLE|DATABASE|SCHEMA)|^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/mu);
});
test("separate application grants cannot transfer ownership, edit membership or erase data",()=>{
 const statements=[...grantCode.matchAll(/^GRANT[^;]+;/gm)].map(m=>m[0]);assert.equal(statements.length,4);
 assert.match(grantCode,/GRANT UPDATE \("name","timeZone","updatedAt"\) ON product\."Business"/);
 assert.match(grantCode,/GRANT INSERT \("businessId","userId","createdAt"\) ON product\."BusinessMember"/);
 for(const grant of statements){assert.match(grant,/TO stitchtrack_product_test_app;/);assert.doesNotMatch(grant,/DELETE|ALL|CREATE|REFERENCES|TRIGGER|cleanup|migrator|product\."User"/);}
 assert.doesNotMatch(grantCode,/GRANT UPDATE[^;]*(?:primaryOwnerUserId|BusinessMember)/);
 assert.match(grantCode,/has_column_privilege\('stitchtrack_product_test_app','product\."Business"','primaryOwnerUserId','UPDATE'\)/);
 assert.match(grantCode,/has_any_column_privilege\('stitchtrack_product_test_app','product\."BusinessMember"','UPDATE'\)/);
});
test("deployment needs new explicit owner confirmation while exact-schema erasure stays closed",()=>{
 assert.ok(read("prisma/product/prisma.config.ts").includes('PRODUCT_BUSINESS_MIGRATION_CONFIRMED!=="true"'));
 const erasure=read("lib/product-auth/account-erasure.server.ts");
 assert.ok(erasure.includes('JSON.stringify([...ERASURE_TABLES,"_prisma_migrations"].sort())'));
 const tables=erasure.match(/export const ERASURE_TABLES=\[([^\]]+)\]/)[1];assert.doesNotMatch(tables,/Business/);
 assert.equal((tables.match(/"\w+"/g)||[]).length,9);
});
