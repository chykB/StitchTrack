// Offline source checks and Node ICU fixtures only; no PostgreSQL execution or claim of PostgreSQL equivalence.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const name="20261108_measurement_label_unicode",sql=read("prisma/product/migrations/"+name+"/migration.sql"),code=sql.replace(/--[^\n]*/gu,"");
test("ninth migration pins all eight predecessor files and exact completed/pending history",()=>{
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).filter(n=>n<=name).length,9);
 assert.equal(createHash("sha256").update(sql).digest("hex"),PRODUCT_MIGRATIONS[name]);
 const old=Object.entries(PRODUCT_MIGRATIONS).filter(([n])=>n<name);assert.equal(old.length,8);
 const eighthGrants=read("prisma/product/setup/measurement-test-permissions.sql");
 for(const [n,digest]of old){
  assert.equal(createHash("sha256").update(read("prisma/product/migrations/"+n+"/migration.sql")).digest("hex"),digest);
  assert.ok(eighthGrants.includes(digest));assert.ok(code.includes("migration_name='"+n+"' AND checksum='"+digest+"'"));
 }
 assert.equal((code.match(/finished_at IS NOT NULL/gu)||[]).length,8);
 assert.ok(code.includes("migration_name='"+name+"' AND started_at IS NOT NULL AND finished_at IS NULL"));
 assert.match(code,/count\(\*\) FROM product\._prisma_migrations\)<>9/u);
});
test("isolated PG16 target, role, schema, encoding and reviewed table set remain guarded",()=>{
 for(const token of ["server_version_num')::integer NOT BETWEEN 160000 AND 169999","current_database()<>'stitchtrack_product_test'",
  "current_user<>'stitchtrack_product_test_migrator'","session_user<>current_user","inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet",
  "current_setting('port')<>'5432'","current_setting('server_encoding')<>'UTF8'","pg_get_userbyid(nspowner)=current_user",
  "rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls","SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='15s'"])
  assert.ok(code.includes(token),token);
 assert.doesNotMatch(code,/stitchtrack_product_dev|to_regclass\('public/u);
 const tables=code.match(/IS DISTINCT FROM ARRAY\[([^\]]+)\]::text\[\]/u)[1].match(/'[^']+'/gu);assert.equal(tables.length,15);
 assert.ok(read("prisma/product/prisma.config.ts").includes('PRODUCT_MEASUREMENT_UNICODE_MIGRATION_CONFIRMED!=="true"'));
});
test("dedicated ICU secondary-strength nondeterministic collation is fresh, schema-owned and version-checked",()=>{
 assert.match(code,/CREATE COLLATION product\.measurement_label_ci\s+\(provider = icu, locale = 'und-u-kk-true-ks-level2', deterministic = false\)/u);
 assert.doesNotMatch(code,/CREATE COLLATION IF NOT EXISTS|ALTER COLLATION|REFRESH VERSION|CREATE EXTENSION/u);
 for(const token of ["c.collname='measurement_label_ci'","c.collprovider='i'","NOT c.collisdeterministic","c.colliculocale IN ('und-u-kk-true-ks-level2','und-u-kk-ks-level2')",
  "pg_get_userbyid(c.collowner)=current_user","c.collversion IS NOT NULL","c.collversion=pg_collation_actual_version(c.oid)"])
  assert.ok(code.includes(token),token);
 assert.ok(code.indexOf("OR EXISTS (SELECT 1 FROM pg_collation")<code.indexOf("CREATE COLLATION"));
});
test("duplicate preflight uses the new version-scoped equality under an exclusive lock before any index is dropped",()=>{
 const lock=code.indexOf('LOCK TABLE product."MeasurementEntry" IN ACCESS EXCLUSIVE MODE;');
 const collation=code.indexOf("CREATE COLLATION"),preflight=code.indexOf('GROUP BY "measurementVersionId","name" COLLATE product.measurement_label_ci HAVING count(*)>1');
 const drop=code.indexOf('DROP INDEX product."MeasurementEntry_version_label_key";'),create=code.indexOf('CREATE UNIQUE INDEX "MeasurementEntry_version_label_key"');
 assert.ok(lock>0&&lock<collation&&collation<preflight&&preflight<drop&&drop<create);
 assert.match(code,/RAISE EXCEPTION 'Measurement label collisions require separate owner review; no labels changed' USING ERRCODE='23505'/u);
 assert.doesNotMatch(code,/\b(?:DELETE FROM|UPDATE product\.|INSERT INTO|TRUNCATE|CASCADE|RAISE NOTICE)\b/u);
 assert.doesNotMatch(code,/RAISE EXCEPTION[^;]*(?:DETAIL|USING MESSAGE|%)/u);
 assert.match(code.trimStart(),/^BEGIN;/u);assert.ok(code.trimEnd().endsWith("COMMIT;"));
});
test("only the historical label index is replaced; labels, primary key, decimals, FKs and grants are untouched",()=>{
 assert.match(code,/ON product\."MeasurementEntry"\("measurementVersionId","name" COLLATE product\.measurement_label_ci\)/u);
 assert.equal((code.match(/DROP INDEX/gu)||[]).length,1);assert.equal((code.match(/CREATE UNIQUE INDEX/gu)||[]).length,1);
 assert.match(code,/i.indkey\[1\]=0 AND pg_get_expr\(i.indexprs,i.indrelid\) IN \('lower\(name\)','lower\("name"\)'\)/u);
 assert.doesNotMatch(code,/CREATE TABLE|ALTER TABLE|DROP TABLE|DROP CONSTRAINT|GRANT |REVOKE |CREATE ROLE|CREATE SCHEMA|lower\("name"\)\);/u);
 const schema=read("prisma/product/schema.prisma");
 assert.match(schema,/@@id\(\[measurementVersionId,name\]\)/u);assert.match(schema,/value Decimal @db.Decimal\s*\n/u);
});
test("required ASCII, accent, Yoruba and canonical cases are real-database migration canaries, not JS normalization",()=>{
 for(const literal of ["'Chest' COLLATE product.measurement_label_ci='CHEST'","U&'\\00C9paule'","U&'\\00E9PAULE'",
  "U&'\\00CCB\\00C0D\\00CD'","U&'\\00ECb\\00E0d\\00ED'","U&'e\\0301paule'","U&'e\\0323\\0302'","U&'e\\0302\\0323'","='Epaule'","U&'\\00ECb\\00E1d\\00ED'"])
  assert.ok(code.includes(literal),literal);
 assert.doesNotMatch(code,/normalize\(|lower\(U&/u);
 // Explicitly Node ICU-only fixture validation: not a PostgreSQL constraint or migration result.
 const comparison=new Intl.Collator("und",{sensitivity:"accent",usage:"sort"});
 for(const [a,b,equal]of [["Chest","CHEST",true],["\u00c9paule","\u00e9PAULE",true],["\u00ccB\u00c0D\u00cd","\u00ecb\u00e0d\u00ed",true],
  ["\u00e9paule","e\u0301paule",true],["e\u0323\u0302","e\u0302\u0323",true],["Epaule","\u00e9paule",false],["\u00ecb\u00e0d\u00ed","\u00ecb\u00e1d\u00ed",false]])
  assert.equal(comparison.compare(a,b)===0,equal);
});
test("Turkish I, Greek sigma and sharp S are observations for the installed ICU, not universal expected results",t=>{
 const comparison=new Intl.Collator("und",{sensitivity:"accent",usage:"sort"});
 const observations=[["turkish_dotless_i","I","\u0131"],["turkish_dotted_i","\u0130","i"],["greek_final_sigma","\u03c3","\u03c2"],["sharp_s","Stra\u00dfe","STRASSE"]]
  .map(([id,a,b])=>({case:id,equal:comparison.compare(a,b)===0}));
 const notes=read("prisma/product/setup/measurement-label-unicode.md");
 for(const {case:id}of observations)assert.ok(notes.includes('`'+id+'`'));
 assert.ok(notes.includes("actual PostgreSQL verification"));
 t.diagnostic(JSON.stringify({scope:"Node_ICU_only_not_PostgreSQL",observations}));
});
