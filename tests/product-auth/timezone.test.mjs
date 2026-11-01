// Offline adapter/pg-boundary checks. All driver queries are replaced in memory;
// connect throws. PostgreSQL interpretation is modelled, not a live database proof.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../../prisma/product/targets.ts";

async function boundary(options,run) {
 const pool=new pg.Pool({host:"127.0.0.1",port:5432,user:"offline-only",password:"synthetic-only",database:"no-database-access",...options});
 pool.connect=async()=>assert.fail("Offline timezone tests must not connect");
 const utc=pool.options.options===PRODUCT_PRISMA_CONNECTION_OPTIONS,offset=utc?"+00":"+01";
 const parse=pg.types.getTypeParser(1184,"text"),bindings=[];
 pool.query=async query=>{
  // Interpret the actual adapter-bound value using the independent pg parser.
  // A real PostgreSQL UTC/non-UTC session makes this same offset choice when
  // the bound value has no zone. The returned Date alone can conceal corruption.
  const value=query.values[0];assert.equal(typeof value,"string");bindings.push(value);
  const hasOffset=/(?:Z|[+-]\d{2}(?::?\d{2})?)$/u.test(value);
  const epoch=parse(value+(hasOffset?"":offset)).getTime();
  const displayed=new Date(epoch+(utc?0:3600000)).toISOString().replace("T"," ").replace("Z",offset);
  const normalized=query.types.getTypeParser(1184,"text")(displayed);
  return {fields:[{name:"epoch_ms",dataTypeID:20},{name:"instant",dataTypeID:1184}],rows:[[String(epoch),normalized]],rowCount:1};
 };
 const adapter=await new PrismaPg(pool,{schema:"product"}).connect();
 try {
  const config=adapter.underlyingDriver().options;
  const connection=new pg.Client(config); // Constructor only: no connection.
  assert.equal(connection.connectionParameters.options,options.options??undefined);
  await connection.end();
  await run(async value=>adapter.queryRaw({sql:"SELECT extract(epoch FROM $1::timestamptz) * 1000, $1::timestamptz",args:[value],
   argTypes:[{scalarType:"datetime",dbType:"TIMESTAMPTZ",arity:"scalar"}]}),bindings);
 }finally{await adapter.dispose();await pool.end();}
}
test("UTC startup options reach pg and preserve independent epochs for Date and datetime-string bindings",async()=>{
 assert.equal(PRODUCT_PRISMA_CONNECTION_OPTIONS,"-c timezone=UTC");
 await boundary({options:PRODUCT_PRISMA_CONNECTION_OPTIONS},async query=>{
  for(const iso of ["2026-11-01T13:34:54.639Z","2026-01-01T00:00:00.001Z","2026-11-01T14:34:54.639+01:00"]){
   const date=new Date(iso),expected=BigInt(date.getTime());
   for(const value of [date,date.toISOString()]){
    const result=await query(value);
    assert.equal(BigInt(result.rows[0][0]),expected,"Independent epoch must match; a Prisma Date round-trip is insufficient");
    assert.equal(new Date(result.rows[0][1]).getTime(),Number(expected));
   }
  }
 });
});
test("non-UTC negative control exposes the installed adapter's misleading round-trip",async()=>{
 const input=new Date("2026-11-01T13:34:54.639Z");
 await boundary({},async query=>{
  const result=await query(input);
  assert.equal(BigInt(result.rows[0][0]),BigInt(input.getTime()-3600000));
  assert.equal(new Date(result.rows[0][1]).getTime(),input.getTime(),"Prisma's read can mask the one-hour storage shift");
 });
});
test("all product registration/session Prisma constructors carry the fixed option without changing target URL guards",()=>{
 const paths=["lib/product-auth/registration-next.server.ts","scripts/local-auth-gateway.mjs","tests/product-auth/registration.integration.mjs",
  "tests/product-auth/session.integration.mjs","tests/product-auth/account-access.integration.mjs","tests/product-auth/rate-limit.integration.mjs",
  "tests/product-auth/browser-fixture.mjs","tests/product-auth/https-transport.integration.mjs","task-04-server-security/experiments/verification-evidence/capture.mjs"];
 for(const path of paths){
  const source=readFileSync(new URL("../../"+path,import.meta.url),"utf8"),constructors=[...source.matchAll(/new PrismaPg\(\{([\s\S]*?)\},\s*\{/gu)];
  assert.equal(constructors.length,1,path);assert.match(constructors[0][1],/options:PRODUCT_PRISMA_CONNECTION_OPTIONS/u,path);
 }
});
