// Offline only. Injected catalogue/transaction double; not evidence of PostgreSQL enforcement.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";
import {authorizeOrderConstraints,orderConstraintFailureDetails,runOrderConstraintChecks} from "./order-constraints.integration.mjs";
const source=readFileSync(new URL('./order-constraints.integration.mjs',import.meta.url),'utf8');
const env={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_ORDER_CONSTRAINT_CHECK_CONFIRMED:"true",PRODUCT_ORDER_CONSTRAINT_FIXTURES_CONFIRMED:"true",PRODUCT_ORDER_CONSTRAINT_BUSINESS_A_ID:"synthetic-a",PRODUCT_ORDER_CONSTRAINT_BUSINESS_B_ID:"synthetic-b",PRODUCT_TEST_MIGRATION_DATABASE_URL:"postgresql://stitchtrack_product_test_migrator:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const args=['--owner-order-constraints'],config=()=>authorizeOrderConstraints(args,env);
const tables=['Account','AuthRateBucket','Business','BusinessMember','Client','EmailOutbox','EmailVerificationIssuance','MeasurementEntry','MeasurementVersion','Order','OrderItem','Session','TermsAcceptance','TermsVersion','User','Verification','_prisma_migrations'].sort();
const fault=(code='23503',constraint)=>Object.assign(Error('PRIVATE password URL SQL rows identifiers'),{code,constraint,stack:'PRIVATE'});
const whitespace="\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const cols={Order:[['id','uuid'],['businessId','text'],['clientId','uuid'],['createdAt','timestamp(3) with time zone'],['updatedAt','timestamp(3) with time zone']],OrderItem:[['id','uuid'],['orderId','uuid'],['clientId','uuid'],['description','text'],['measurementVersionId','uuid'],['createdAt','timestamp(3) with time zone'],['updatedAt','timestamp(3) with time zone']]};
function fake(options={}){
 let data=Object.fromEntries(tables.map(t=>[t,[]])),outer,aborted=false,workRolled=false,onError;const saves=new Map(),calls=[];
 data.Client=[{id:'baseline-client',businessId:'synthetic-a',fullName:'Existing synthetic fixture'}];
 data.MeasurementVersion=[{id:'baseline-version',businessId:'synthetic-a',clientId:'baseline-client',versionNumber:1}];
 data.MeasurementEntry=[{measurementVersionId:'baseline-version',name:'Existing',value:'1.25'}];
 for(const t of tables.filter(t=>!['Client','MeasurementVersion','MeasurementEntry','Order','OrderItem'].includes(t)))data[t]=[{unchanged:t}];
 const initial=structuredClone(data),rows=r=>({rows:r,rowCount:r.length}),snapshot=()=>structuredClone(data);
 const raise=(code,constraint)=>{aborted=true;throw fault(code,constraint);};
 const db={calls,initial,current:()=>data,on(_event,handler){onError=handler;},async connect(){calls.push('connect');if(options.connection)throw fault('08006');},async end(){calls.push('end');if(options.end)throw fault('08003');},
  async query(sql,p=[]){
   calls.push(sql);options.inject?.(sql,p);
   if(sql==='ROLLBACK'){if(options.rollback)throw fault('08006');if(outer)data=structuredClone(outer);aborted=false;return {command:options.rollbackAck?'OTHER':'ROLLBACK'};}
   if(sql.startsWith('ROLLBACK TO SAVEPOINT ')){if(options.savepointRollback)throw fault('08006');const saved=saves.get(sql.slice(22));assert.ok(saved);data=structuredClone(saved);aborted=false;if(sql.endsWith('order_work'))workRolled=true;return rows([]);}
   if(aborted)throw fault('25P02');
   if(sql==='BEGIN'){outer=snapshot();return {command:'BEGIN'};}
   if(sql.startsWith('SAVEPOINT ')){saves.set(sql.slice(10),snapshot());return rows([]);}
   if(sql.startsWith('RELEASE SAVEPOINT ')){saves.delete(sql.slice(18));return rows([]);}
   if(sql.startsWith('SET LOCAL')||sql.startsWith('LOCK TABLE'))return rows([]);
   if(sql.startsWith('SELECT current_database()'))return rows([{database:options.identity?'wrong':'stitchtrack_product_test',role:'stitchtrack_product_test_migrator',session_role:'stitchtrack_product_test_migrator',host:'127.0.0.1',peer:'127.0.0.1',port:'5432',timezone:'UTC',encoding:'UTF8',version:160015,safe:true}]);
   if(sql.startsWith('SELECT c.relname AS name,c.relkind'))return rows(tables.map(name=>({name,kind:options.view&&name==='Order'?'v':'r',owner:'stitchtrack_product_test_migrator'})));
   if(sql.startsWith('SELECT pg_get_userbyid(nspowner)'))return rows([{owner:'stitchtrack_product_test_migrator',isolated_history:!options.publicHistory}]);
   if(sql.startsWith('SELECT migration_name')){const h=Object.entries(PRODUCT_MIGRATIONS).map(([migration_name,checksum])=>({migration_name,checksum,finished_at:new Date(),rolled_back_at:null,logs:null,applied_steps_count:1}));if(options.historyCount)h.pop();if(options.historyPatch)Object.assign(h.at(-1),options.historyPatch);return rows(h);}
   if(sql.startsWith('SELECT c.relname AS table_name')){
    if(sql.includes("IN ('Order','OrderItem')")){const result=Object.entries(cols).flatMap(([table_name,columns])=>columns.map(([name,type])=>({table_name,name,type,required:name!=='measurementVersionId',default_value:name==='createdAt'?'CURRENT_TIMESTAMP':null,identity:'',generated:''})));if(options.extraColumn)result.push({...result[0],name:'unreviewed'});if(options.default)result[3].default_value='clock_timestamp()';return rows(result);}
    return rows([...[["measurementVersionId","uuid"],["name","text"],["value","numeric"]].map(([name,type])=>({table_name:'MeasurementEntry',name,type,required:true})),...[["id","uuid"],["businessId","text"],["clientId","uuid"],["versionNumber","integer"],["unit","text"],["recordedAt","timestamp(3) with time zone"]].map(([name,type])=>({table_name:'MeasurementVersion',name,type,required:true}))]);
   }
   if(sql.startsWith('SELECT\n  NOT EXISTS'))return rows([{no_triggers:!options.trigger,no_rules:true,plain_tables:true,no_inheritance:true,no_unexpected_dependents:!options.unexpectedDependency}]);
   if(sql.startsWith('SELECT conrelid::regclass')){
    const cs=[...['Order','OrderItem'].map(n=>({target:'product."'+n+'"',name:n+'_pkey',type:'p',valid:true,deferred:false,keys:['id']})),
     ...[['Order_businessId_clientId_fkey','Order','Client',['businessId','clientId'],['businessId','id']],['OrderItem_orderId_clientId_fkey','OrderItem','Order',['orderId','clientId'],['id','clientId']],['OrderItem_clientId_measurementVersionId_fkey','OrderItem','MeasurementVersion',['clientId','measurementVersionId'],['clientId','id']]].map(([name,t,parent,keys,parent_keys])=>({name,target:'product."'+t+'"',parent:'product."'+parent+'"',type:'f',valid:true,deferred:false,keys,parent_keys,deletion:options.cascade?'c':'r',update:'r',match:options.match?'f':'s',expression:null})),
     {target:'product."OrderItem"',name:'OrderItem_description_check',type:'c',valid:true,deferred:false,keys:['description'],expression:"((char_length(description) >= 1) AND (char_length(description) <= 500) AND (description = btrim(description, '"+whitespace+"'::text)))"}];
    if(options.expression)cs.at(-1).expression=cs.at(-1).expression.replace('500','501');if(options.extraConstraint)cs.push({...cs[0],name:'unreviewed'});return rows(cs);
   }
   if(sql.startsWith('SELECT c.relname AS name,i.indrelid')){
    const spec={Order_pkey:['Order',true,['id']],Order_id_clientId_key:['Order',true,['id','clientId']],Order_businessId_createdAt_id_idx:['Order',false,['businessId','createdAt','id']],Order_businessId_clientId_createdAt_id_idx:['Order',false,['businessId','clientId','createdAt','id']],OrderItem_pkey:['OrderItem',true,['id']],OrderItem_orderId_createdAt_id_idx:['OrderItem',false,['orderId','createdAt','id']],OrderItem_clientId_measurementVersionId_idx:['OrderItem',false,['clientId','measurementVersionId']],MeasurementVersion_clientId_id_key:['MeasurementVersion',true,['clientId','id']]};
    const result=Object.entries(spec).map(([name,[t,unique,keys]])=>({name,target:'product."'+t+'"',unique,valid:true,ready:true,plain:true,no_included:true,nulls_not_distinct:false,method:'btree',keys,options:keys.map(()=>0)}));if(options.index)result[0].valid=false;return rows(result);
   }
   if(sql.startsWith('SELECT a.attcollation'))return rows([{default_label_collation:true}]);
   if(sql.startsWith('SELECT count(*)::int AS count FROM pg_trigger'))return rows([{count:0}]);
   if(sql.startsWith('SELECT convalidated'))return rows([{valid:true,deferred:false,deletion:'r',update:'r',parent:true,child_keys:p[1].startsWith('MeasurementVersion')?[2,3]:[1],parent_keys:p[1].startsWith('MeasurementVersion')?[2,1]:[1]}]);
   if(sql.startsWith('SELECT c.relname AS name,i.indisunique'))return rows(Object.entries({Client_businessId_id_key:['businessId','id'],MeasurementVersion_pkey:['id'],MeasurementVersion_clientId_versionNumber_key:['clientId','versionNumber'],MeasurementEntry_pkey:['measurementVersionId','name'],MeasurementEntry_version_label_key:['measurementVersionId','name']}).map(([name,keys])=>({name,keys,unique:true,valid:true,ready:true,unconditional:true,label_collation:true,key_count:keys.length,total_count:keys.length,target:'product."'+(name.startsWith('Client_')?'Client':name.startsWith('MeasurementVersion_')?'MeasurementVersion':'MeasurementEntry')+'"',expression:null,definition:'CREATE UNIQUE INDEX "MeasurementEntry_version_label_key" ON product."MeasurementEntry" USING btree ("measurementVersionId", name COLLATE product.measurement_label_ci)'})));
   if(sql.startsWith('SELECT pg_get_userbyid(c.collowner)'))return rows([{owner:'stitchtrack_product_test_migrator',provider:'i',deterministic:false,no_rules:true,all_encodings:true,locale:'und-u-kk-ks-level2',recorded:'same',actual:options.icu?'different':'same'}]);
   if(sql.startsWith('SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_depend'))return rows([{linked:true}]);
   if(sql.startsWith('SELECT NOT (rolsuper'))return rows([{safe:true,restricted_schema:true}]);
   if(sql.startsWith('SELECT has_table_privilege'))return rows(sql.includes('AS broad')?[{readable:true,broad:!!options.broad,cleanup_access:!!options.cleanupPrivilege}]:[{readable:true,insertable:true,forbidden:!!options.historyMutation}]);
   if(sql.startsWith('SELECT attname AS name,has_column_privilege')){const t=p[1].includes('OrderItem')?'OrderItem':'Order';return rows(cols[t].map(([name])=>({name,readable:true,insertable:true,editable:options.identityUpdate&&name==='id'||t==='OrderItem'&&['description','measurementVersionId','updatedAt'].includes(name),referencable:false})));}
   if(sql.startsWith('SELECT b."primaryOwnerUserId"'))return rows(options.fixture?[]:[{owner:options.sameOwner?'same-owner':p[0]+'-owner'}]);
   if(sql.startsWith('SELECT count(*)::int AS count FROM product.')){const t=sql.match(/FROM product\."(\w+)"/u)[1];let r=data[t];if(sql.includes('=ANY($1::uuid[])')){const c=sql.match(/WHERE "(\w+)"/u)[1];r=r.filter(row=>p[0].includes(row[c]));}return rows([{count:options.unbounded&&!sql.includes('WHERE')?10001:r.length}]);}
   if(sql.startsWith('SELECT md5(')){const t=sql.match(/FROM product\."(\w+)" t/u)[1];return rows([{digest:options.changedSnapshot&&workRolled?'changed':JSON.stringify(data[t])}]);}
   if(sql.startsWith('INSERT INTO product."Client"')){const row={id:p[0],businessId:p[1]};data.Client.push(row);return rows([row]);}
   if(sql.startsWith('INSERT INTO product."MeasurementVersion"')){data.MeasurementVersion.push({id:p[0],businessId:p[1],clientId:p[2],versionNumber:1});return rows([{id:p[0]}]);}
   if(sql.startsWith('INSERT INTO product."MeasurementEntry"')){data.MeasurementEntry.push({measurementVersionId:p[0],name:'Chest',value:'40.25'});return {rowCount:1};}
   if(sql.startsWith('INSERT INTO product."Order"')){const [id,businessId,clientId]=p;if(id==='not-a-uuid')raise('22P02');if(!data.Client.some(c=>c.id===clientId&&c.businessId===businessId))raise('23503',options.wrongConstraint?'PRIVATE':'Order_businessId_clientId_fkey');const row={id,businessId,clientId};data.Order.push(row);return rows([row]);}
   if(sql.startsWith('INSERT INTO product."OrderItem"')){
    const [id,orderId,clientId,description,measurementVersionId]=p;
    if(description===null)raise('23502');
    if(!options.acceptDescription&&(!description||[...description].length>500||whitespace.includes([...description][0])||whitespace.includes([...description].at(-1))))raise('23514','OrderItem_description_check');
    if(!data.Order.some(o=>o.id===orderId&&o.clientId===clientId))raise('23503','OrderItem_orderId_clientId_fkey');
    if(measurementVersionId!==null&&!data.MeasurementVersion.some(v=>v.id===measurementVersionId&&v.clientId===clientId))raise('23503','OrderItem_clientId_measurementVersionId_fkey');
    const row={id,orderId,clientId,description,measurementVersionId};data.OrderItem.push(row);if(options.idleError)onError(fault('08006'));return rows([row]);
   }
   if(sql.startsWith('UPDATE product."OrderItem"'))raise('23503','OrderItem_clientId_measurementVersionId_fkey');
   if(sql.startsWith('DELETE FROM product."Order"')||sql.startsWith('UPDATE product."Order"'))raise('23503','OrderItem_orderId_clientId_fkey');
   if(sql.startsWith('DELETE FROM product."MeasurementVersion"'))raise('23503','MeasurementEntry_measurementVersionId_fkey');
   if(sql.startsWith('DELETE FROM product."Client"'))raise('23503','Order_businessId_clientId_fkey');
   throw Error('Unexpected offline SQL shape');
  }};
 return db;
}
test('authorization requires exact approvals, distinct disposable Businesses and migrator-only loopback product-test configuration',()=>{
 assert.equal(config().target.user,'stitchtrack_product_test_migrator');
 for(const a of [[],[...args,'--execute'],['--owner-measurement-constraints']])assert.throws(()=>authorizeOrderConstraints(a,env),e=>e.details.stage==='authorization');
 for(const patch of [{NODE_ENV:'development'},{PRODUCT_DATABASE_MODE:'development'},{PRODUCT_ORDER_CONSTRAINT_CHECK_CONFIRMED:undefined},{PRODUCT_ORDER_CONSTRAINT_FIXTURES_CONFIRMED:undefined},{DEBUG:'pg'},{PGOPTIONS:'unsafe'}])assert.throws(()=>authorizeOrderConstraints(args,{...env,...patch}),e=>e.details.stage==='authorization');
 for(const patch of [{PRODUCT_ORDER_CONSTRAINT_BUSINESS_A_ID:''},{PRODUCT_ORDER_CONSTRAINT_BUSINESS_B_ID:env.PRODUCT_ORDER_CONSTRAINT_BUSINESS_A_ID}])assert.throws(()=>authorizeOrderConstraints(args,{...env,...patch}),e=>e.details.stage==='fixture_authorization');
 for(const url of [env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('127.0.0.1','localhost'),env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('_migrator:','_app:'),env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('/stitchtrack_product_test?','/stitchtrack_product_dev?'),env.PRODUCT_TEST_MIGRATION_DATABASE_URL.replace('schema=product','schema=public')])assert.throws(()=>authorizeOrderConstraints(args,{...env,PRODUCT_TEST_MIGRATION_DATABASE_URL:url}),e=>e.details.stage==='database_configuration');
});
test('injected happy path inserts complete synthetic fixtures, covers same-Business isolation and rolls every row back',async()=>{
 const db=fake(),r=await runOrderConstraintChecks(config(),db);assert.equal(r.status,'passed_rolled_back',JSON.stringify(r));assert.ok(r.checks>=25);assert.deepEqual(r.syntheticRowsTested,{clients:3,measurementVersions:3,measurementEntries:3,orders:2,items:5});assert.equal(r.retainedSyntheticRows,0);assert.deepEqual(db.current(),db.initial);assert.equal(db.calls.at(-1),'end');assert.ok(db.calls.includes('ROLLBACK'));
 assert.equal(db.calls.filter(sql=>sql.startsWith('SELECT md5(')).length,34);assert.equal(db.calls.filter(sql=>sql==='SAVEPOINT expected_failure').length,21);
 assert.equal(r.permissionProof,'effective_catalogue_privileges');assert.ok(r.limitations.includes('no_runtime_role_connection'));
});
test('unexpected schema, expression, index, FK, trigger and ICU differences refuse before any synthetic writes',async()=>{
 for(const [options,stage]of [[{view:true},'schema_tables'],[{publicHistory:true},'schema_tables'],[{extraColumn:true},'schema_metadata'],[{default:true},'schema_metadata'],[{cascade:true},'schema_metadata'],[{match:true},'schema_metadata'],[{expression:true},'schema_metadata'],[{extraConstraint:true},'schema_metadata'],[{index:true},'schema_metadata'],[{trigger:true},'schema_metadata'],[{unexpectedDependency:true},'schema_metadata'],[{icu:true},'measurement_metadata']]){
  const db=fake(options),r=await runOrderConstraintChecks(config(),db);assert.deepEqual(r,{status:'failed',failures:[{stage}],noAutomaticRetry:true});assert.equal(db.calls.some(sql=>sql.startsWith('INSERT')),false);assert.deepEqual(db.current(),db.initial);
 }
});
test('exact completed migration inventory is required, including checksums and completion flags',async()=>{
 for(const opts of [{historyCount:true},...[{checksum:'wrong'},{finished_at:null},{rolled_back_at:new Date()},{logs:'PRIVATE'},{applied_steps_count:0}].map(historyPatch=>({historyPatch}))]){
  const db=fake(opts);assert.deepEqual(await runOrderConstraintChecks(config(),db),{status:'failed',failures:[{stage:'migration_history'}],noAutomaticRetry:true});assert.equal(db.calls.some(sql=>sql.startsWith('INSERT')),false);
 }
});
test('broad app writes, identity edits, cleanup access or historical mutation privileges cannot pass',async()=>{
 for(const options of [{broad:true},{identityUpdate:true},{cleanupPrivilege:true},{historyMutation:true}]){const db=fake(options);assert.deepEqual(await runOrderConstraintChecks(config(),db),{status:'failed',failures:[{stage:'application_privileges'}],noAutomaticRetry:true});assert.equal(db.calls.some(sql=>sql.startsWith('INSERT')),false);}
});
test('unapproved fixture identity and unbounded baseline data refuse without creating records',async()=>{
 for(const [opts,stage]of [[{fixture:true},'fixture_businesses'],[{sameOwner:true},'fixture_businesses'],[{unbounded:true},'snapshot_before']]){const db=fake(opts);assert.deepEqual(await runOrderConstraintChecks(config(),db),{status:'failed',failures:[{stage}],noAutomaticRetry:true});assert.equal(db.calls.some(sql=>sql.startsWith('INSERT')),false);}
});
test('expected SQL failures use savepoints; a wrongly accepted constraint or wrong SQLSTATE/constraint never passes',async()=>{
 for(const [opts,stage,state]of [[{acceptDescription:true},'description_empty'],[{wrongConstraint:true},'order_cross_business','23503']]){const db=fake(opts),r=await runOrderConstraintChecks(config(),db);assert.equal(r.status,'failed');assert.deepEqual(r.failures,[{stage,...(state?{sqlstate:state}:{})}]);assert.deepEqual(db.current(),db.initial);}
});
test('partial insertion failures and changed baseline snapshots roll back without retaining synthetic data',async()=>{
 for(const [opts,stage,state]of [[{inject:sql=>{if(sql.startsWith('INSERT INTO product."MeasurementEntry"'))throw fault('08006');}},'synthetic_measurements','08006'],[{changedSnapshot:true},'snapshot_after']]){const db=fake(opts),r=await runOrderConstraintChecks(config(),db);assert.equal(r.status,'failed');assert.deepEqual(r.failures,[{stage,...(state?{sqlstate:state}:{})}]);assert.deepEqual(db.current(),db.initial);}
});
test('connection, lock and savepoint rollback failures remain sanitized and never automatically retry',async()=>{
 for(const [opts,stage,state]of [[{connection:true},'connection','08006'],[{inject:sql=>{if(sql.startsWith('LOCK TABLE'))throw fault('55P03');}},'table_locks','55P03'],[{savepointRollback:true},'rollback_expected_failure','08006']]){const db=fake(opts),r=await runOrderConstraintChecks(config(),db);assert.equal(r.status,'failed');assert.deepEqual(r.failures,[{stage,sqlstate:state}]);assert.equal(db.calls.filter(v=>v==='connect').length,1);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|synthetic-a|postgresql:/u);}
});
test('no success is reported when final rollback acknowledgement, rollback, connection cleanup or idle connection fails',async()=>{
 for(const [opts,stage]of [[{rollbackAck:true},'rollback'],[{rollback:true},'rollback'],[{end:true},'connection_cleanup'],[{idleError:true},'connection']]){const db=fake(opts),r=await runOrderConstraintChecks(config(),db);assert.equal(r.status,'failed');assert.ok(r.failures.some(f=>f.stage===stage));assert.equal(r.retainedSyntheticRows,undefined);}
});
test('diagnostics accept only fixed stages and allowlisted SQLSTATEs',()=>{
 assert.deepEqual(orderConstraintFailureDetails('PRIVATE',fault('PRIVATE')),{stage:'internal'});assert.deepEqual(orderConstraintFailureDetails('schema_metadata',fault('42501')),{stage:'schema_metadata',sqlstate:'42501'});
});
test('source has no COMMIT/schema/grant path and scopes all destructive FK probes to generated synthetic IDs',()=>{
 assert.doesNotMatch(source,/query\(["'`](?:COMMIT|CREATE|ALTER|GRANT|TRUNCATE)\b/u);
 assert.deepEqual([...source.matchAll(/INSERT INTO product\."(\w+)"/gu)].map(m=>m[1]),['Client','MeasurementVersion','MeasurementEntry','Order','OrderItem']);
 for(const table of ['Order','MeasurementVersion','Client'])assert.ok(source.includes('DELETE FROM product."'+table+'" WHERE "id"=$1::uuid'));
 assert.ok(source.includes('ROLLBACK TO SAVEPOINT order_work'));assert.ok(source.includes('assert.deepEqual(await snapshot(db),before)'));
 assert.ok(source.includes('schemaMetadata as measurementMetadata'));assert.ok(source.includes('has_column_privilege'));assert.ok(source.includes('CASE WHEN EXISTS'));
 assert.match(source,/if\(process.argv\[1\]&&import.meta.url===pathToFileURL/u);assert.match(source,/if\(!db\)\{const \{Client\}=await import\("pg"\)/u);
});
