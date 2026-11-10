// Offline source/fixture checks only. No PostgreSQL, SQL execution or constraint proof.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const name="20261108_measurement_history",schema=read("prisma/product/schema.prisma");
const sql=read("prisma/product/migrations/"+name+"/migration.sql"),code=sql.replace(/--[^\n]*/gu,"");
const grants=read("prisma/product/setup/measurement-test-permissions.sql"),grantCode=grants.replace(/--[^\n]*/gu,"");
const model=n=>schema.match(new RegExp("model "+n+" \\{([\\s\\S]*?)\n\\}"))[1];
test("eighth manifest and both SQL guards preserve all seven historical migrations and checksums",()=>{
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).filter(n=>n<=name).length,8);
 assert.equal(createHash("sha256").update(sql).digest("hex"),PRODUCT_MIGRATIONS[name]);
 const historical=Object.entries(PRODUCT_MIGRATIONS).filter(([n])=>n<name);assert.equal(historical.length,7);
 const previous=read("prisma/product/setup/client-test-permissions.sql");
 for(const [n,digest]of historical){
  assert.equal(createHash("sha256").update(read("prisma/product/migrations/"+n+"/migration.sql")).digest("hex"),digest);
  assert.ok(previous.includes(digest));assert.ok(sql.includes(digest));assert.ok(grants.includes(digest));
 }
 assert.ok(grants.includes(PRODUCT_MIGRATIONS[name]));
 assert.equal((code.match(/finished_at IS NOT NULL/gu)||[]).length,7);
 assert.equal((grantCode.match(/finished_at IS NOT NULL/gu)||[]).length,8);
 assert.ok(code.includes("migration_name='"+name+"' AND started_at IS NOT NULL AND finished_at IS NULL"));
 assert.doesNotMatch(grantCode,/applied_steps_count=0/u);
});
test("only two history tables and the necessary Client reference index are added",()=>{
 assert.deepEqual([...code.matchAll(/CREATE TABLE product\."(\w+)"/gu)].map(m=>m[1]),["MeasurementVersion","MeasurementEntry"]);
 assert.deepEqual([...code.matchAll(/ALTER TABLE product\."(\w+)"/gu)].map(m=>m[1]),["MeasurementVersion","MeasurementEntry"]);
 assert.match(code,/CREATE UNIQUE INDEX "Client_businessId_id_key" ON product\."Client"\("businessId","id"\)/u);
 assert.match(model("Client"),/@@unique\(\[businessId,id\]\)/u);
 assert.match(model("Client"),/measurementVersions MeasurementVersion\[\]/u);
 assert.doesNotMatch(code,/CREATE (?:EXTENSION|FUNCTION|TRIGGER|ROLE|DATABASE|SCHEMA|TYPE)|CASCADE|\bGRANT\b|^\s*(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/gmu);
});
test("version identity, exact unit values and database-recorded time match Prisma",()=>{
 const version=model("MeasurementVersion");
 assert.match(version,/id String @id @default\(uuid\(\)\) @db.Uuid/u);
 assert.match(version,/unit String @db.Text/u);assert.match(code,/"unit" TEXT NOT NULL/u);
 assert.match(code,/CHECK \("unit" IN \('cm','in'\)\)/u);
 assert.match(version,/recordedAt DateTime @default\(now\(\)\) @db.Timestamptz\(3\)/u);
 assert.match(code,/"recordedAt" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/u);
 assert.doesNotMatch(version,/updatedAt|@updatedAt/u);
 assert.doesNotMatch(model("MeasurementEntry"),/updatedAt|@updatedAt|^  id /mu);
});
test("composite Client FK prevents cross-business versions; entry FK and parent changes are restrictive",()=>{
 assert.match(model("MeasurementVersion"),/fields:\[businessId,clientId\],references:\[businessId,id\],onDelete:Restrict,onUpdate:Restrict/u);
 assert.match(code,/FOREIGN KEY \("businessId","clientId"\) REFERENCES product\."Client"\("businessId","id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT/u);
 assert.match(model("MeasurementEntry"),/fields:\[measurementVersionId\],references:\[id\],onDelete:Restrict,onUpdate:Restrict/u);
 assert.match(code,/FOREIGN KEY \("measurementVersionId"\) REFERENCES product\."MeasurementVersion"\("id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT/u);
 assert.equal((code.match(/FOREIGN KEY/gu)||[]).length,2);
 assert.doesNotMatch(model("MeasurementEntry"),/businessId|clientId|userId/u);
});
test("per-client version uniqueness and positive numbers support locked sequential allocation",()=>{
 assert.match(model("MeasurementVersion"),/versionNumber Int/u);
 assert.match(model("MeasurementVersion"),/@@unique\(\[clientId,versionNumber\]\)/u);
 assert.match(code,/CHECK \("versionNumber">=1\)/u);
 assert.match(code,/CREATE UNIQUE INDEX "MeasurementVersion_clientId_versionNumber_key"\s+ON product\."MeasurementVersion"\("clientId","versionNumber"\)/u);
 assert.doesNotMatch(code,/SERIAL|SEQUENCE|MAX\(/u);
});
test("custom Unicode labels are trimmed, bounded and nonblank, with a SQL-only lowercase unique index",()=>{
 assert.match(model("MeasurementEntry"),/name String @db.Text/u);
 assert.match(model("MeasurementEntry"),/@@id\(\[measurementVersionId,name\]\)/u);
 assert.match(code,/PRIMARY KEY \("measurementVersionId","name"\)/u);
 assert.match(code,/char_length\("name"\) BETWEEN 1 AND 60/u);
 assert.match(code,/"name"=btrim\("name", U&'/u);
 assert.ok(code.includes("\\00A0"));assert.ok(code.includes("\\FEFF"));assert.ok(code.includes("\\0085"));
 assert.match(code,/length\(translate\("name"/u);
 assert.match(code,/CREATE UNIQUE INDEX "MeasurementEntry_version_label_key"\s+ON product\."MeasurementEntry"\("measurementVersionId",lower\("name"\)\)/u);
 assert.doesNotMatch(code,/"name" IN|template|category/iu);
 // Code-point/trim boundary examples, not a simulation of PostgreSQL collation/casing.
 for(const [value,expected]of [["",false],[" \u00a0",false],["Shoulder",true],["\u{1f9f5}".repeat(60),true],["\u{1f9f5}".repeat(61),false],[" Shoulder ",false]])
  assert.equal(value===value.trim()&&[...value].length>=1&&[...value].length<=60&&value.trim().length>0,expected);
});
test("label collision fixtures cover ordinary case, surrounding whitespace and accented/Yoruba labels",()=>{
 // These are required input-contract examples. JS fixture checks do NOT prove SQL casing.
 const cases=[
  ["ordinary_case","Chest","CHEST"],
  ["surrounding_whitespace","\t Waist\u00a0","waist"],
  ["accented_case","\u00c9paule","\u00e9PAULE"],
  ["yoruba_case","\u00ccB\u00c0D\u00cd","\u00ecb\u00e0d\u00ed"],
 ];
 assert.match(code,/ON product\."MeasurementEntry"\("measurementVersionId",lower\("name"\)\)/u);
 assert.match(code,/"name"=btrim\("name", U&'/u);
 for(const [id,first,second]of cases){
  const names=[first.trim(),second.trim()];
  assert.ok(names.every(name=>[...name].length>=1&&[...name].length<=60),id);
  assert.notEqual(first,second,id);assert.equal(names[0].toLowerCase(),names[1].toLowerCase(),id);
 }
 // Stored untrimmed variants must fail the name CHECK, not become a distinct label.
 assert.notEqual(cases[1][1],cases[1][1].trim());
 // The version prefix is essential: the same normalized label is permitted in another version.
 assert.notEqual(JSON.stringify(["version-a","chest"]),JSON.stringify(["version-b","chest"]));
});
test("Unicode edge fixtures require live collation confirmation; no full case-fold or normalization is invented",()=>{
 const cases=[
  ["canonical_forms","\u00e9paule","e\u0301paule"],
  ["turkish_dotless_i","I","\u0131"],
  ["turkish_dotted_i","\u0130","i"],
  ["greek_final_sigma","\u03c3","\u03c2"],
  ["sharp_s","Stra\u00dfe","STRASSE"],
 ];
 for(const [id,first,second]of cases)assert.notEqual(first.toLowerCase(),second.toLowerCase(),id);
 assert.equal(cases[0][1].normalize("NFC"),cases[0][2].normalize("NFC"));
 assert.doesNotMatch(code,/casefold\(|normalize\(|unaccent\(|citext|CREATE COLLATION/iu);
 const notes=read("prisma/product/setup/measurement-history.md");
 for(const id of ["canonical_forms","turkish_dotless_i","turkish_dotted_i","greek_final_sigma","sharp_s"])
  assert.ok(notes.includes('`'+id+'`'),id);
 assert.ok(notes.includes("not a claim about PostgreSQL results"));
});
test("unconstrained NUMERIC rejects out-of-bounds values and excess scale instead of rounding",()=>{
 assert.match(model("MeasurementEntry"),/value Decimal @db.Decimal\s*\n/u);
 assert.match(code,/"value" NUMERIC NOT NULL/u);assert.doesNotMatch(code,/NUMERIC\s*\(/iu);
 assert.match(code,/CHECK \("value">0 AND "value"<=1000 AND scale\("value"\)<=2\)/u);
 assert.doesNotMatch(code,/round\(|trunc\(/iu);
 // Exact integer arithmetic checks the approved boundary fixtures, not PostgreSQL execution.
 const policy=value=>{
  if(!/^-?\d+(?:\.\d+)?$/u.test(value))return false;
  const [whole,fraction=""]=value.split(".");if(fraction.length>2)return false;
  const hundredths=BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0"));
  return !value.startsWith("-")&&hundredths>0n&&hundredths<=100000n;
 };
 for(const [value,expected]of [["0",false],["-1",false],["0.01",true],["999.99",true],["1000",true],["1000.00",true],["1000.01",false],["1.001",false],["0.001",false],["1.000",false],["NaN",false],["Infinity",false]])
  assert.equal(policy(value),expected,value);
});
test("separate grants only allow SELECT and explicit-column INSERT, denying inherited history mutation and cleanup",()=>{
 const statements=[...grantCode.matchAll(/^GRANT[^;]+;/gmu)].map(m=>m[0]);assert.equal(statements.length,3);
 assert.match(grantCode,/GRANT SELECT ON TABLE product\."MeasurementVersion", product\."MeasurementEntry" TO stitchtrack_product_test_app;/u);
 assert.match(grantCode,/GRANT INSERT \("id","businessId","clientId","versionNumber","unit","recordedAt"\) ON product\."MeasurementVersion"/u);
 assert.match(grantCode,/GRANT INSERT \("measurementVersionId","name","value"\) ON product\."MeasurementEntry"/u);
 for(const statement of statements){assert.match(statement,/TO stitchtrack_product_test_app;/u);assert.doesNotMatch(statement,/UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|Client|cleanup/u);}
 assert.ok(grantCode.includes("'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'"));
 assert.ok(grantCode.includes("has_any_column_privilege('stitchtrack_product_test_app',target,'UPDATE,REFERENCES')"));
 assert.ok(grantCode.includes("Measurement cleanup access is not authorized"));
 assert.ok(grantCode.includes("has_column_privilege('stitchtrack_product_test_app','product.\"Client\"','updatedAt','UPDATE')"));
 assert.ok(read("prisma/product/setup/client-test-permissions.sql").includes('GRANT UPDATE ("fullName","phone","email","updatedAt")'));
 assert.match(grantCode,/atttypmod=-1/u);
});
test("migration and permission guards require exact owned loopback product-test target and eight-row history",()=>{
 for(const source of [code,grantCode]){
  for(const token of ["current_database()<>'stitchtrack_product_test'","current_user<>'stitchtrack_product_test_migrator'","session_user<>current_user",
   "inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet","current_setting('port')<>'5432'","current_setting('server_encoding')<>'UTF8'",
   "count(*) FROM product._prisma_migrations)<>8","SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='15s'","SET LOCAL TimeZone='UTC'",
   "rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls","pg_get_userbyid(nspowner)=current_user"])
   assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/stitchtrack_product_dev/u);assert.ok(source.trimEnd().endsWith("COMMIT;"));
 }
 assert.ok(read("prisma/product/prisma.config.ts").includes('PRODUCT_MEASUREMENT_MIGRATION_CONFIRMED!=="true"'));
 const tables=source=>source.match(/IS DISTINCT FROM ARRAY\[([^\]]+)\]::text\[\]/u)[1].match(/'[^']+'/gu).map(s=>s.slice(1,-1));
 const before=tables(code),after=tables(grantCode);
 assert.equal(before.length,13);assert.deepEqual(after,[...before,"MeasurementVersion","MeasurementEntry"].sort());
});
test("future service obligations are explicit; exact-schema erasure protection remains closed",()=>{
 const notes=read("prisma/product/setup/measurement-history.md");
 for(const text of ["1-50","User -> Client","MAX(versionNumber) + 1","zero entries","PostgreSQL lower(name)","no measurement API","No PostgreSQL verification"])
  assert.ok(notes.includes(text),text);
 const erasure=read("lib/product-auth/account-erasure.server.ts");
 assert.ok(erasure.includes('JSON.stringify([...ERASURE_TABLES,"_prisma_migrations"].sort())'));
 assert.doesNotMatch(erasure.match(/export const ERASURE_TABLES=\[([^\]]+)\]/u)[1],/Measurement|Client|Business/u);
});
