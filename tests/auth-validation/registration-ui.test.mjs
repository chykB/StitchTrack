// Offline HTTP/clock doubles and server markup. No browser, database or SMTP evidence.
import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import * as React from "react";
import {AuthScreen} from "./rendering.mjs";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {createRegistrationClient} from "../../lib/auth/registration-client.ts";
import {createRegistrationController} from "../../lib/auth/registration-controller.ts";
import {registrationPaths,emailVerificationSchema} from "../../lib/auth/registration-contract.ts";
const {default:AuthForm,RegistrationTermsControl,submitRegistrationForm}=await import("../../app/(auth)/_components/AuthForm.tsx");
const {default:EmailVerificationForm}=await import("../../app/(auth)/_components/EmailVerificationForm.tsx");
const origin="https://synthetic.example.invalid",terms={id:"test-terms",version:"synthetic-only",path:"/terms"};
const input={name:"Ọlá",email:" Synthetic@EXAMPLE.INVALID ",password:" Exact synthetic password ",termsAccepted:true,termsVersionId:terms.id};
function clock(){let time=Date.now(),id=0;const timers=new Map();return {now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id),advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}},timers};}
const stub=(patch={})=>({enabled:true,terms,signup:async()=>({ok:true}),verify:async()=>({ok:true}),resend:async()=>({ok:true}),...patch});
function event({name=input.name,email=input.email,password=input.password,accepted=true}={}){let focused;const values={name,email,password};return {event:{preventDefault(){},currentTarget:{elements:{namedItem:k=>k==="termsAcceptance"?{checked:accepted,focus(){focused=k;}}:{value:values[k],focus(){focused=k;}}}}},focused:()=>focused};}

test("registration transport is default-disabled and refuses HTTP, unknown origins and missing Terms metadata",async()=>{
 let calls=0;const fetch=async()=>{calls++;return Response.json({accepted:true},{status:202});};
 for(const configuration of [undefined,{origin:"http://127.0.0.1:3443",terms},{origin,terms:{...terms,path:"https://outside.invalid"}}]) {
  const c=createRegistrationClient({configuration,fetch,currentOrigin:()=>origin});assert.equal(c.enabled,false);assert.equal((await c.signup(input)).kind,"disabled");
 }
 const c=createRegistrationClient({configuration:{origin,terms},fetch,currentOrigin:()=>"https://outside.invalid"});assert.equal((await c.signup(input)).kind,"disabled");assert.equal(calls,0);
});
test("signup/verify/resend use fixed same-origin JSON paths and preserve exact password/code strings",async()=>{
 const calls=[],c=createRegistrationClient({configuration:{origin,terms},currentOrigin:()=>origin,fetch:async(path,options)=>{calls.push({path,options});return path===registrationPaths.verify?Response.json({verified:true}):Response.json({accepted:true},{status:202});}});
 assert.equal((await c.signup(input)).ok,true);assert.equal((await c.verify({email:input.email,otp:"004281"})).ok,true);assert.equal((await c.resend(input.email)).ok,true);
 assert.deepEqual(calls.map(v=>v.path),Object.values(registrationPaths));assert.equal(JSON.parse(calls[0].options.body).password,input.password);assert.equal(JSON.parse(calls[0].options.body).email,"synthetic@example.invalid");assert.equal(JSON.parse(calls[1].options.body).otp,"004281");
 for(const c of calls){assert.equal(c.options.credentials,"same-origin");assert.equal(c.options.redirect,"error");assert.equal(c.options.cache,"no-store");}
 assert.equal(emailVerificationSchema.parse({email:input.email,otp:"004281"}).otp,"004281");
 assert.equal((await c.signup({...input,termsAccepted:false})).kind,"invalid_input");assert.equal(calls.length,3);
});
test("responses are strict and errors/Retry-After are sanitized without claiming delivery or authentication",async()=>{
 for(const [body,status,kind] of [[{accepted:true,token:"private"},202,"unavailable"],[{error:"private email exists"},503,"unavailable"],[{error:"private"},422,"invalid_input"]]){
  const c=createRegistrationClient({configuration:{origin,terms},currentOrigin:()=>origin,fetch:async()=>Response.json(body,{status})});assert.equal((await c.signup(input)).kind,kind);
 }
 const c=createRegistrationClient({configuration:{origin,terms},currentOrigin:()=>origin,fetch:async()=>Response.json({error:"private"},{status:429,headers:{"retry-after":"12"}})});
 assert.deepEqual(await c.verify({email:input.email,otp:"004281"}),{ok:false,kind:"rate_limited",retryAfterSeconds:12});
});
test("controller blocks duplicates, keeps only canonical email, enforces resend wait and requires verified response",async()=>{
 const time=clock();let done,calls=0,resends=0;
 const c=createRegistrationController(stub({signup:()=>{calls++;return new Promise(r=>{done=r;});},resend:async()=>{resends++;return {ok:true};}}),time),off=c.subscribe(()=>{});
 try {
  const pending=c.signup(input);assert.equal(c.getSnapshot().pending,"signup");assert.equal(await c.signup(input),false);assert.equal(calls,1);done({ok:true});assert.equal(await pending,true);
  assert.equal(c.getSnapshot().email,"synthetic@example.invalid");assert.equal("password" in c.getSnapshot(),false);assert.equal("otp" in c.getSnapshot(),false);assert.equal(await c.resend(),false);
  time.advance(60000);assert.equal(await c.resend(),true);assert.equal(resends,1);assert.equal(await c.verify("004281"),true);assert.equal(c.getSnapshot().phase,"verified");assert.match(c.getSnapshot().message,/Log in/u);assert.equal("session" in c.getSnapshot(),false);
 }finally{off();}assert.equal(time.timers.size,0);
});
test("uncertain signup offers verification without falsely confirming signup, and code failures do not authenticate",async()=>{
 const c=createRegistrationController(stub({signup:async()=>({ok:false,kind:"network"}),verify:async()=>({ok:false,kind:"invalid_code"})}));
 assert.equal(await c.signup(input),false);assert.equal(c.getSnapshot().phase,"verification");assert.match(c.getSnapshot().message,/could not be confirmed/u);assert.equal(await c.verify("004281"),false);assert.equal(c.getSnapshot().phase,"verification");assert.match(c.getSnapshot().codeError,/code could not be verified/u);
});
test("429 feedback blocks operations until Retry-After; subscriptions release timers",async()=>{
 const time=clock(),c=createRegistrationController(stub({signup:async()=>({ok:false,kind:"rate_limited",retryAfterSeconds:3})}),time),off=c.subscribe(()=>{});
 try{await c.signup(input);assert.match(c.getSnapshot().message,/Too many attempts/u);assert.equal(await c.signup(input),false);time.advance(3000);assert.equal(c.getSnapshot().retryUntil,null);}finally{off();}assert.equal(time.timers.size,0);
});
test("form preserves hydration and first-invalid focus, requires actual Terms and prevents duplicate submission",async()=>{
 const c=createRegistrationController(stub());let e=event({name:"",accepted:false});assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,()=>{}),false);assert.equal(e.focused(),"name");
 e=event({accepted:false});let error;assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,m=>{error=m;}),false);assert.equal(e.focused(),"termsAcceptance");assert.match(error,/Accept the Platform Terms/u);
 e=event();assert.equal(await submitRegistrationForm(e.event,false,()=>{},c,()=>{}),false);assert.equal(c.getSnapshot().phase,"signup");assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,()=>{}),true);assert.equal(c.getSnapshot().phase,"verification");
});
test("approved-Terms control is separate from draft acknowledgement; Signup SSR and OTP markup retain accessibility",()=>{
 const control=renderToStaticMarkup(createElement(RegistrationTermsControl,{terms,checked:false,error:"Accept the Platform Terms.",onChange(){}}));assert.match(control,/name="termsAcceptance"/u);assert.match(control,/required/u);assert.match(control,/aria-describedby="signup-terms-error"/u);assert.doesNotMatch(control,/name="draftAcknowledgement"|I have reviewed the draft|Privacy Policy/u);
 const c=createRegistrationController(stub());
 const form=renderToStaticMarkup(createElement(AuthForm,{mode:"signup",buttonLabel:"Create account",legend:"Account details",unavailableMessage:"Account creation is not available yet.",registrationController:c}));
 assert.match(form,/<fieldset[^>]*disabled/u);assert.match(form,/Your name/u);assert.doesNotMatch(form,/Business name/u);assert.match(form,/aria-label="Show password"/u);assert.equal((form.match(/role="status"/gu)||[]).length,1);
 const code=renderToStaticMarkup(createElement(EmailVerificationForm,{controller:c}));assert.match(code,/autoComplete="one-time-code"/iu);assert.match(code,/inputMode="numeric"/iu);assert.match(code,/five minutes/u);assert.equal((code.match(/role="status"/gu)||[]).length,1);assert.match(code,/Request another code/u);
});


test("explicit local development signup omits consent fields and reuses accessible signup/OTP states",async()=>{
 const local="https://127.0.0.1:3443",calls=[];
 const client=createRegistrationClient({configuration:{origin:local,developmentConsentDeferred:true},currentOrigin:()=>local,fetch:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});return Response.json({accepted:true},{status:202});
 }}),controller=createRegistrationController(client);
 const e=event({accepted:false});assert.equal(await submitRegistrationForm(e.event,true,()=>{},controller,message=>assert.equal(message,undefined)),true);
 assert.deepEqual(calls[0].body,{name:input.name,email:"synthetic@example.invalid",password:input.password});
 assert.equal(controller.getSnapshot().phase,"verification");assert.equal(controller.terms,undefined);
 const form=renderToStaticMarkup(createElement(AuthForm,{mode:"signup",buttonLabel:"Create account",legend:"Account details",unavailableMessage:"Unavailable",registrationController:controller}));
 assert.match(form,/legal consent is not collected/u);assert.doesNotMatch(form,/name="termsAcceptance"|name="draftAcknowledgement"|Business name/u);
 assert.match(form,/Your name/u);assert.match(form,/aria-label="Show password"/u);
 assert.equal(createRegistrationClient({configuration:{origin,developmentConsentDeferred:true},currentOrigin:()=>origin}).enabled,false);
});

test("loopback HTTP development signup uses the existing controller and real endpoint contract without consent or automatic login",async()=>{
 for(const local of ["http://localhost:3000","http://127.0.0.1:3000"]){
  const calls=[],client=createRegistrationClient({configuration:{origin:local,developmentConsentDeferred:true},currentOrigin:()=>local,fetch:async(path,options)=>{
   calls.push({path,body:JSON.parse(options.body)});return path===registrationPaths.verify?Response.json({verified:true}):Response.json({accepted:true},{status:202});
  }}),controller=createRegistrationController(client);
  assert.equal(await controller.signup({name:input.name,email:input.email,password:input.password}),true);
  assert.equal(controller.getSnapshot().phase,"verification");assert.equal(await controller.verify("004281"),true);
  assert.match(controller.getSnapshot().message,/Log in/u);assert.deepEqual(calls.map(x=>x.path),[registrationPaths.signup,registrationPaths.verify]);
  assert.equal(calls[0].body.password,input.password);assert.equal("termsAccepted" in calls[0].body,false);
 }
 for(const local of ["http://192.0.2.1:3000","http://localhost:3001","http://localhost:3000/"])
  assert.equal(createRegistrationClient({configuration:{origin:local,developmentConsentDeferred:true}}).enabled,false);
});

// Sequential hook-dispatcher double for the installed React version: retain hook
// slots across prop changes, without mounting a DOM, running effects or requests.
// This exercises the actual components, not a second controller implementation.
function rendersOf(Component) {
 const slots=[];let cursor=0;
 const state=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;
  return [slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];};
 const hooks={useState:state,useRef:value=>state(()=>({current:value}))[0],useEffect:()=>{cursor++;},
  useReducer:(reducer,arg,init)=>{const [value,set]=state(()=>init?init(arg):arg);return [value,event=>set(previous=>reducer(previous,event))];},
  useSyncExternalStore:(_subscribe,get)=>{cursor++;return get();},
  useMemo:(factory,deps)=>{const i=cursor++,old=slots[i];if(!old||old.deps.length!==deps.length||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:factory()};return slots[i].value;}};
 return props=>{
  const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,old=internals.H;cursor=0;internals.H=hooks;
  try{return Component(props);}finally{internals.H=old;}
 };
}
function formIn(tree) {
 if(!tree||typeof tree!=="object")return;
 if(tree.type===AuthForm)return tree;
 for(const child of [tree.props?.children].flat(Infinity)){const found=formIn(child);if(found)return found;}
}
test("Login-to-Signup navigation replaces the initially disabled controller with the configured registration client",()=>{
 const render=rendersOf(AuthScreen),configuration={origin:"http://127.0.0.1:3000",developmentConsentDeferred:true};
 assert.equal(formIn(render({mode:"login",localSessionOrigin:configuration.origin})).props.registrationController,undefined);
 const signup=formIn(render({mode:"signup",registration:configuration})).props.registrationController;
 assert.equal(signup.enabled,true);assert.equal(signup.consentDeferred,true);
 // Equivalent server props must preserve an in-progress OTP controller.
 assert.equal(formIn(render({mode:"signup",registration:{...configuration}})).props.registrationController,signup);
 render({mode:"login",localSessionOrigin:configuration.origin});
 const next=formIn(render({mode:"signup",registration:configuration})).props.registrationController;
 assert.equal(next.enabled,true);assert.notEqual(next,signup);
});
test("refreshed signup configuration can enable and disable the controller without retaining a stale opt-in",()=>{
 const render=rendersOf(AuthScreen),configuration={origin:"http://127.0.0.1:3000",developmentConsentDeferred:true};
 assert.equal(formIn(render({mode:"signup"})).props.registrationController.enabled,false);
 assert.equal(formIn(render({mode:"signup",registration:configuration})).props.registrationController.enabled,true);
 assert.equal(formIn(render({mode:"signup"})).props.registrationController.enabled,false);
});
test("the login form also replaces a disabled controller when its server-supplied origin becomes available",()=>{
 const render=rendersOf(AuthForm),props={mode:"login",buttonLabel:"Log in",legend:"Login details",unavailableMessage:"Login is not available yet."};
 const hasControls=tree=>[tree.props.children].flat(Infinity).some(child=>child?.type?.name==="AuthSessionControls");
 assert.equal(hasControls(render(props)),false);
 assert.equal(hasControls(render({...props,localSessionOrigin:"http://127.0.0.1:3000"})),true);
 assert.equal(hasControls(render(props)),false);
});

test("signup HTTP 503 reports uncertainty without implying that an OTP was queued or an account exists",async()=>{
 for(const error of ["registration_unavailable","breach_check_unavailable","account-private-details-must-not-leak"]){
  let requests=0;const local="http://127.0.0.1:3000";
  const controller=createRegistrationController(createRegistrationClient({configuration:{origin:local,developmentConsentDeferred:true},currentOrigin:()=>local,
   fetch:async()=>{requests++;return Response.json({error},{status:503});}}));
  assert.equal(await controller.signup({name:input.name,email:input.email,password:input.password}),false);
  const state=controller.getSnapshot();assert.equal(state.phase,"signup");assert.equal(state.pending,null);assert.equal(state.email,null);assert.equal(state.resendAt,null);
  assert.equal(state.message,"Signup could not be confirmed. Please try again when the service is available.");
  assert.doesNotMatch(state.message,/check your email|account exists|definitely failed|private-details/iu);assert.equal(requests,1);
 }
 // A lost response can follow commit. Preserve the existing conditional OTP path.
 const uncertain=createRegistrationController(stub({signup:async()=>({ok:false,kind:"network"})}));
 assert.equal(await uncertain.signup(input),false);assert.equal(uncertain.getSnapshot().phase,"verification");
 assert.equal(uncertain.getSnapshot().message,"Signup could not be confirmed. If a code arrives, enter it below.");
});
