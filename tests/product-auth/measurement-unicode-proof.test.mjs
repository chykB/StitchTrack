// Offline state-machine/guard tests. Injected SQL double and receipts only; no PostgreSQL or deployment.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,mkdtempSync,chmodSync,statSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {authorizeUnicodeProof,runUnicodeProof,privateReceipt,unicodeProofFailure} from "./measurement-unicode.integration.mjs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
const source=readFileSync(new URL("./measurement-unicode.integration.mjs",import.meta.url),"utf8");
const ninth="20261108_measurement_label_unicode";
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",
 PRODUCT_MEASUREMENT_UNICODE_PROOF_CONFIRMED:"true",PRODUCT_MEASUREMENT_UNICODE_WRITES_CONFIRMED:"true",PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED:"true",
 PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:"synthetic-a",PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_B_ID:"synthetic-b",
 PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID:"11111111-1111-4111-8111-111111111111",PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_B_ID:"22222222-2222-4222-8222-222222222222",
 PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product",
 PRODUCT_MEASUREMENT_UNICODE_RECEIPT_PATH:"/private-test-only/receipt.json",PRODUCT_UNICODE_COLLISION_DISPOSABLE_INSTANCE_CONFIRMED:"true",
 PRODUCT_UNICODE_COLLISION_VERSION_ID:"33333333-3333-4333-8333-333333333333"};
const arg={success_before:"--owner-unicode-success-before",post:"--owner-measurement-unicode-proof",collision_before:"--owner-unicode-collision-before",collision_after:"--owner-unicode-collision-after"};
const config=(mode,patch={})=>authorizeUnicodeProof([arg[mode]],{...env,...patch});
const failure=(code="42501")=>Object.assign(new Error("PRIVATE password URL SQL label fixture"),{code,stack:"PRIVATE"});
function receipts(){return {value:undefined,writes:0,read(){assert.ok(this.value);return structuredClone(this.value);},write(_p,value){assert.equal(this.value,undefined);this.value=structuredClone(value);this.writes++;}};}
const tables=["Account","AuthRateBucket","Business","BusinessMember","Client","EmailOutbox","EmailVerificationIssuance","MeasurementEntry","MeasurementVersion","Session","TermsAcceptance","TermsVersion","User","Verification","_prisma_migrations"].sort();
function fake(mode,options={}){
 const c=config(mode),post=mode==="post",collision=mode.startsWith("collision_"),calls=[],versions=new Map(),entries=[];let work;
 const initialVersion={id:env.PRODUCT_UNICODE_COLLISION_VERSION_ID,...c.fixtures[0],versionNumber:1,unit:"cm"};versions.set(initialVersion.id,initialVersion);
 for(const name of collision?["\u00c9paule","\u00e9PAULE"]:["Unrelated"])
  entries.push({id:initialVersion.id,name,value:"1.00"});
 const initial={versions:structuredClone(versions),entries:structuredClone(entries)};
 const collator=new Intl.Collator("und",{sensitivity:"accent"});
 const equal=(a,b)=>options.edgeFlip&&["I","\u0130","\u03c3","Stra\u00dfe"].includes(a)?! (collator.compare(a,b)===0):collator.compare(a,b)===0;
 const rows=r=>({rows:r,rowCount:r.length});
 const old=Object.entries(PRODUCT_MIGRATIONS).filter(([name])=>name!==ninth).map(([migration_name,checksum])=>({migration_name,checksum,finished_at:"fixed-completed",rolled_back_at:null,logs:null,applied_steps_count:1}));
 const history=[...old];
 if(post||mode==="collision_after")history.push({migration_name:ninth,checksum:PRODUCT_MIGRATIONS[ninth],finished_at:post?"fixed-completed":null,rolled_back_at:null,
  logs:post?null:"Measurement label collisions require separate owner review; no labels changed",applied_steps_count:post?1:0});
 const baseCount=table=>({User:2,Account:2,Client:2,Business:2,BusinessMember:2,MeasurementVersion:versions.size,MeasurementEntry:entries.length,_prisma_migrations:history.length}[table]??0);
 const snapshotData=table=>table==="MeasurementVersion"?[...versions]:table==="MeasurementEntry"?entries:table==="_prisma_migrations"?history:options.changedData&&post?"changed":"same";
 return {calls,initial,versions,entries,
  async connect(){calls.push("connect");if(options.connect)throw options.connect;},async end(){calls.push("end");if(options.cleanup)throw options.cleanup;},
  async query(sql,values=[]){
   calls.push(sql);options.inject?.(sql,values);
   if(sql.startsWith("BEGIN"))return rows([]);
   if(sql==="ROLLBACK"){if(options.rollback)throw options.rollback;versions.clear();for(const [k,v]of initial.versions)versions.set(k,v);entries.splice(0,entries.length,...initial.entries);return rows([]);}
   if(sql==="SAVEPOINT unicode_work"){work={versions:structuredClone(versions),entries:structuredClone(entries)};return rows([]);}
   if(sql==="ROLLBACK TO SAVEPOINT unicode_work"){versions.clear();for(const [k,v]of work.versions)versions.set(k,v);entries.splice(0,entries.length,...work.entries);return rows([]);}
   if(sql.startsWith("SET LOCAL")||sql.startsWith("LOCK TABLE")||sql.startsWith("SAVEPOINT")||sql.startsWith("RELEASE SAVEPOINT")||sql.startsWith("ROLLBACK TO SAVEPOINT"))return rows([]);
   if(sql.startsWith("SELECT current_database()"))return rows([{database:options.wrongDatabase?"wrong":"stitchtrack_product_test",role:c.target.user,session_role:c.target.user,host:"127.0.0.1",peer:"127.0.0.1",port:"5432",timezone:"UTC",encoding:"UTF8",version:options.wrongVersion?170000:160015,started:options.restart?"different-server":"fixed-server",database_oid:"12345",safe:true}]);
   if(sql.startsWith("SELECT c.relname AS name,c.relkind"))return rows((options.missingTable?tables.slice(1):tables).map(name=>({name,kind:"r",owner:c.target.user})));
   if(sql.startsWith("SELECT pg_get_userbyid(nspowner)"))return rows([{owner:c.target.user,isolated:true}]);
   if(sql.startsWith("SELECT migration_name,checksum"))return rows(history.map(h=>({...h,checksum:options.badHistory?"wrong":h.checksum,record:JSON.stringify(h)})));
   if(sql.startsWith("SELECT c.relname AS table_name"))return rows([
    ...[["measurementVersionId","uuid"],["name","text"],["value",options.typmod?"numeric(6,2)":"numeric"]].map(([name,type])=>({table_name:"MeasurementEntry",name,type,required:true})),
    ...[["id","uuid"],["businessId","text"],["clientId","uuid"],["versionNumber","integer"],["unit","text"],["recordedAt","timestamp(3) with time zone"]].map(([name,type])=>({table_name:"MeasurementVersion",name,type,required:true}))]);
   if(sql.startsWith("SELECT a.attcollation"))return rows([{default_label_collation:true}]);
   if(sql.includes("FROM pg_trigger"))return rows([{count:0}]);
   if(sql.startsWith("SELECT conname AS name"))return rows(Object.entries({MeasurementEntry_measurementVersionId_fkey:"f",MeasurementEntry_name_check:"c",MeasurementEntry_pkey:"p",MeasurementEntry_value_check:"c",MeasurementVersion_businessId_clientId_fkey:"f",MeasurementVersion_pkey:"p",MeasurementVersion_unit_check:"c",MeasurementVersion_versionNumber_check:"c"}).map(([name,type])=>({name,type,valid:true,deferred:false,definition:options.changedConstraint&&post?"changed":name})));
   if(sql.startsWith("SELECT convalidated"))return rows([{valid:true,deferred:false,deletion:"r",update:"r",parent:true,child_keys:values[1].startsWith("MeasurementVersion")?[2,3]:[1],parent_keys:values[1].startsWith("MeasurementVersion")?[2,1]:[1]}]);
   if(sql.startsWith("SELECT c.relname AS name,i.indisunique"))return rows(Object.entries({Client_businessId_id_key:["businessId","id"],MeasurementVersion_pkey:["id"],MeasurementVersion_clientId_versionNumber_key:["clientId","versionNumber"],MeasurementEntry_pkey:["measurementVersionId","name"],MeasurementEntry_version_label_key:["measurementVersionId",post?"name":null]}).map(([name,keys])=>({name,keys,unique:true,valid:true,ready:true,unconditional:true,label_collation:!options.indexCollation,expression:name==="MeasurementEntry_version_label_key"&&!post?"lower(name)":null,
    oid:name==="MeasurementEntry_version_label_key"&&options.indexChanged?"different":name,primary:name==="MeasurementVersion_pkey"||name==="MeasurementEntry_pkey",key_count:keys.length,total_count:keys.length,target:'product."'+(name.startsWith("Client_")?"Client":name.startsWith("MeasurementVersion_")?"MeasurementVersion":"MeasurementEntry")+'"',definition:name==="MeasurementEntry_version_label_key"&&post?'CREATE UNIQUE INDEX "MeasurementEntry_version_label_key" ON product."MeasurementEntry" USING btree ("measurementVersionId", name COLLATE product.measurement_label_ci)':name})));
   if(sql.startsWith("SELECT pg_get_userbyid(c.collowner)"))return rows(post?[{owner:c.target.user,provider:"i",deterministic:false,no_rules:true,all_encodings:true,locale:options.badLocale?"und-u-ks-level2":"und-u-kk-ks-level2",recorded:"test-version",actual:options.stale?"other":"test-version"}]:options.remainingCollation?[{}]:[]);
   if(sql.startsWith("SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_depend"))return rows([{linked:!options.noDependency}]);
   if(sql.startsWith("SELECT NOT (rolsuper"))return rows([{safe:true,restricted_schema:true}]);
   if(sql.startsWith("SELECT has_table_privilege"))return rows([{readable:true,insertable:true,forbidden:!!options.grantExpansion}]);
   if(sql.startsWith('SELECT c."id" AS client_id'))return rows([{client_id:values[0],business_id:values[1]}]);
   if(sql.startsWith("SELECT count(*)::int AS count FROM product.")){const table=sql.match(/FROM product\."(\w+)"/u)[1];return rows([{count:baseCount(table)+(options.extraUser&&table==="User"?1:0)}]);}
   if(sql.startsWith("SELECT md5(")){const table=sql.match(/FROM product\."(\w+)" t/u)[1];return rows([{digest:createHash("md5").update(JSON.stringify(snapshotData(table))).digest("hex")}]);}
   if(sql.startsWith('SELECT "id","businessId","clientId"'))return rows([{id:initialVersion.id,...c.fixtures[0]}]);
   if(sql.startsWith("SELECT encode(convert_to"))return rows(entries.map(e=>({bytes:Buffer.from(e.name).toString("hex"),value:e.value})));
   if(sql.startsWith('SELECT COALESCE(max("versionNumber")'))return rows([{maximum:1}]);
   if(sql.startsWith('INSERT INTO product."MeasurementVersion"')){assert.equal(post,true);const [id,businessId,clientId,versionNumber]=values;versions.set(id,{id,businessId,clientId,versionNumber,unit:"cm"});return rows([]);}
   if(sql.startsWith('INSERT INTO product."MeasurementEntry"')){
    assert.equal(post,true);const [id,name,value]=values;
    if(Number(value)<=0||Number(value)>1000||(value.split(".")[1]||"").length>2)throw Object.assign(failure("23514"),{constraint:"MeasurementEntry_value_check"});
    if(!options.acceptCollision&&entries.some(e=>e.id===id&&equal(e.name,name)))throw Object.assign(failure("23505"),{constraint:"MeasurementEntry_version_label_key"});
    entries.push({id,name,value});return rows([]);
   }
   if(sql.startsWith("SELECT $1::text COLLATE"))return rows([{equal:equal(values[0],values[1])}]);
   if(sql.startsWith('SELECT "measurementVersionId" AS id'))return rows(entries.filter(e=>values[0].includes(e.id)).map(e=>({id:e.id,bytes:Buffer.from(e.name).toString("hex"),value:e.value})));
   throw Error("Unexpected offline query");
  },
 };
}
test("all modes require exact target, approvals and private receipt location; writes have a separate opt-in",()=>{
 for(const mode of Object.keys(arg))assert.equal(config(mode).mode,mode);
 for(const args of [[],[arg.post,"--deploy"],["--owner-measurement-constraints"],["toString"]])assert.throws(()=>authorizeUnicodeProof(args,env));
 for(const patch of [{NODE_ENV:"production"},{PRODUCT_DATABASE_MODE:"development"},{PRODUCT_MEASUREMENT_UNICODE_PROOF_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED:undefined},{PRODUCT_MEASUREMENT_UNICODE_WRITES_CONFIRMED:undefined},{DEBUG:"*"},{NODE_DEBUG:"pg"},{PGOPTIONS:"unsafe"}])assert.throws(()=>config("post",patch));
 assert.throws(()=>config("collision_before",{PRODUCT_UNICODE_COLLISION_DISPOSABLE_INSTANCE_CONFIRMED:undefined}));
 assert.throws(()=>config("post",{PRODUCT_MEASUREMENT_UNICODE_RECEIPT_PATH:"relative.json"}));
 assert.throws(()=>config("post",{PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_B_ID:env.PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID}));
 for(const [a,b]of [["_migrator:","_app:"],["127.0.0.1","localhost"],["/stitchtrack_product_test?","/stitchtrack_product_dev?"],["schema=product","schema=public"]])assert.throws(()=>config("post",{PRODUCT_TEST_MIGRATION_DATABASE_URL:env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace(a,b)}));
});
async function successBaseline(r=receipts()){
 const db=fake("success_before"),out=await runUnicodeProof(config("success_before"),db,r);assert.equal(out.status,"success_baseline_recorded",JSON.stringify(out));
 assert.equal(db.calls[db.calls.length-1],"end");assert.equal(r.writes,1);assert.equal(db.calls.some(s=>s.startsWith("INSERT")),false);return r;
}
test("success baseline plus post-nine proof verifies bytes, observed edges, unrelated data and final rollback",async()=>{
 for(const edgeFlip of [false,true]){
  const r=await successBaseline(),db=fake("post",{edgeFlip}),out=await runUnicodeProof(config("post"),db,r);
  assert.equal(out.status,"passed_rolled_back",JSON.stringify(out));assert.equal(out.syntheticVersions,13);assert.equal(out.unicode.length,11);assert.equal(out.retainedSyntheticRows,0);
  for(const id of ["ordinary_case","accented_case","yoruba_case","canonical_forms","multiple_accents"])assert.equal(out.unicode.find(v=>v.case===id).equal,true);
  for(const id of ["accent_distinction","yoruba_accent_distinction"])assert.equal(out.unicode.find(v=>v.case===id).equal,false);
  assert.deepEqual(db.versions,db.initial.versions);assert.deepEqual(db.entries,db.initial.entries);assert.equal(db.calls.at(-1),"end");assert.ok(db.calls.includes("ROLLBACK"));
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE|synthetic-a|11111111|postgresql:|Epaule/u);
 }
});
test("collision inspectors are read-only; failed ninth history, unchanged bytes/index and absent collation are required",async()=>{
 const r=receipts(),before=fake("collision_before");assert.equal((await runUnicodeProof(config("collision_before"),before,r)).status,"collision_baseline_recorded");
 const after=fake("collision_after"),out=await runUnicodeProof(config("collision_after"),after,r);assert.equal(out.status,"collision_refusal_verified",JSON.stringify(out));
 for(const db of [before,after]){assert.ok(db.calls.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"));assert.equal(db.calls.some(s=>/^INSERT|^UPDATE|^DELETE|^CREATE|^DROP|^ALTER/u.test(s)),false);assert.ok(db.calls.includes("ROLLBACK"));}
 for(const [options,stage]of [[{extraUser:true},"collision_scope"],[{indexChanged:true},"collision_compare"],[{remainingCollation:true},"metadata"]]){
  const db=fake("collision_after",options),result=await runUnicodeProof(config("collision_after"),db,r);assert.equal(result.status,"failed");assert.equal(result.failures[0].stage,stage);
 }
});
test("wrong live identity/history/index/ICU/grants and changed baseline refuse before synthetic writes",async()=>{
 const r=await successBaseline();
 for(const [options,stage]of [[{wrongDatabase:true},"identity"],[{wrongVersion:true},"identity"],[{missingTable:true},"tables"],[{badHistory:true},"history"],
  [{typmod:true},"metadata"],[{badLocale:true},"metadata"],[{stale:true},"metadata"],[{noDependency:true},"metadata"],[{indexCollation:true},"metadata"],
  [{grantExpansion:true},"privileges"],[{changedConstraint:true},"baseline_compare"],[{restart:true},"baseline_compare"],[{changedData:true},"baseline_compare"]]){
  const db=fake("post",options),out=await runUnicodeProof(config("post"),db,r);assert.equal(out.status,"failed");assert.equal(out.failures[0].stage,stage,JSON.stringify(out));
  assert.equal(db.calls.some(s=>s.startsWith("INSERT")),false);assert.ok(db.calls.includes("ROLLBACK"));
 }
});
test("absent/tampered/mismatched receipt prevents connecting; no automatic recovery or overwrite",async()=>{
 for(const change of [r=>{r.value=undefined;},r=>{r.value.migration="wrong";},r=>{r.value.purpose="collision";},r=>{r.value.snapshot[0].count=-1;}]){
  const r=await successBaseline();change(r);const db=fake("post"),out=await runUnicodeProof(config("post"),db,r);assert.equal(out.status,"failed");assert.equal(out.failures[0].stage,"receipt_read");assert.deepEqual(db.calls,["end"]);
 }
});
test("unexpectedly accepted collision, lock, rollback and receipt-write errors cannot become success or leak details",async()=>{
 const r=await successBaseline();
 for(const [options,stage]of [[{acceptCollision:true},"ordinary_case"],[{inject:sql=>{if(sql.startsWith("LOCK TABLE"))throw failure("55P03");}},"locks"],
  [{rollback:failure("08006")},"rollback"],[{cleanup:failure("08003")},"cleanup"]]){
  const db=fake("post",options),out=await runUnicodeProof(config("post"),db,r);assert.equal(out.status,"failed");assert.equal(out.failures[0].stage,stage);assert.doesNotMatch(JSON.stringify(out),/PRIVATE|password|fixture/u);
 }
 const db=fake("success_before"),out=await runUnicodeProof(config("success_before"),db,{write(){assert.equal(db.calls.at(-1),"end");throw failure();}});
 assert.deepEqual(out,{status:"failed",failures:[{stage:"receipt_write",sqlstate:"42501"}],noAutomaticRetry:true});
 assert.deepEqual(unicodeProofFailure("PRIVATE",{code:"PRIVATE",message:"PRIVATE"}),{stage:"internal"});
});
test("real private receipt IO requires private external directory, exclusive owner-only file and no symlinks",()=>{
 const dir=mkdtempSync(join(tmpdir(),"stitchtrack-unicode-receipt-"));chmodSync(dir,0o700);const path=join(dir,"baseline.json");
 privateReceipt.write(path,{synthetic:true});assert.equal(statSync(path).mode&0o777,0o600);assert.deepEqual(privateReceipt.read(path),{synthetic:true});assert.throws(()=>privateReceipt.write(path,{}));
 const link=join(dir,"link.json");symlinkSync(path,link);assert.throws(()=>privateReceipt.read(link));
 chmodSync(path,0o644);assert.throws(()=>privateReceipt.read(path));
 assert.throws(()=>privateReceipt.write(new URL("./forbidden-receipt.json",import.meta.url).pathname,{}));
});
test("source contains no deployment, history mutation or cleanup; all three inspection modes are read-only",()=>{
 assert.doesNotMatch(source,/child_process|spawn\(|exec\(|migrate resolve|query\(["'`]COMMIT|INSERT INTO product\._prisma_migrations|UPDATE product\.|DELETE FROM|DROP INDEX|CREATE COLLATION/u);
 assert.deepEqual([...source.matchAll(/INSERT INTO product\."(\w+)"/gu)].map(v=>v[1]),["MeasurementVersion","MeasurementEntry"]);
 for(const value of ["und-u-kk-true-ks-level2","und-u-kk-ks-level2","server_version_num","pg_collation_actual_version","pg_catalog.pg_depend","unicode_work","ROLLBACK","noAutomaticRetry","recorded"])
  assert.ok(source.includes(value),value);
});
