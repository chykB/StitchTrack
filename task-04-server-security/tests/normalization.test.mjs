import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {emailComparison,emailExamples,passwordComparison,compareSyntheticPassword,unicodeAndCaseComparison} from "../experiments/normalization/comparison.ts";
import {authorizedMode,report} from "../experiments/normalization/demo.mjs";
import {signupSchema,loginSchema,resetSchema,emailSchema,signupPasswordSchema,PASSWORD_MIN} from "../../lib/auth/schemas.ts";
const fixture={name:"Synthetic Tailor",email:"synthetic@example.invalid",password:"Synthetic comparison phrase"};

test("email report executes all three product schemas for case and whitespace variants",()=>{
  const result=emailComparison();assert.equal(result.rows.length,5);assert.equal(result.equivalentInputs,true);
  for(const row of result.rows) {
    assert.equal(row.canonical,"tailor.demo+orders@example.invalid");
    assert.equal(row.flowsAgree,true);assert.equal(row.rawUnchanged,true);assert.equal(row.idempotent,true);
  }
  assert.ok(emailExamples.some(email=>email.startsWith("\t")));
  assert.ok(emailExamples.some(email=>email.startsWith("\u00a0")));
});
test("equivalent parsed emails are idempotent and never rewrite frozen raw inputs",()=>{
  for(const email of emailExamples) {
    const input=Object.freeze({...fixture,email});
    const outputs=[signupSchema.parse(input),loginSchema.parse({email,password:fixture.password}),resetSchema.parse({email})];
    assert.equal(input.email,email);
    for(const parsed of outputs) assert.equal(emailSchema.parse(parsed.email),parsed.email);
    assert.equal(new Set(outputs.map(output=>output.email)).size,1);
  }
});
test("format rejection and provider-independent dots/plus handling remain unchanged",()=>{
  for(const email of ["", " ","a@b","a b@example.invalid","a@@example.invalid"]) {
    assert.equal(signupSchema.safeParse({...fixture,email}).success,false);
    assert.equal(loginSchema.safeParse({email,password:fixture.password}).success,false);
    assert.equal(resetSchema.safeParse({email}).success,false);
  }
  assert.equal(emailSchema.parse(" First.Last+Tag@GMAIL.COM "),"first.last+tag@gmail.com");
  assert.notEqual(emailSchema.parse("first.last+tag@gmail.com"),emailSchema.parse("firstlast@gmail.com"));
});
test("assessment trimming shows leading/trailing collisions without altering accepted product passwords",()=>{
  const rows=passwordComparison();
  for(const label of ["Leading space","Trailing space","Both edges","Unicode edge whitespace"]) {
    const row=rows.find(item=>item.case===label);
    assert.equal(row.trimChangesValue,true);assert.equal(row.exactEqualsBase,false);assert.equal(row.trimmedEqualsBase,true);
    assert.equal(row.signupPreserves,true);assert.equal(row.loginPreserves,true);
  }
  const internal=rows.find(item=>item.case==="Internal spaces remain");
  assert.equal(internal.trimChangesValue,false);assert.equal(internal.trimmedEqualsBase,false);
});
test("12-code-point boundary remains product policy while trimming can wrongly change eligibility",()=>{
  assert.equal(PASSWORD_MIN,12);
  const row=passwordComparison().find(item=>item.case==="12 to 10 code points");
  assert.equal(row.codePointsBefore,12);assert.equal(row.codePointsAfterTrim,10);
  assert.equal(row.signupAccepts,true);assert.equal(row.trimmedSignupAccepts,false);assert.equal(row.loginPreserves,true);
  for(const n of [11,12,13]) assert.equal(signupPasswordSchema.safeParse("x".repeat(n)).success,n>=12);
});
test("blank/whitespace-only comparison reports enrollment rejection without claiming authentication",()=>{
  const row=passwordComparison().find(item=>item.case==="Whitespace-only (12 spaces)");
  assert.equal(row.signupAccepts,false);assert.equal(row.trimmedSignupAccepts,false);assert.equal(row.loginAccepts,true);
  assert.equal(row.signupPreserves,null);assert.equal(row.loginPreserves,true);
  const empty=compareSyntheticPassword("Empty","","");
  assert.equal(empty.signupAccepts,false);assert.equal(empty.loginAccepts,false);
});
test("Signup and Login preserve identical accepted case, Unicode and edge-space strings",()=>{
  for(const password of [" Synthetic phrase ","\u00a0Synthetic phrase\u2003","??".repeat(12),"Cafe\u0301 synthetic phrase"]) {
    assert.equal(signupSchema.parse({...fixture,password}).password,password);
    assert.equal(loginSchema.parse({email:fixture.email,password}).password,password);
  }
  assert.ok(Object.values(unicodeAndCaseComparison()).every(Boolean));
});
test("comparison never weakens existing Signup control-character rejection",()=>{
  for(const c of ["\t","\n","\r","\u0000"]) assert.equal(signupPasswordSchema.safeParse("Synthetic"+c+"phrase").success,false);
});
test("terminal entry is explicitly enabled, production-off and rejects arbitrary supplied credentials",()=>{
  for(const mode of ["--email","--password-trim"]) assert.equal(authorizedMode([mode],{TASK04_NORMALIZATION_EXPERIMENT:"true"}),mode);
  for(const [args,env] of [[[],{}],[["--email"],{}],[["--email"],{TASK04_NORMALIZATION_EXPERIMENT:"true",NODE_ENV:"production"}],
    [["--email","personal@example.com"],{TASK04_NORMALIZATION_EXPERIMENT:"true"}],[["--password-trim","secret"],{TASK04_NORMALIZATION_EXPERIMENT:"true"}],
    [["--unknown"],{TASK04_NORMALIZATION_EXPERIMENT:"true"}]]) assert.throws(()=>authorizedMode(args,env));
});
test("password report exposes only scenario metadata, never password strings or hashes",t=>{
  const calls=[];
  t.mock.method(console,"log",(...args)=>calls.push(args));
  t.mock.method(globalThis,"fetch",()=>assert.fail("No network requests"));
  report("--password-trim");
  const output=JSON.stringify(calls);
  assert.doesNotMatch(output,/Synthetic comparison phrase|Cafe|\$argon2|BEGIN.*PASSWORD/u);
  assert.match(output,/NOT used by authentication/u);
  for(const row of passwordComparison()) assert.deepEqual(Object.keys(row),["case","codePointsBefore","codePointsAfterTrim","trimChangesValue",
    "exactEqualsBase","trimmedEqualsBase","signupAccepts","trimmedSignupAccepts","loginAccepts","signupPreserves","loginPreserves"]);
});
test("experiment imports only shared validation and does not introduce persistence or password preprocessing into product code",()=>{
  const source=readFileSync(new URL("../experiments/normalization/comparison.ts",import.meta.url),"utf8");
  assert.doesNotMatch(source,/Prisma|from ["']pg["']|fetch\(|writeFile|localStorage|sessionStorage|console\./u);
  const product=readFileSync(new URL("../../lib/auth/schemas.ts",import.meta.url),"utf8");
  const passwordSection=product.slice(product.indexOf("export const signupPasswordSchema"),product.indexOf("export const signupSchema"));
  assert.doesNotMatch(passwordSection,/\.trim\(|\.toLowerCase\(|\.normalize\(|\.transform\(/u);
});
