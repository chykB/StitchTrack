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
const input={name:"Ọlá",email:" Synthetic@EXAMPLE.INVALID ",password:" Exact synthetic password ",termsAccepted:true,termsVersionId:terms.id,privacyAcknowledged:true};
function clock(){let time=Date.now(),id=0;const timers=new Map();return {now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id),advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}},timers};}
const stub=(patch={})=>({enabled:true,terms,signup:async()=>({ok:true}),verify:async()=>({ok:true}),resend:async()=>({ok:true}),...patch});
function event({name=input.name,email=input.email,password=input.password,accepted=true}={}){let focused;const values={name,email,password};return {event:{preventDefault(){},currentTarget:{elements:{namedItem:k=>k==="legalAcknowledgement"?{checked:accepted,focus(){focused=k;}}:{value:values[k],focus(){focused=k;}}}}},focused:()=>focused};}

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
test("one approved legal acknowledgement is required and supplies both existing server fields",async()=>{
 let received,calls=0;
 const c=createRegistrationController(stub({signup:async value=>{received=value;calls++;return {ok:true};}})),legal={documentsAvailable:true};
 let e=event({name:"",accepted:false});assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,()=>{},legal),false);assert.equal(e.focused(),"name");
 e=event({accepted:false});let error;assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,m=>{error=m;},legal),false);assert.equal(e.focused(),"legalAcknowledgement");assert.match(error,/Agree to the Terms of Service and acknowledge the Privacy Notice/u);
 e=event();assert.equal(await submitRegistrationForm(e.event,false,()=>{},c,()=>{},legal),false);assert.equal(c.getSnapshot().phase,"signup");
 assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,()=>{}),false);assert.equal(c.getSnapshot().phase,"signup");assert.equal(calls,0);
 assert.equal(await submitRegistrationForm(e.event,true,()=>{},c,()=>{},legal),true);assert.equal(c.getSnapshot().phase,"verification");
 assert.equal(received.termsAccepted,true);assert.equal(received.privacyAcknowledged,true);assert.equal(received.termsVersionId,terms.id);assert.equal(calls,1);
});

test("approved-Terms control is separate from draft acknowledgement; Signup SSR and OTP markup retain accessibility",()=>{
 const control=renderToStaticMarkup(createElement(RegistrationTermsControl,{terms,checked:false,error:"Agree to the Terms of Service and acknowledge the Privacy Notice.",onChange(){},onOpenDocument(){}}));assert.match(control,/name="legalAcknowledgement"/u);assert.match(control,/required/u);assert.match(control,/aria-describedby="signup-legal-error"/u);assert.doesNotMatch(control,/name="draftAcknowledgement"|I have reviewed the draft|Privacy Policy/u);
 const c=createRegistrationController(stub());
 const form=renderToStaticMarkup(createElement(AuthForm,{mode:"signup",buttonLabel:"Create account",legend:"Account details",unavailableMessage:"Account creation is not available yet.",registrationController:c}));
 assert.match(form,/<fieldset[^>]*disabled/u);assert.match(form,/Your name/u);assert.doesNotMatch(form,/Business name/u);assert.match(form,/aria-label="Show password"/u);assert.equal((form.match(/role="status"/gu)||[]).length,1);
 const code=renderToStaticMarkup(createElement(EmailVerificationForm,{controller:c}));assert.match(code,/autoComplete="one-time-code"/iu);assert.match(code,/inputMode="numeric"/iu);assert.doesNotMatch(code,/Codes expire after five minutes and allow three incorrect attempts/u);assert.equal((code.match(/role="status"/gu)||[]).length,1);assert.match(code,/Request another code/u);
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
 assert.doesNotMatch(form,/legal consent is not collected/u);assert.doesNotMatch(form,/name="termsAcceptance"|name="draftAcknowledgement"|Business name/u);
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
function rendersOf(Component, effects) {
 const slots=[];let cursor=0;
 const state=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;
  return [slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];};
 const hooks={useCallback:(callback)=>{cursor++;return callback;},useDebugValue:()=>{},useState:state,useRef:value=>state(()=>({current:value}))[0],useEffect:callback=>{cursor++;effects?.push(callback);},
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
 const hasControls=tree=>!!tree&&typeof tree==="object"&&(tree.type?.name==="AuthSessionControls"||[tree.props?.children].flat(Infinity).some(hasControls));
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

test("combined acknowledgement starts unchecked and opening either document never accepts it",()=>{
 let changes=0;const opened=[],trigger={focus(){}};
 const props={terms,checked:false,onChange(){changes++;},onOpenDocument:(kind,button)=>opened.push([kind,button])};
 const root=RegistrationTermsControl(props),nodes=[];
 const walk=node=>{if(!node||typeof node!=="object")return;nodes.push(node);React.Children.forEach(node.props?.children,walk);};walk(root);
 const boxes=nodes.filter(n=>n.type==="input"),buttons=nodes.filter(n=>n.type==="button");
 assert.equal(boxes.length,1);assert.ok(boxes.every(n=>n.props.checked===false&&n.props.required));
 for(const button of buttons)button.props.onClick({currentTarget:trigger});
 assert.deepEqual(opened,[["terms",trigger],["privacy",trigger]]);assert.equal(changes,0);assert.ok(boxes.every(n=>n.props.checked===false));
 const markup=renderToStaticMarkup(createElement(RegistrationTermsControl,props));
 assert.match(markup,/I agree to the Terms of Service and acknowledge the Privacy Notice\./u);
 assert.doesNotMatch(markup,/not consent to every use/u);assert.doesNotMatch(markup,/checked=|href="\/terms"/u);
});
test("draft documents cannot activate binding acknowledgements or block deferred development signup",()=>{
 const common={mode:"signup",buttonLabel:"Create account",legend:"Account details",unavailableMessage:"Unavailable",draftPreview:{terms:"# Unapproved Terms",privacy:"# Unapproved privacy"}};
 const normal=renderToStaticMarkup(createElement(AuthForm,{...common,registrationController:createRegistrationController(stub())}));
 assert.doesNotMatch(normal,/name="termsAcceptance"|name="privacyAcknowledgement"/u);assert.match(normal,/after the documents are approved/u);
 const development=createRegistrationController(stub({consentDeferred:true,terms:undefined}));
 const preview=renderToStaticMarkup(createElement(AuthForm,{...common,registrationController:development,onOpenDocument(){}}));
 assert.doesNotMatch(preview,/Non-binding preview/u);assert.equal((preview.match(/type="checkbox"/gu)||[]).length,1);assert.doesNotMatch(preview,/name="termsAcceptance"|name="privacyAcknowledgement"|name="draftAcknowledgement"/u);
});


test("the combined development preview remains non-binding and absent from the signup payload",async()=>{
 const opened=[],changed=[],trigger={focus(){}};
 const props={preview:true,checked:false,onChange:v=>changed.push(v),onOpenDocument:(kind,button)=>opened.push([kind,button])};
 const nodes=[];const walk=node=>{if(!node||typeof node!=="object")return;nodes.push(node);React.Children.forEach(node.props?.children,walk);};walk(RegistrationTermsControl(props));
 const boxes=nodes.filter(n=>n.type==="input"),links=nodes.filter(n=>n.type==="button");
 assert.deepEqual(boxes.map(n=>n.props.name),["legalPreview"]);
 assert.ok(boxes.every(n=>n.props.checked===false&&n.props.required===false));
 for(const link of links){assert.equal(link.props.type,"button");link.props.onClick({currentTarget:trigger});}
 assert.deepEqual(opened,[["terms",trigger],["privacy",trigger]]);assert.deepEqual(changed,[]);
 boxes[0].props.onChange({currentTarget:{checked:true}});assert.deepEqual(changed,[true]);
 const html=renderToStaticMarkup(createElement(RegistrationTermsControl,props));
 assert.doesNotMatch(html,/Non-binding preview|not consent to every use/u);
 assert.doesNotMatch(html,/required=|checked=|Terms version|name="termsAcceptance"|name="privacyAcknowledgement"/u);
 for(const checked of [false,true]){
  const calls=[],local="http://127.0.0.1:3000",controller=createRegistrationController(createRegistrationClient({configuration:{origin:local,developmentConsentDeferred:true},currentOrigin:()=>local,
   fetch:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return Response.json({accepted:true},{status:202});}}));
  const e=event({accepted:checked});
  assert.equal(await submitRegistrationForm(e.event,true,()=>{},controller,()=>{}),true);
  assert.deepEqual(calls,[{path:registrationPaths.signup,body:{name:input.name,email:"synthetic@example.invalid",password:input.password}}]);
  assert.equal(controller.getSnapshot().phase,"verification");assert.equal("session" in controller.getSnapshot(),false);
 }
});
test("opening draft views preserves typed signup details and preview checkbox state without accepting documents",()=>{
 const render=rendersOf(AuthScreen),props={mode:"signup",registration:{origin:"http://127.0.0.1:3000",developmentConsentDeferred:true},draftPreview:{terms:"# Draft Terms",privacy:"# Draft Privacy"}};
 const original=formIn(render(props)),controller=original.props.registrationController;
 original.props.onOpenDocument("terms",{focus(){}});const documentTree=render(props);
 assert.equal(documentTree.props.children[0].props.hidden,true);assert.equal(formIn(documentTree).props.registrationController,controller);
 const document=documentTree.props.children[1];assert.equal(document.props.kind,"terms");assert.equal(document.props.source,props.draftPreview.terms);
 document.props.onDocument("privacy");const privacy=render(props).props.children[1];assert.equal(privacy.props.source,props.draftPreview.privacy);
 privacy.props.onBack();assert.equal(render(props).props.children[0].props.hidden,false);
 // The form remains mounted while document views change; its hook state is retained.
 const formRender=rendersOf(AuthForm),formProps=original.props;
 let tree=formRender(formProps);
 const find=(node,predicate)=>{if(!node||typeof node!=="object")return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}};
 find(tree,n=>n.props?.id==="signup-name").props.onChange({currentTarget:{value:"Synthetic tailor"}});
 find(tree,n=>n.type===RegistrationTermsControl).props.onChange(true);
 tree=formRender(formProps);assert.equal(find(tree,n=>n.props?.id==="signup-name").props.value,"Synthetic tailor");
 const legal=find(tree,n=>n.type===RegistrationTermsControl);assert.equal(legal.props.checked,true);assert.equal(legal.props.preview,true);
 // Enabling approved documents later cannot turn preview clicks into acceptance.
 tree=formRender({...formProps,registrationController:createRegistrationController(stub()),approvedDocumentsAvailable:true});
 const approved=find(tree,n=>n.type===RegistrationTermsControl);assert.notEqual(approved.props.preview,true);assert.equal(approved.props.checked,false);
});


test("signup removes the requested explanatory copy without changing the legal wording or adding disclaimers",()=>{
 const controller=createRegistrationController(stub({consentDeferred:true,terms:undefined}));
 const html=renderToStaticMarkup(createElement(AuthScreen,{mode:"signup",registrationController:controller,draftPreview:{terms:"# Draft Terms",privacy:"# Draft Privacy"}}));
 for(const text of ["Acknowledging the Privacy Notice is not consent to every use of your information.",
  "Non-binding preview: these documents are not approved. Checking these boxes is optional and does not record legal acceptance.",
  "Clients access StitchTrack through an invitation from their tailor.","Start with your details. Verify your email before logging in."])
  assert.equal(html.includes(text),false,text);
 assert.equal((html.match(/type="checkbox"/gu)||[]).length,1);assert.doesNotMatch(html,/checked=|name="legalAcknowledgement"|legal consent is not collected/u);
 assert.match(html,/I agree to the Terms of Service and acknowledge the Privacy Notice\./u);
 assert.match(html,/type="button"[^>]*>Terms of Service<\/button>/u);assert.match(html,/type="button"[^>]*>Privacy Notice<\/button>/u);
});


function findNode(tree,predicate) {
 if(!tree||typeof tree!=="object")return;
 if(predicate(tree))return tree;
 for(const child of [tree.props?.children].flat(Infinity)){const found=findNode(child,predicate);if(found)return found;}
}
const acceptedMessage="If your email is eligible for registration, we'll send you a verification code. Please check your inbox or spam folder.";
test("accepted signup displays one Verify your account heading and neutral inline verification without route navigation",async()=>{
 let requests=0;
 const controller=createRegistrationController(stub({signup:async()=>{requests++;return {ok:true};}}));
 const draw=rendersOf(AuthScreen),props={mode:"signup",registrationController:controller};
 assert.ok(formIn(draw(props)));
 assert.equal(await controller.signup(input),true);
 const tree=draw(props),verification=findNode(tree,n=>n.type===EmailVerificationForm);
 assert.ok(findNode(tree,n=>n.type==="h1"&&n.props.children==="Verify your account"));
 assert.equal(formIn(tree),undefined);assert.equal(verification.props.inline,true);assert.equal(verification.props.controller,controller);
 const code=rendersOf(EmailVerificationForm)(verification.props),html=renderToStaticMarkup(code);
 assert.match(html,/<section[^>]*aria-labelledby="auth-title"/u);
 assert.doesNotMatch(html,/<h[12]|Verify your email/u);
 assert.equal(controller.getSnapshot().message,acceptedMessage);assert.ok(html.includes(acceptedMessage.replaceAll("'","&#x27;")));
 assert.match(html,/Already have an account\? <a[^>]*href="\/auth\?login"[^>]*>Sign in<\/a>\./u);
 assert.match(html,/Back to signup/u);assert.doesNotMatch(html,/href="[^"]*verify|email sent successfully|already registered|ineligible/iu);
 // Rerendering preserves the same in-memory operation; it never resubmits signup.
 draw({...props});assert.equal(await controller.signup(input),false);assert.equal(requests,1);
 verification.props.onReturnToSignup();assert.ok(formIn(draw(props)));assert.equal(controller.getSnapshot().email,null);assert.equal(requests,1);
});
test("inline OTP form submits the six-digit string, reports expiry generically and leaves resend cooldown intact",async()=>{
 const time=clock(),calls=[];let expired=true;
 const controller=createRegistrationController(stub({verify:async value=>{calls.push(value);return expired?{ok:false,kind:"invalid_code"}:{ok:true};}}),time);
 await controller.signup(input);
 const effects=[],draw=rendersOf(EmailVerificationForm,effects),props={controller,inline:true,onReturnToSignup:()=>controller.returnToSignup()};
 draw(props);for(const effect of effects.splice(0))effect();
 const submit=()=>findNode(draw(props),n=>n.type==="form").props.onSubmit({preventDefault(){},currentTarget:{elements:{namedItem:()=>({value:"004281"})}}});
 submit();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,[{email:"synthetic@example.invalid",otp:"004281"}]);assert.equal(controller.getSnapshot().phase,"verification");
 assert.match(renderToStaticMarkup(draw(props)),/code could not be verified/u);
 assert.equal(await controller.resend(),false);time.advance(60000);assert.equal(await controller.resend(),true);assert.equal(await controller.resend(),false);
 expired=false;submit();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(controller.getSnapshot().phase,"verified");assert.equal("session" in controller.getSnapshot(),false);
 const html=renderToStaticMarkup(draw(props));assert.match(html,/Email verified\. Log in to continue\./u);assert.match(html,/href="\/auth\?login"/u);assert.doesNotMatch(html,/one-time-code|Back to signup/u);
});
test("reload and navigation reset transient verification safely without requests or retained passwords or OTPs",async()=>{
 let signups=0,verifications=0;
 const client=stub({signup:async()=>{signups++;return {ok:true};},verify:async()=>{verifications++;return {ok:true};}});
 const controller=createRegistrationController(client);await controller.signup(input);
 // A full reload constructs a fresh controller; neither URL nor storage carries a code.
 const fresh=createRegistrationController(client),draw=rendersOf(AuthScreen);
 assert.ok(formIn(draw({mode:"signup",registrationController:fresh})));assert.equal(fresh.getSnapshot().email,null);
 assert.equal(fresh.getSnapshot().phase,"signup");assert.equal(await fresh.verify("004281"),false);
 const original=rendersOf(AuthScreen),configuration={origin:"http://127.0.0.1:3000",developmentConsentDeferred:true};
 const previous=formIn(original({mode:"signup",registration:configuration})).props.registrationController;
 original({mode:"login",localSessionOrigin:configuration.origin});
 const next=formIn(original({mode:"signup",registration:configuration})).props.registrationController;
 assert.notEqual(previous,next);assert.equal(next.getSnapshot().email,null);
 assert.equal(signups,1);assert.equal(verifications,0);
 assert.deepEqual(Object.keys(controller.getSnapshot()).sort(),["phase","pending","email","message","codeError","retryUntil","resendAt"].sort());
});
test("returning to signup cannot abandon an in-flight operation or reset a rate-limit wait",async()=>{
 let finish;const controller=createRegistrationController(stub({signup:()=>new Promise(resolve=>{finish=resolve;})}));
 const pending=controller.signup(input);controller.returnToSignup();assert.equal(controller.getSnapshot().pending,"signup");
 finish({ok:true});await pending;
 const time=clock(),limited=createRegistrationController(stub({verify:async()=>({ok:false,kind:"rate_limited",retryAfterSeconds:12})}),time);
 await limited.signup(input);await limited.verify("004281");const until=limited.getSnapshot().retryUntil;
 limited.returnToSignup();assert.equal(limited.getSnapshot().phase,"signup");assert.equal(limited.getSnapshot().email,null);assert.equal(limited.getSnapshot().retryUntil,until);assert.equal(await limited.signup(input),false);
});


function readyForm(props){
 const effects=[],draw=rendersOf(AuthForm,effects);draw(props);
 // Open the hydration guard; session lookup effects are covered independently.
 effects.at(-1)();return ()=>draw(props);
}
function changeField(draw,mode,field,value){
 findNode(draw(),n=>n.props?.id===mode+"-"+field).props.onChange({currentTarget:{value}});
}
const submitButton=tree=>findNode(tree,n=>n.type==="button"&&n.props.type==="submit");
test("signup uses a real disabled button until shared validation and the preview checkbox pass, including unchecking",async()=>{
 let requests=0,submitted;
 const controller=createRegistrationController(stub({consentDeferred:true,terms:undefined,signup:async value=>{requests++;submitted=value;return {ok:true};}}));
 const draw=readyForm({mode:"signup",buttonLabel:"Create account",legend:"Account details",unavailableMessage:"Unavailable",registrationController:controller,
  draftPreview:{terms:"Draft terms",privacy:"Draft privacy"},onOpenDocument(){}});
 const disabled=()=>submitButton(draw()).props.disabled;
 assert.equal(disabled(),true);
 for(const [field,value] of Object.entries({name:input.name,email:input.email,password:input.password}))changeField(draw,"signup",field,value);
 assert.equal(disabled(),true);
 // Implicit/programmatic submission cannot bypass the UI preview requirement.
 findNode(draw(),n=>n.type==="form").props.onSubmit(event({accepted:false}).event);assert.equal(requests,0);
 findNode(draw(),n=>n.type===RegistrationTermsControl).props.onChange(true);assert.equal(disabled(),false);
 findNode(draw(),n=>n.type===RegistrationTermsControl).props.onChange(false);assert.equal(disabled(),true);
 findNode(draw(),n=>n.type===RegistrationTermsControl).props.onChange(true);
 for(const [field,invalid] of [["name","  "],["email","not-an-email"],["password","short"],["password","abcdef\tghijkl"]]){
  changeField(draw,"signup",field,invalid);assert.equal(disabled(),true,field);changeField(draw,"signup",field,input[field]);assert.equal(disabled(),false);
 }
 // The existing minimum counts Unicode code points, not UTF-16 code units.
 changeField(draw,"signup","password","\u{1f9f5}".repeat(11));assert.equal(disabled(),true);
 changeField(draw,"signup","password","\u{1f9f5}".repeat(12));assert.equal(disabled(),false);
 const html=renderToStaticMarkup(draw());assert.doesNotMatch(html,/name="legalAcknowledgement"/u);assert.equal(requests,0);
 findNode(draw(),n=>n.type==="form").props.onSubmit(event().event);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,1);assert.equal(controller.getSnapshot().phase,"verification");
 assert.deepEqual(submitted,{name:input.name,email:"synthetic@example.invalid",password:input.password});
});
test("approved-document mode requires its own checkbox and pending signup remains disabled without duplicate writes",async()=>{
 let complete,requests=0;
 const controller=createRegistrationController(stub({signup:()=>{requests++;return new Promise(resolve=>{complete=resolve;});}}));
 const props={mode:"signup",buttonLabel:"Create account",legend:"Account details",unavailableMessage:"Unavailable",registrationController:controller,approvedDocumentsAvailable:true,onOpenDocument(){}};
 const draw=readyForm(props);
 for(const [field,value] of Object.entries({name:input.name,email:input.email,password:input.password}))changeField(draw,"signup",field,value);
 assert.equal(submitButton(draw()).props.disabled,true);
 findNode(draw(),n=>n.type===RegistrationTermsControl).props.onChange(true);assert.equal(submitButton(draw()).props.disabled,false);
 const pending=controller.signup(input);assert.equal(submitButton(draw()).props.disabled,true);assert.match(renderToStaticMarkup(draw()),/Submitting signup/u);
 assert.equal(await controller.signup(input),false);assert.equal(requests,1);complete({ok:true});await pending;
});
test("sign-in disabled state uses the existing login contract and blocks repeated pending submissions",async()=>{
 const {createSessionController}=await import("../../lib/auth/session-controller.ts");let complete,requests=0;
 const controller=createSessionController({enabled:true,login:()=>{requests++;return new Promise(resolve=>{complete=resolve;});},session:async()=>({ok:true,data:null})});
 const draw=readyForm({mode:"login",buttonLabel:"Sign in",legend:"Login details",unavailableMessage:"Unavailable",sessionController:controller});
 assert.equal(submitButton(draw()).props.disabled,true);
 changeField(draw,"login","email","not-an-email");changeField(draw,"login","password","x");assert.equal(submitButton(draw()).props.disabled,true);
 changeField(draw,"login","email",input.email);assert.equal(submitButton(draw()).props.disabled,false,"Login must not reapply signup's 12-character rule");
 changeField(draw,"login","password","");assert.equal(submitButton(draw()).props.disabled,true);
 changeField(draw,"login","password","x");const pending=controller.login({email:input.email,password:"x"});assert.equal(submitButton(draw()).props.disabled,true);
 assert.equal(await controller.login({email:input.email,password:"x"}),false);assert.equal(requests,1);
 complete({ok:false,kind:"invalid_credentials"});await pending;assert.equal(submitButton(draw()).props.disabled,false);assert.match(renderToStaticMarkup(draw()),/Email or password is incorrect/u);
});
test("verification uses six ASCII digits, native disabled states, pending/cooldown guards and spaced actions",async t=>{
 const {default:EmailCodeField}=await import("../../app/(auth)/_components/EmailCodeField.tsx");
 const time=clock();t.mock.method(Date,"now",time.now);let completeResend,completeVerify,resends=0,verifies=0;
 const controller=createRegistrationController(stub({resend:()=>{resends++;return new Promise(resolve=>{completeResend=resolve;});},verify:()=>{verifies++;return new Promise(resolve=>{completeVerify=resolve;});}}),time);
 await controller.signup(input);
 const effects=[],render=rendersOf(EmailVerificationForm,effects),props={controller,inline:true,onReturnToSignup:()=>controller.returnToSignup()};
 render(props);effects[0]();const draw=()=>render(props);
 const code=value=>findNode(draw(),n=>n.type===EmailCodeField).props.onChange({currentTarget:{value}});
 const resend=()=>findNode(draw(),n=>n.type==="button"&&n.props.children==="Request another code");
 assert.equal(submitButton(draw()).props.disabled,true);assert.equal(resend().props.disabled,true);
 for(const [value,valid] of [["",false],["12345",false],["1234567",false],["123 56",false],["\uff11\uff12\uff13\uff14\uff15\uff16",false],["004281",true]]){
  code(value);assert.equal(submitButton(draw()).props.disabled,!valid,value);
 }
 const actions=findNode(draw(),n=>n.props?.className==="verificationActions");assert.ok(actions);assert.equal(actions.props.children.length,2);
 assert.doesNotMatch(renderToStaticMarkup(draw()),/Verify your email|Codes expire after five minutes/u);
 time.advance(60000);assert.equal(resend().props.disabled,false);
 resend().props.onClick();assert.equal(resends,1);assert.equal(resend().props.disabled,true);assert.equal(submitButton(draw()).props.disabled,true);
 assert.equal(await controller.resend(),false);completeResend({ok:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(submitButton(draw()).props.disabled,true,"Resend clears the active code validity");assert.equal(resend().props.disabled,true);
 code("004281");assert.equal(submitButton(draw()).props.disabled,false);
 const pending=controller.verify("004281");assert.equal(submitButton(draw()).props.disabled,true);assert.equal(resend().props.disabled,true);assert.equal(await controller.verify("004281"),false);assert.equal(verifies,1);
 completeVerify({ok:false,kind:"invalid_code"});await pending;assert.equal(submitButton(draw()).props.disabled,false);
 const {readFileSync}=await import("node:fs"),css=readFileSync(new URL("../../app/(auth)/auth.module.css",import.meta.url),"utf8");
 assert.match(css,/\.verificationActions\s*\{[^}]*display: grid;[^}]*gap: 12px;/u);assert.match(css,/\.submit:disabled/u);
});
