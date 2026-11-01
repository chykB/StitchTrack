import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkBefore, checkAfter, originalFailureId, resolutionArgs, statusArgs } from "../scripts/resolve-required-name.mjs";
import { TASK_FOUR_INITIAL_SQL_SHA256, TASK_FOUR_REQUIRED_NAME_SHA256, taskFourCommand } from "../prisma/config.ts";
const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8");
function fixture() {
  return { database: "stitchtrack_assessment", role: "stitchtrack_task04_test_app",
    columns: [{name:"name", required:true, default:false}], constraints:[{validated:true}], indexes:["existing"],
    users:[{id:"synthetic", name:"Synthetic User", createdAt:"unchanged"}], history:[
      {id:"bb1d3fb7-90cf-4fc5-b7e3-6fdb00b1f878", migration_name:"20261028_task04_initial", checksum:TASK_FOUR_INITIAL_SQL_SHA256,
        finished_at:"initial-finished", rolled_back_at:null, started_at:"initial-start", logs:null, applied_steps_count:1},
      {id:originalFailureId, migration_name:"20261028_task04_user_name", checksum:TASK_FOUR_REQUIRED_NAME_SHA256,
        finished_at:null, rolled_back_at:null, started_at:"failure-start", logs:'23502: column "name" contains null values', applied_steps_count:0}
    ] };
}
function resolved(before) {
  const after=structuredClone(before);
  after.history[1].rolled_back_at="resolution-time";
  after.history.push({...before.history[1],id:"new-applied-id",finished_at:"resolution-time",logs:null});
  return after;
}

test("isolated model adds required TEXT name without default or name index", () => {
  const schema=read("../prisma/schema.prisma");
  const user=schema.match(/model User \{([\s\S]*?)\n\}/u)[1];
  assert.match(user,/^  name +String +@db.Text$/mu);
  assert.doesNotMatch(user,/name[^\n]*@(?:default|unique)|@@index\(\[name/u);
});

test("before inspection rejects missing, replaced or already-resolved failure diagnostics", () => {
  const before=fixture(); assert.doesNotThrow(()=>checkBefore(before));
  for (const edit of [s=>s.history.pop(), s=>s.history.push({...s.history[1],id:"extra"}),
    s=>s.history[1].id="replaced", s=>s.history[1].logs=null, s=>s.history[1].logs="another failure",
    s=>s.history[1].checksum="changed", s=>s.history[1].rolled_back_at="already resolved",
    s=>s.database="wrong", s=>s.role="postgres", s=>s.history[0].finished_at=null]) {
    const changed=structuredClone(before);edit(changed); assert.throws(()=>checkBefore(changed));
  }
});

test("after inspection preserves original logs, IDs and users while accepting a new applied record", () => {
  const before=fixture(),after=resolved(before); assert.doesNotThrow(()=>checkAfter(before,after));
  for(const edit of [s=>s.history[1].logs="lost", s=>s.history[1].checksum="changed",
    s=>s.history[1].started_at="changed", s=>s.history[1].applied_steps_count=9,
    s=>s.history.shift(), s=>s.history[0].finished_at="changed", s=>s.history[2].finished_at=null,
    s=>s.history[2].checksum="changed", s=>s.history.push({...s.history[2],id:"extra"}),
    s=>s.users[0].name="changed", s=>s.columns[0].required=false, s=>s.constraints=[], s=>s.indexes=[]]) {
    const changed=structuredClone(after);edit(changed); assert.throws(()=>checkAfter(before,changed));
  }
});

test("comparison captures rather than assumes in-place resolution metadata", () => {
  const before=fixture(),after=structuredClone(before);
  after.history[1].finished_at="resolution-time";
  assert.doesNotThrow(()=>checkAfter(before,after));
  after.history[1].logs=null; assert.throws(()=>checkAfter(before,after));
});

test("owner inspector is read-only, bounded and independently checks the exact recovered schema", () => {
  const sql=read("../experiments/required-column/resolution/inspect.sql");
  const code=sql.replace(/--[^\n]*/gu,"");
  assert.match(code,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/u);
  assert.match(code,/lock_timeout = '5s'/u); assert.match(code,/statement_timeout = '30s'/u);
  assert.doesNotMatch(code,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/iu);
  assert.doesNotMatch(code,/"public"\.|task_two_enquiries/u);
  for(const part of ['stitchtrack_assessment','stitchtrack_task04_test_app','task04_test','User_name_nonblank_check',
    'c.convalidated','a.attnotnull','NOT a.atthasdef','pg_get_expr(c.conbin,c.conrelid)=format',
    'Synthetic User 01','Synthetic User 02',"'history'"]) assert.ok(sql.includes(part),part);
  const failed=read("../prisma/migrations/20261028_task04_user_name/migration.sql");
  assert.equal(sql.match(/U&'[^']+'/u)[0],failed.match(/U&'[^']+'/u)[0]);
});

test("wrapper has fixed resolution/status commands, clean connection env and no automatic retry", () => {
  assert.equal(taskFourCommand(resolutionArgs),"resolve-required-name"); assert.equal(taskFourCommand(statusArgs),"status");
  const source=read("../scripts/resolve-required-name.mjs");
  assert.match(source,/if \(process.argv\[1\] && import.meta.url === pathToFileURL/u);
  assert.ok(source.indexOf('checkBefore(before)')<source.indexOf('const resolved = prisma(resolutionArgs)'));
  assert.ok(source.indexOf('const after = inspect("after")')<source.lastIndexOf('checkAfter(before, after)'));
  assert.match(source,/PGPASSFILE: "\/dev\/null"/u);
  assert.doesNotMatch(source,/migrate.*(?:reset|deploy)|readFileSync\([^\n]*\.env/u);
});
