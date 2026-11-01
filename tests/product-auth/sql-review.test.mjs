// Source-contract checks only: no SQL execution or PostgreSQL compatibility claim.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {productPrismaCommand} from "../../prisma/product/targets.ts";
const {hashPassword} = await import("../../lib/auth/password.server.ts");
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../../prisma/product/migrations/20261029_product_auth_initial/migration.sql");
const code = sql.replace(/--[^\n]*/gu, "");
const schema = read("../../prisma/product/schema.prisma");
const models = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gmu)];
const table = name => code.match(new RegExp('CREATE TABLE "product"\\."' + name + '" \\(\\n([\\s\\S]*?)\\n\\);'))?.[1];

test("single complete eight-table baseline matches every scalar column, type, default and nullability", () => {
  assert.equal(models.length, 8); let count = 0;
  for (const [, name, body] of models) {
    const ddl = table(name); assert.ok(ddl, name);
    const actual = [...ddl.matchAll(/^  "(\w+)" (TEXT|BOOLEAN|INTEGER|BYTEA|TIMESTAMPTZ\(3\))([^\n]*),$/gmu)];
    const fields = [...body.matchAll(/^  (\w+) (String|Boolean|Int|Bytes|DateTime)(\?)?(?: |$)([^\n]*)/gmu)];
    assert.equal(actual.length, fields.length, name);
    for (const [, field, type, nullable, attributes] of fields) {
      const physical = attributes.match(/@map\("(\w+)"\)/u)?.[1] ?? field;
      const column = actual.find(row => row[1] === physical); assert.ok(column, name + "." + physical);
      assert.equal(column[2], {String:"TEXT", Boolean:"BOOLEAN", Int:"INTEGER", Bytes:"BYTEA", DateTime:"TIMESTAMPTZ(3)"}[type]);
      assert.equal(column[3].includes("NOT NULL"), !nullable);
      const expected = attributes.match(/@default\((now\(\)|false|0|"pending")\)/u)?.[1];
      const literal = {"now()":"CURRENT_TIMESTAMP", false:"false", 0:"0", '"pending"':"'pending'"}[expected];
      assert.equal(column[3].match(/DEFAULT (.+)$/u)?.[1], literal);
      count++;
    }
    assert.ok(ddl.includes('PRIMARY KEY ("id")'));
  }
  assert.equal(count, 70);
  const dirs = readdirSync(new URL("../../prisma/product/migrations/", import.meta.url), {withFileTypes:true}).filter(entry => entry.isDirectory());
  assert.deepEqual(dirs.map(entry => entry.name), ["20261029_product_auth_initial"]);
});
test("all declared unique/index/FK contracts are included; outbox ownership has one required path", () => {
  let indexes = 0, fks = 0;
  for (const [, name, body] of models) {
    const physical = field => body.match(new RegExp('^  ' + field + ' [^\\n]*@map\\("(\\w+)"\\)', 'm'))?.[1] ?? field;
    const groups = [...body.matchAll(/@@(unique|index)\(\[([^\]]+)\]\)/gu)].map(([,kind,fields]) => [kind,fields.split(",").map(f => physical(f.trim()))]);
    for (const [,field] of body.matchAll(/^  (\w+) [^\n]*@unique/gmu)) groups.push(["unique",[physical(field)]]);
    for (const [kind,fields] of groups) {
      const expected = `CREATE ${kind === "unique" ? "UNIQUE " : ""}INDEX "${name}_${fields.join("_")}_${kind === "unique" ? "key" : "idx"}" ON "product"."${name}"(${fields.map(f => '"' + f + '"').join(", ")});`;
      assert.ok(code.includes(expected), expected); indexes++;
    }
    for (const [,target,field,ref,del,upd] of body.matchAll(/  \w+ (\w+)\?? @relation\(fields:\[([^\]]+)\],references:\[([^\]]+)\],onDelete:(\w+),onUpdate:(\w+)\)/gu)) {
      const action = {Restrict:"RESTRICT", SetNull:"SET NULL"};
      assert.ok(code.includes(`FOREIGN KEY ("${field}") REFERENCES "product"."${target}"("${ref}") ON DELETE ${action[del]} ON UPDATE ${action[upd]}`)); fks++;
    }
  }
  assert.equal(indexes, 16); assert.equal(fks, 7);
  assert.equal((code.match(/CREATE (?:UNIQUE )?INDEX /gu) ?? []).length, 17);
  assert.equal((code.match(/FOREIGN KEY /gu) ?? []).length, 7);
  assert.doesNotMatch(table("EmailOutbox"), /"userId"/u);
  assert.doesNotMatch(schema.split("model EmailOutbox {")[1].split("\n}")[0], /userId|\buser User/u);
  assert.doesNotMatch(code, /Issuance_id_user_key|issuance_user_fkey/u);
});
test("target preflight and all DDL stay isolated while nonexact migration commands remain blocked", () => {
  assert.match(code.trimStart(), /^BEGIN;/u); assert.ok(code.trimEnd().endsWith("COMMIT;"));
  assert.match(code, /current_database\(\) NOT IN \('stitchtrack_product_dev', 'stitchtrack_product_test'\)/u);
  assert.match(code, /nspowner = \(SELECT oid FROM pg_roles WHERE rolname = current_user\)/u);
  assert.match(code, /rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls/u);
  assert.doesNotMatch(code, /CREATE (?:SCHEMA|DATABASE|ROLE|FUNCTION|TRIGGER)|\bGRANT\b|(?:^|\n)\s*(?:DROP|DELETE|UPDATE)\b|"(?:public|task04_test)"\./u);
  for (const [,name] of code.matchAll(/(?:CREATE TABLE|ALTER TABLE|REFERENCES| ON) "product"\."(\w+)"/gu)) assert.ok(models.some(m => m[1] === name));
  for (const args of [["migrate","deploy"],["migrate","dev"],["migrate","diff"],["migrate","reset"],["db","push"],["migrate","resolve"]]) assert.throws(() => productPrismaCommand(args));
});
test("open issuance uniqueness is independent of expiry and writer closes old slot first", () => {
  const index = code.match(/CREATE UNIQUE INDEX "Issuance_one_open_per_user"[\s\S]*?;/u)?.[0]; assert.ok(index);
  assert.match(index, /WHERE "consumedAt" IS NULL AND "supersededAt" IS NULL/u);
  assert.doesNotMatch(index, /now|expiresAt|failedAttempts/iu);
  const writer = read("../../lib/product-auth/registration.server.ts").split("async reissue")[1];
  assert.ok(writer.indexOf("supersededAt: time") < writer.indexOf("return issue("));
  assert.match(code, /"failedAttempts" BETWEEN 0 AND 3/u);
  assert.match(code, /"expiresAt" <= "createdAt" \+ INTERVAL '5 minutes'/u);
  assert.match(code, /"consumedAt" < "expiresAt" AND "failedAttempts" < 3 AND "verificationId" IS NULL/u);
  assert.match(code, /ON DELETE SET NULL ON UPDATE RESTRICT/u);
});
test("crypto checks allow reviewed Argon2id parameter upgrades without accepting another algorithm", async () => {
  const pattern = code.match(/"password" COLLATE "C" ~ '([^']+)'/u)?.[1]; assert.ok(pattern);
  const hash = await hashPassword("Synthetic migration contract password");
  assert.equal(new RegExp(pattern).test(hash), true);
  assert.equal(new RegExp(pattern).test(hash.replace(/m=\d+,t=\d+,p=\d+/u,"m=131072,t=4,p=2")), true);
  for (const invalid of [hash.replace("argon2id","argon2i"), hash.replace(/m=\d+/u,"m=0"), "sha256"]) assert.equal(new RegExp(pattern).test(invalid), false);
  for (const text of ['octet_length("verifier") = 32', 'octet_length("nonce") = 12', 'octet_length("authTag") = 16', 'octet_length("payloadCiphertext") BETWEEN 1 AND 4096']) assert.ok(code.includes(text));
  assert.equal((code.match(/ CHECK \(/gu) ?? []).length, 15);
});
test("clock fixtures do not mutate persisted issuance identity and preserve lifecycle/failure cases", () => {
  const harness = read("./registration.integration.mjs");
  assert.match(harness, /clock: \(\) => new Date\(Date.now\(\) \+ 300_001\)/u);
  assert.match(harness, /clock: \(\) => new Date\(Date.now\(\) \+ 60_001\)/u);
  assert.doesNotMatch(harness, /data: \{(?:expiresAt|createdAt):/u);
  for (const item of ["REGISTRATION_STAGES", "VERIFICATION_STAGES", "Promise.allSettled", "failedAttempts, attempt", "oldState.supersededAt", "laterService.verify"]) assert.ok(harness.includes(item), item);
});
