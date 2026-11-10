// Offline schema/DDL source checks only: no PostgreSQL connection or SQL execution.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {emailSchema} from "../../lib/auth/schemas.ts";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const name="20261107_client_records",schema=read("prisma/product/schema.prisma");
const sql=read("prisma/product/migrations/"+name+"/migration.sql"),code=sql.replace(/--[^\n]*/gu,"");
const grants=read("prisma/product/setup/client-test-permissions.sql"),grantCode=grants.replace(/--[^\n]*/gu,"");
const model=n=>schema.match(new RegExp("model "+n+" \\{([\\s\\S]*?)\n\\}"))[1];
test("seventh migration is pinned after all six unchanged historical checksums",()=>{
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).filter(n=>n<=name).length,7);
 assert.equal(createHash("sha256").update(sql).digest("hex"),PRODUCT_MIGRATIONS[name]);
 const historical=Object.entries(PRODUCT_MIGRATIONS).filter(([n])=>n<name);assert.equal(historical.length,6);
 const previous=read("prisma/product/setup/business-test-permissions.sql");
 for(const [n,digest]of historical){
  assert.equal(createHash("sha256").update(read("prisma/product/migrations/"+n+"/migration.sql")).digest("hex"),digest);
  assert.ok(previous.includes(digest),"Historical checksum remains pinned by the unchanged sixth-migration grants");
  assert.ok(sql.includes(digest));assert.ok(grants.includes(digest));
 }
 assert.ok(grants.includes(PRODUCT_MIGRATIONS[name]));
});
test("only Client is added, with native UUID identity, nullable contacts and existing timestamp conventions",()=>{
 assert.match(model("Client"),/id String @id @default\(uuid\(\)\) @db.Uuid/u);
 assert.match(code,/"id" UUID NOT NULL/u);assert.match(code,/PRIMARY KEY \("id"\)/u);
 for(const field of ["businessId","fullName"]){assert.match(model("Client"),new RegExp(field+" String @db.Text"));assert.ok(code.includes('"'+field+'" TEXT NOT NULL'));}
 for(const field of ["phone","email"]){assert.match(model("Client"),new RegExp(field+" String\\? @db.Text"));assert.ok(code.includes('"'+field+'" TEXT,'));assert.ok(code.includes('"'+field+'" IS NULL OR'));}
 assert.match(model("Client"),/createdAt DateTime @default\(now\(\)\) @db.Timestamptz\(3\)/u);
 assert.match(model("Client"),/updatedAt DateTime @updatedAt @db.Timestamptz\(3\)/u);
 assert.match(code,/"createdAt" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/u);assert.match(code,/"updatedAt" TIMESTAMPTZ\(3\) NOT NULL,/u);
 assert.deepEqual([...code.matchAll(/CREATE TABLE product\."(\w+)"/gu)].map(m=>m[1]),["Client"]);
 assert.deepEqual([...code.matchAll(/ALTER TABLE product\."(\w+)"/gu)].map(m=>m[1]),["Client"]);
 assert.doesNotMatch(code,/CREATE (?:EXTENSION|FUNCTION|TRIGGER|ROLE|DATABASE|SCHEMA)|CASCADE|GRANT|^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/gmu);
 assert.doesNotMatch(model("Client"),/userId|password|verified|invitation|(?<!@)@unique/iu);
});
test("database name/contact checks encode trimmed Unicode names, formatted phones and canonical email storage",()=>{
 assert.match(code,/char_length\("fullName"\) BETWEEN 1 AND 120/u);
 for(const field of ["fullName","phone"]){assert.ok(code.includes('"'+field+'"=btrim("'+field+'", U&\''));}
 assert.ok(code.includes("\\00A0"));assert.ok(code.includes("\\FEFF"));assert.ok(code.includes("\\0085"));
 assert.match(code,/length\(translate\("fullName"/u);
 assert.match(code,/char_length\(regexp_replace\("phone" COLLATE "C", '\[\^0-9\]', '', 'g'\)\) BETWEEN 7 AND 15/u);
 // Exercise the extracted ASCII pattern without pretending JavaScript proves PG enforcement.
 const phonePattern=new RegExp(code.match(/"phone" COLLATE "C" ~ '([^']+)'/u)[1]);
 for(const value of ["1234567","0803 123 4567","+234 (803) 123-4567","123.456.7890","123456789012345"])assert.ok(phonePattern.test(value));
 for(const value of ["","+","abc1234567","1234567 ext 8","123\t4567","\uff11\uff12\uff13\uff14\uff15\uff16\uff17","123+4567"])assert.equal(phonePattern.test(value),false);
 assert.match(code,/"email" COLLATE "C" ~ '\^\[!-~\]\+\$'/u);assert.match(code,/"email" COLLATE "C" !~ '\[A-Z\]'/u);
 const emailPattern=new RegExp(code.match(/"email" COLLATE "C" ~ '(\^\[\^@\][^']+)'/u)[1]);
 for(const raw of [" Tailor@EXAMPLE.INVALID ","tailor+studio@example.invalid","o'neil@example.invalid"]){
  const canonical=emailSchema.parse(raw);assert.ok(emailPattern.test(canonical));assert.match(canonical,/^[!-~]+$/u);assert.doesNotMatch(canonical,/[A-Z]/u);
 }
 // Blank input must later become NULL; an empty string is never a valid stored email.
 assert.equal(emailSchema.safeParse("").success,false);assert.equal(emailPattern.test(""),false);
});
test("restrictive business FK and scoped pagination index do not merge contacts or alter ownership",()=>{
 assert.match(model("Business"),/clients Client\[\]/u);
 assert.match(model("Client"),/business Business @relation\(fields:\[businessId\],references:\[id\],onDelete:Restrict,onUpdate:Restrict\)/u);
 assert.match(code,/FOREIGN KEY \("businessId"\) REFERENCES product\."Business"\("id"\) ON DELETE RESTRICT ON UPDATE RESTRICT/u);
 assert.match(model("Client"),/@@index\(\[businessId,createdAt,id\]\)/u);
 assert.match(code,/CREATE INDEX "Client_businessId_createdAt_id_idx" ON product\."Client"\("businessId","createdAt","id"\)/u);
 assert.doesNotMatch(code,/CREATE UNIQUE INDEX|UNIQUE\s*\(/u);
 assert.equal((code.match(/CREATE INDEX/gu)||[]).length,1);assert.equal((code.match(/FOREIGN KEY/gu)||[]).length,1);
});
test("migration and separate grants require the exact isolated target and correct completed/pending history",()=>{
 for(const source of [code,grantCode]){
  for(const token of ["current_database()<>'stitchtrack_product_test'","current_user<>'stitchtrack_product_test_migrator'","session_user<>current_user","inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet","current_setting('port')<>'5432'","current_setting('server_encoding')<>'UTF8'","count(*) FROM product._prisma_migrations)<>7","SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='15s'","SET LOCAL TimeZone='UTC'"])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/stitchtrack_product_dev/u);assert.ok(source.trimEnd().endsWith("COMMIT;"));
 }
 assert.equal((code.match(/finished_at IS NOT NULL/gu)||[]).length,6);assert.match(code,/applied_steps_count=0/u);
 assert.equal((grantCode.match(/finished_at IS NOT NULL/gu)||[]).length,7);assert.doesNotMatch(grantCode,/applied_steps_count=0/u);
 assert.ok(read("prisma/product/prisma.config.ts").includes('PRODUCT_CLIENT_MIGRATION_CONFIRMED!=="true"'));
});
test("application grants cannot delete/reassign clients; no cleanup access is introduced",()=>{
 const statements=[...grantCode.matchAll(/^GRANT[^;]+;/gmu)].map(m=>m[0]);assert.equal(statements.length,3);
 assert.match(grantCode,/GRANT SELECT ON TABLE product\."Client" TO stitchtrack_product_test_app;/u);
 assert.match(grantCode,/GRANT INSERT \("id","businessId","fullName","phone","email","createdAt","updatedAt"\)/u);
 assert.match(grantCode,/GRANT UPDATE \("fullName","phone","email","updatedAt"\)/u);
 for(const statement of statements){assert.match(statement,/ON (?:TABLE )?product\."Client" TO stitchtrack_product_test_app;/u);assert.doesNotMatch(statement,/DELETE|TRUNCATE|REFERENCES|TRIGGER|cleanup|migrator/u);}
 for(const field of ["id","businessId","createdAt"])assert.ok(grantCode.includes("has_column_privilege('stitchtrack_product_test_app','product.\"Client\"','"+field+"','UPDATE')"));
 assert.ok(grantCode.includes("Client cleanup access is not authorized"));
 const erasure=read("lib/product-auth/account-erasure.server.ts");assert.ok(erasure.includes('JSON.stringify([...ERASURE_TABLES,"_prisma_migrations"].sort())'));
 assert.doesNotMatch(erasure.match(/export const ERASURE_TABLES=\[([^\]]+)\]/u)[1],/Client|Business/u);
});


test("phone SQL source caps total formatting length at 32 without changing optionality or 7-15 digits",()=>{
 const constraint=code.match(/CONSTRAINT "Client_phone_check" CHECK \(([\s\S]+?)\)\),/u)[1];
 assert.match(constraint,/"phone" IS NULL OR/u);
 assert.match(constraint,/char_length\("phone"\)<=32 AND/u);
 assert.match(constraint,/BETWEEN 7 AND 15/u);
 const pattern=new RegExp(constraint.match(/"phone" COLLATE "C" ~ '([^']+)'/u)[1]);
 const maximum=Number(constraint.match(/char_length\("phone"\)<=([0-9]+)/u)[1]);
 const [,minimumDigits,maximumDigits]=constraint.match(/BETWEEN ([0-9]+) AND ([0-9]+)/u).map(Number);
 // ASCII fixture checks against extracted limits; PostgreSQL enforcement is still owner-run.
 for(const [value,expected]of [["1234567"+"-".repeat(25),true],["1234567"+"-".repeat(26),false],
  ["+234 (803) 123-4567",true],["123456",false],["123456789012345",true],["1234567890123456",false]]){
  const digits=value.replace(/[^0-9]/gu,"").length;
  assert.equal(pattern.test(value)&&value.length<=maximum&&digits>=minimumDigits&&digits<=maximumDigits,expected);
 }
});
test("shared email normalization satisfies all SQL email predicates without adding an unapproved maximum",()=>{
 const constraint=code.match(/CONSTRAINT "Client_email_check" CHECK \(([\s\S]+?)\)\)\n/u)[1];
 const positive=[...constraint.matchAll(/"email" COLLATE "C" ~ '([^']+)'/gu)].map(m=>new RegExp(m[1]));
 const negative=[...constraint.matchAll(/"email" COLLATE "C" !~ '([^']+)'/gu)].map(m=>new RegExp(m[1]));
 assert.equal(positive.length,2);assert.equal(negative.length,1);
 const acceptsStored=value=>positive.every(p=>p.test(value))&&negative.every(p=>!p.test(value));
 const valid=[" Tailor@EXAMPLE.INVALID ","o'neil@example.invalid","tailor+studio@example.invalid","name@xn--bcher-kva.example",
  "a".repeat(300)+"@example.invalid","a@"+"example.".repeat(40)+"invalid"];
 for(const raw of valid){
  const parsed=emailSchema.safeParse(raw);assert.equal(parsed.success,true);
  assert.equal(parsed.data,raw.trim().toLowerCase());assert.equal(acceptsStored(parsed.data),true);
 }
 assert.ok(emailSchema.parse(valid[4]).length>254);assert.ok(emailSchema.parse(valid[5]).length>254);
 for(const raw of ["\u00f3la@example.invalid","tailor@\u00e9xample.invalid","\uff54ailor@example.invalid","a..b@example.invalid",""])
  assert.equal(emailSchema.safeParse(raw).success,false);
 assert.equal(acceptsStored("Tailor@EXAMPLE.INVALID"),false,"Store parsed output, not raw input");
 assert.equal(acceptsStored("a..b@example.invalid"),true,"SQL is a storage backstop, not a second full email validator");
 assert.doesNotMatch(constraint,/char_length|octet_length/u);assert.match(model("Client"),/email String\? @db.Text/u);
});
