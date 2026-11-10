// Offline schema/SQL/configuration checks only. No PostgreSQL or SQL execution.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {authorizeMeasurementConstraints} from "./measurement-constraints.integration.mjs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const name="20261109_order_items",sql=read("prisma/product/migrations/"+name+"/migration.sql"),code=sql.replace(/--[^\n]*/gu,"");
const grants=read("prisma/product/setup/order-test-permissions.sql"),grantCode=grants.replace(/--[^\n]*/gu,"");
const schema=read("prisma/product/schema.prisma"),model=n=>schema.match(new RegExp("model "+n+" \\{([\\s\\S]*?)\n\\}"))[1];
const digest=s=>createHash("sha256").update(s).digest("hex");
test("tenth registration and both guards preserve all nine historical files/checksums",()=>{
 assertProductMigrationFiles();assert.equal(Object.keys(PRODUCT_MIGRATIONS).length,10);
 assert.equal(digest(sql),PRODUCT_MIGRATIONS[name]);
 const prior=Object.entries(PRODUCT_MIGRATIONS).filter(([n])=>n<name);assert.equal(prior.length,9);
 for(const [n,hash]of prior){assert.equal(digest(read("prisma/product/migrations/"+n+"/migration.sql")),hash);for(const s of [code,grantCode])assert.ok(s.includes("migration_name='"+n+"' AND checksum='"+hash+"'"));}
 assert.equal((code.match(/finished_at IS NOT NULL/gu)||[]).length,9);assert.equal((grantCode.match(/finished_at IS NOT NULL/gu)||[]).length,10);
 assert.ok(code.includes("migration_name='"+name+"' AND started_at IS NOT NULL AND finished_at IS NULL"));
 assert.ok(grantCode.includes("migration_name='"+name+"' AND checksum='"+PRODUCT_MIGRATIONS[name]+"'"));
});
test("migration and grants independently reject unintended target, role, schema and history",()=>{
 for(const s of [code,grantCode]){
  for(const text of ["current_database()<>'stitchtrack_product_test'","current_user<>'stitchtrack_product_test_migrator'","session_user<>current_user",
   "inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet","current_setting('port')<>'5432'","current_setting('server_encoding')<>'UTF8'",
   "pg_get_userbyid(nspowner)=current_user","rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls","count(*) FROM product._prisma_migrations)<>10",
   "n.nspname='public' AND c.relname='_prisma_migrations'","SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='15s'"])assert.ok(s.includes(text),text);
  assert.doesNotMatch(s,/to_regclass\('public|stitchtrack_product_dev|CREATE (?:TABLE|INDEX) IF NOT EXISTS|CASCADE/u);
  assert.ok(s.trimStart().startsWith(s===grantCode?"\\set ON_ERROR_STOP on":"BEGIN;"));assert.ok(s.trimEnd().endsWith("COMMIT;"));
 }
 const tables=s=>s.match(/IS DISTINCT FROM ARRAY\[([^\]]+)\]::text\[\]/u)[1].match(/'[^']+'/gu).map(v=>v.slice(1,-1));
 assert.equal(tables(code).length,15);assert.deepEqual(tables(grantCode),[...tables(code),"Order","OrderItem"].sort());
});
test("only the approved two models/tables and necessary reference/pagination indexes are introduced",()=>{
 assert.deepEqual([...code.matchAll(/CREATE TABLE product\."(\w+)"/gu)].map(m=>m[1]),["Order","OrderItem"]);
 assert.equal((schema.match(/^model /gmu)||[]).length,16);
 for(const n of ["Order","OrderItem"]){assert.match(model(n),/id String @id @default\(uuid\(\)\) @db.Uuid/u);assert.match(model(n),/createdAt DateTime @default\(now\(\)\) @db.Timestamptz\(3\)/u);assert.match(model(n),/updatedAt DateTime @updatedAt @db.Timestamptz\(3\)/u);assert.doesNotMatch(model(n),/price|total|status|deliveryDate|image|agreement|userId/iu);}
 assert.match(model("Client"),/orders Order\[\]/u);assert.match(model("Order"),/items OrderItem\[\]/u);
 assert.match(model("MeasurementVersion"),/orderItems OrderItem\[\]/u);
 for(const columns of ['"businessId","createdAt","id"','"businessId","clientId","createdAt","id"','"orderId","createdAt","id"','"clientId","measurementVersionId"'])assert.ok(code.includes("("+columns+")"));
 assert.doesNotMatch(code,/CREATE (?:TRIGGER|FUNCTION|TYPE|EXTENSION|ROLE|SCHEMA)|\b(?:INSERT INTO|UPDATE product\.|DELETE FROM|DROP|TRUNCATE|GRANT)\b/u);
});
test("composite relationships bind item, Order and measurement to exactly the same business-owned Client",()=>{
 const relations=[['Order','businessId,clientId','businessId,id'],['OrderItem','orderId,clientId','id,clientId'],['OrderItem','clientId,measurementVersionId','clientId,id']];
 for(const [n,fields,refs]of relations)assert.ok(model(n).includes('fields:['+fields+'],references:['+refs+'],onDelete:Restrict,onUpdate:Restrict'));
 const fks=[...code.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES product\."(\w+)"\(([^)]+)\)\s+(?:MATCH SIMPLE )?ON DELETE RESTRICT ON UPDATE RESTRICT/gu)].map(m=>m.slice(1));
 assert.deepEqual(fks,[['"businessId","clientId"','Client','"businessId","id"'],['"orderId","clientId"','Order','"id","clientId"'],['"clientId","measurementVersionId"','MeasurementVersion','"clientId","id"']]);
 assert.match(code,/CREATE UNIQUE INDEX "Order_id_clientId_key" ON product\."Order"\("id","clientId"\)/u);
 assert.match(code,/CREATE UNIQUE INDEX "MeasurementVersion_clientId_id_key"\s+ON product\."MeasurementVersion"\("clientId","id"\)/u);
 assert.match(model("MeasurementVersion"),/@@unique\(\[clientId,id\]\)/u);assert.match(model("Order"),/@@unique\(\[id,clientId\]\)/u);
 assert.doesNotMatch(model("OrderItem"),/businessId|@unique|@default\(.*latest/iu);
});
test("nullable measurement selection exempts only an absent version, never the required Client",()=>{
 assert.match(model("OrderItem"),/clientId String @db.Uuid/u);assert.match(model("OrderItem"),/measurementVersionId String\? @db.Uuid/u);
 assert.match(code,/"clientId" UUID NOT NULL/u);assert.match(code,/"measurementVersionId" UUID,/u);
 assert.match(code,/REFERENCES product\."MeasurementVersion"\("clientId","id"\)\s+MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT/u);
 assert.ok(grantCode.includes("attname='clientId' AND attnotnull"));assert.ok(grantCode.includes("attname='measurementVersionId' AND NOT attnotnull"));
 assert.ok(grantCode.includes("c.confmatchtype='s'"));
});
test("description storage is Unicode code-point bounded and trimmed without restricting clothing terminology",()=>{
 assert.match(code,/char_length\("description"\) BETWEEN 1 AND 500/u);assert.match(code,/"description"=btrim\("description", U&'/u);
 const set=code.match(/btrim\("description", U&'([^']+)'\)/u)[1];
 const whitespace=new Set([...set.matchAll(/\\([0-9A-F]{4})/gu)].map(m=>String.fromCodePoint(parseInt(m[1],16))));
 assert.ok(whitespace.has("\u0085"));assert.ok(whitespace.has("\u00a0"));assert.ok(whitespace.has("\ufeff"));
 // Policy fixtures only. Real char_length/btrim enforcement needs PostgreSQL proof.
 const stored=value=>[...value].length>=1&&[...value].length<=500&&!whitespace.has([...value][0])&&!whitespace.has([...value].at(-1));
 for(const [value,ok]of [["",false],[" ",false],["\u0085",false],[" A",false],["A\ufeff",false],["A",true],["Agbada with inside pocket",true],["A  B",true],["\u{1f9f5}".repeat(500),true],["\u{1f9f5}".repeat(501),false]])assert.equal(stored(value),ok);
 assert.doesNotMatch(code,/description.*(?:lower\(|normalize\(| IN \()/iu);
});
test("runtime grants permit exact inserts and only pre-agreement content plus item update time",()=>{
 const statements=[...grantCode.matchAll(/^GRANT[^;]+;/gmu)].map(m=>m[0]);assert.equal(statements.length,4);
 assert.equal(statements[0],'GRANT SELECT ON TABLE product."Order", product."OrderItem" TO stitchtrack_product_test_app;');
 assert.equal(statements[1],'GRANT INSERT ("id","businessId","clientId","createdAt","updatedAt") ON product."Order" TO stitchtrack_product_test_app;');
 assert.equal(statements[2],'GRANT INSERT ("id","orderId","clientId","description","measurementVersionId","createdAt","updatedAt") ON product."OrderItem" TO stitchtrack_product_test_app;');
 assert.equal(statements[3],'GRANT UPDATE ("description","measurementVersionId","updatedAt") ON product."OrderItem" TO stitchtrack_product_test_app;');
 for(const s of statements)assert.doesNotMatch(s,/DELETE|TRUNCATE|MeasurementVersion|MeasurementEntry|cleanup|GRANT ALL/u);
 assert.ok(grantCode.includes("'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'"));assert.ok(grantCode.includes("has_column_privilege('stitchtrack_product_test_app',target,column_name,'UPDATE')"));
 assert.ok(grantCode.includes("column_name IN ('description','measurementVersionId','updatedAt')"));assert.ok(grantCode.includes('Order cleanup access is not authorized'));
 assert.doesNotMatch(grantCode,/CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|GRANT .* ON SCHEMA/u);
});
test("historical measurement mutation permissions and erasure guards remain closed",()=>{
 const erasure=read('lib/product-auth/account-erasure.server.ts');
 assert.ok(erasure.includes('JSON.stringify([...ERASURE_TABLES,"_prisma_migrations"].sort())'));
 assert.doesNotMatch(erasure.match(/export const ERASURE_TABLES=\[([^\]]+)\]/u)[1],/Order/u);
 assert.doesNotMatch(grantCode,/^(?:GRANT|REVOKE)[^;]* ON (?:TABLE )?product\."Measurement/gmu);
 for(const f of ['measurement-constraints.integration.mjs','measurement-api.integration.mjs','measurement-api-cleanup.mjs','measurement-unicode.integration.mjs']){
  assert.match(read('tests/product-auth/'+f),/Object.keys\(PRODUCT_MIGRATIONS\).length,9/u);
 }
 const env={NODE_ENV:'test',PRODUCT_DATABASE_MODE:'test',PRODUCT_DATABASE_CONFIRMED:'true',PRODUCT_MIGRATION_CONFIRMED:'true',PRODUCT_MEASUREMENT_CONSTRAINT_CHECK_CONFIRMED:'true',PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED:'true',PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:'synthetic-a',PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_B_ID:'synthetic-b',PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID:'11111111-1111-4111-8111-111111111111',PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_B_ID:'22222222-2222-4222-8222-222222222222',PRODUCT_TEST_MIGRATION_DATABASE_URL:'postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product'};
 assert.throws(()=>authorizeMeasurementConstraints(['--owner-measurement-constraints'],env),error=>error.details.stage==='migration_files');
});
test("guarded Prisma deployment requires independent owner activation while offline commands stay URL-free",()=>{
 const config=read('prisma/product/prisma.config.ts');
 assert.match(config,/command==="deploy" && process.env.PRODUCT_ORDER_MIGRATION_CONFIRMED!=="true"/u);
 assert.ok(config.indexOf('PRODUCT_ORDER_MIGRATION_CONFIRMED')<config.indexOf('assertProductMigrationFiles();'));
 assert.match(config,/target.mode!=="test"/u);assert.match(config,/const target=offline\?undefined:productMigrationConfig\(\)/u);
});
test("documentation states the service boundaries and new live proof prerequisites without claiming execution",()=>{
 const docs=read('prisma/product/setup/order-foundation.md');
 for(const text of ['1-50','empty Order INSERT','MATCH SIMPLE','17 tables','User -> Client -> Order','No deployment','U+0085','U+0000','fail-closed','updatedAt','Orders API Slice 1','later M3','agreements M4'])assert.ok(docs.includes(text),text);
});
