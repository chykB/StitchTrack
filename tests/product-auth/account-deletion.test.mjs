// Actual Better Auth/Argon2id with serialized transaction doubles, NOT PostgreSQL proof.
import test from "node:test";
import assert from "node:assert/strict";
import "../../scripts/register-server-only.mjs";
import {fakeProduct,modelNames} from "./fake-product.mjs";
const externalFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("External requests forbidden in offline deletion tests");
test.after(()=>{globalThis.fetch=externalFetch;});
const {createSessionService}=await import("../../lib/product-auth/session.server.ts");
const {createAccountDeletionService}=await import("../../lib/product-auth/account-deletion.server.ts");
const {hashPassword}=await import("../../lib/auth/password.server.ts");
const config={mode:"test",origin:"http://127.0.0.1:3000",authSecret:"offline-deletion-signing-secret-not-for-deployment",sessionTokenKey:Buffer.alloc(32,7),expiresInSeconds:604800,renewal:"none"};
const password=" Exact synthetic e\u0301 deletion phrase ",hash=await hashPassword(password);
const cookie=result=>new Headers({cookie:result.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")});
const rejected=e=>e.code==="deletion_rejected"&&!e.cause,unavailable=e=>e.code==="deletion_unavailable"&&!e.cause&&!Object.hasOwn(e,"headers");
const barrier=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(secret=password){
 const f=fakeProduct({sessionAccess:true}),base=f.client,hooks={};
 for(const id of ["primary","unrelated"]){await base.user.create({data:{id,name:"Synthetic deletion test",email:id+"@example.invalid",emailVerified:true}});await base.account.create({data:{id:id+"-credential",userId:id,accountId:id,providerId:"credential",password:secret===password?hash:await hashPassword(secret)}});}
 const query=base.$queryRaw,insert=base.session.create,remove=base.session.deleteMany;
 base.$queryRaw=async(...args)=>{const result=await query(...args);if(args[0].join("").includes('UPDATE "product"."User"')&&hooks.afterStatus)await hooks.afterStatus();return result;};
 base.session.create=async args=>{if(hooks.beforeSession)await hooks.beforeSession();return insert(args);};
 base.session.deleteMany=async args=>{const result=await remove(args);if(hooks.afterDelete&&f.inTransaction())await hooks.afterDelete();return result;};
 const tx=new Proxy(base,{get(target,key){if(key==="$transaction")return undefined;const value=Reflect.get(target,key);
  if(modelNames.includes(key))return new Proxy(value,{get(model,method){const fn=Reflect.get(model,method);return typeof fn!=="function"?fn:(...args)=>{assert.equal(f.inTransaction(),true);return fn.apply(model,args);};}});
  return typeof value!=="function"?value:value.bind(target);
 }});
 let tail=Promise.resolve();
 const root=new Proxy(base,{get(target,key){if(key==="$transaction")return callback=>{const work=tail.then(async()=>{
  const value=await base.$transaction(async()=>{const result=await callback(tx);if(hooks.commitFailure==="before")throw new Error("synthetic pre-commit failure");return result;});
  if(hooks.commitFailure==="after")throw new Error("synthetic lost COMMIT acknowledgement");return value;
 });tail=work.catch(()=>{});return work;};const value=Reflect.get(target,key);return typeof value!=="function"?value:value.bind(target);}});
 const sessions=createSessionService(root,config),check=sessions.hasSessionForLockedUser;
 sessions.hasSessionForLockedUser=async(scope,...args)=>{assert.equal(scope,tx,"Current session must be rechecked through the real lifecycle transaction client");return check(scope,...args);};
 return {...f,root,tx,hooks,sessions,deletion:createAccountDeletionService(root,sessions),login:(id="primary")=>sessions.login({email:id+"@example.invalid",password:secret})};
}
test("password-confirmed request locks only the authenticated identity, revokes both sessions and clears the signed cookie",async()=>{
 const f=await fixture(),a=await f.login(),b=await f.login(),other=await f.login("unrelated");const untouched=structuredClone(f.rows().account);
 const actorCookie=cookie(a);actorCookie.set("x-user-id","unrelated");
 const result=await f.deletion.request(actorCookie,{password});assert.match(result.headers.get("set-cookie"),/Max-Age=0/);assert.match(result.headers.get("set-cookie"),/HttpOnly/);assert.match(result.headers.get("set-cookie"),/SameSite=Lax/);
 assert.ok(f.rows().user[0].deletionRequestedAt instanceof Date);assert.equal(f.rows().user[0].disabledAt,null);assert.equal(f.rows().user[1].deletionRequestedAt,null);
 assert.deepEqual(f.rows().account,untouched);assert.equal(f.rows().user.length,2);assert.equal(f.rows().session.length,1);assert.equal(f.rows().session[0].userId,"unrelated");
 assert.equal((await f.sessions.lookup(cookie(a))).session,null);assert.equal((await f.sessions.lookup(cookie(b))).session,null);assert.equal((await f.sessions.lookup(cookie(other))).session.user.id,"unrelated");
 await assert.rejects(f.login(),e=>e.code==="login_rejected");
 const timestamp=f.rows().user[0].deletionRequestedAt,updated=f.rows().user[0].updatedAt;
 await assert.rejects(f.deletion.request(cookie(a),{password}),rejected);assert.deepEqual(f.rows().user[0].deletionRequestedAt,timestamp);assert.deepEqual(f.rows().user[0].updatedAt,updated);
});
test("unauthenticated requests, browser identities, incorrect/exact-password variants and invalid accounts cannot authorize deletion",async()=>{
 const f=await fixture(),a=await f.login();
 for(const input of [{password,userId:"unrelated"},{password,authorized:true},{password,deletionRequestedAt:null},{password:""}])await assert.rejects(f.deletion.request(cookie(a),input),rejected);
 for(const secret of [password.trim(),password.normalize("NFC"),"Wrong synthetic phrase"]){await assert.rejects(f.deletion.request(cookie(a),{password:secret}),rejected);}
 await assert.rejects(f.deletion.request(new Headers(),{password}),rejected);assert.equal(f.rows().user[0].deletionRequestedAt,null);assert.equal(f.rows().session.length,1);
 for(const patch of [{disabledAt:new Date()},{deletionRequestedAt:new Date()},{emailVerified:false}]){const before=structuredClone(f.rows().user[0]);Object.assign(f.rows().user[0],patch);await assert.rejects(f.deletion.request(cookie(a),{password}),rejected);Object.assign(f.rows().user[0],before);}
 await f.root.account.deleteMany({where:{userId:"primary"}});await assert.rejects(f.deletion.request(cookie(a),{password}),rejected);assert.equal(f.rows().user[0].deletionRequestedAt,null);assert.equal(f.rows().account.length,1);
});
test("a session revoked between initial lookup and the User lock cannot authorize deletion",async()=>{
 const f=await fixture(),a=await f.login(),lookup=f.sessions.lookup;
 f.sessions.lookup=async headers=>{const value=await lookup(headers);await f.root.session.deleteMany({where:{userId:"primary"}});return value;};
 await assert.rejects(f.deletion.request(cookie(a),{password}),rejected);assert.equal(f.rows().user[0].deletionRequestedAt,null);
});
test("reauthentication uses the stored Argon2id password, without reapplying new-password strength rules",async()=>{
 const f=await fixture("legacy"),a=await f.login();await f.deletion.request(cookie(a),{password:"legacy"});assert.ok(f.rows().user[0].deletionRequestedAt);
});
test("status/revocation/pre-commit failures roll back together; uncertain commit/cookie clearing never reports success",async()=>{
 for(const stage of ["status","sessions","before","after","cookie"]){
  const f=await fixture(),a=await f.login(),before=structuredClone(f.rows());
  if(stage==="status")f.hooks.afterStatus=async()=>{throw new Error("synthetic private status failure");};
  else if(stage==="sessions")f.hooks.afterDelete=async()=>{throw new Error("synthetic private delete failure");};
  else if(stage==="cookie")f.sessions.logout=async()=>{throw new Error("synthetic private cookie-clear failure");};
  else f.hooks.commitFailure=stage;
  await assert.rejects(f.deletion.request(cookie(a),{password}),unavailable);
  if(["after","cookie"].includes(stage)){assert.ok(f.rows().user[0].deletionRequestedAt);assert.equal(f.rows().session.length,0);}else assert.deepEqual(f.rows(),before);
 }
});
test("DOUBLE: login-first then deletion revokes the new session",{timeout:5000},async()=>{
 const f=await fixture(),current=await f.login(),entered=barrier(),release=barrier();
 f.hooks.beforeSession=async()=>{entered.resolve();await release.promise;};const loggingIn=f.login();await entered.promise;
 const deleting=f.deletion.request(cookie(current),{password});await new Promise(setImmediate);release.resolve();await Promise.all([loggingIn,deleting]);assert.equal(f.rows().session.length,0);assert.ok(f.rows().user[0].deletionRequestedAt);
});
test("DOUBLE: deletion-first blocks a queued login; repeat cannot restamp or reactivate",{timeout:5000},async()=>{
 const f=await fixture(),current=await f.login(),entered=barrier(),release=barrier();
 f.hooks.afterStatus=async()=>{entered.resolve();await release.promise;};const deleting=f.deletion.request(cookie(current),{password});await entered.promise;
 const login=assert.rejects(f.login(),e=>e.code==="login_rejected");release.resolve();await Promise.all([deleting,login]);const time=f.rows().user[0].deletionRequestedAt;
 await assert.rejects(f.deletion.request(cookie(current),{password}),rejected);assert.deepEqual(f.rows().user[0].deletionRequestedAt,time);assert.equal(f.rows().session.length,0);
});
test("native errors, passwords and session material are not logged or returned",async t=>{
 const logs=[];for(const method of ["log","warn","error","info","debug"])t.mock.method(console,method,(...args)=>logs.push(args));
 const f=await fixture(),a=await f.login();f.hooks.afterDelete=async()=>{throw new Error(password+cookie(a).get("cookie"));};
 await assert.rejects(f.deletion.request(cookie(a),{password}),error=>unavailable(error)&&!JSON.stringify(error).includes(password));assert.deepEqual(logs,[]);
});

test("DOUBLE: two simultaneous requests permit one transition and preserve the original timestamp",async()=>{
 const f=await fixture(),current=await f.login();const results=await Promise.allSettled([f.deletion.request(cookie(current),{password}),f.deletion.request(cookie(current),{password})]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(f.events.filter(e=>e==="user.access.update").length,1);assert.equal(f.rows().session.length,0);
 assert.ok(f.rows().user[0].deletionRequestedAt instanceof Date);
});
