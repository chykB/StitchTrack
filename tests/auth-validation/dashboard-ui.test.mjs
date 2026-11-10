// Actual components/controllers with offline hook and HTTP doubles. No browser or database.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import "./rendering.mjs";
import {createSessionController} from "../../lib/auth/session-controller.ts";
import {createBusinessClient,createBusinessController} from "../../lib/business-client.ts";
const {default:BusinessSetup}=await import("../../app/dashboard/BusinessSetup.tsx");
const {default:Clients}=await import("../../app/dashboard/Clients.tsx");
const {OrdersView:Orders}=await import("../../app/dashboard/Orders.tsx");
const {default:Dashboard,AccountMenu,DashboardNavigation}=await import("../../app/dashboard/Dashboard.tsx");
const {default:AccountDeletionForm}=await import("../../app/(auth)/_components/AccountDeletionForm.tsx");
const session={user:{id:"synthetic",name:"Synthetic <tailor>",email:"tailor@example.invalid"},expiresAt:Date.now()+604800000};
function fixture(patch={}){
 let reads=0,logouts=0;const controller=createSessionController({enabled:true,session:async()=>{reads++;return {ok:true,data:session};},login:async()=>assert.fail("Dashboard never logs in"),logout:async()=>{logouts++;return {ok:true,data:{loggedOut:true}};},requestDeletion:async()=>({ok:true,data:{requested:true}}),...patch},{},session);
 return {controller,current:{...controller,getServerSnapshot:controller.getSnapshot},reads:()=>reads,logouts:()=>logouts};
}
const props=f=>({initialSession:session,origin:"http://127.0.0.1:3000",accountDeletionEnabled:true,passwordResetEnabled:true,controller:f.current});
function renderComponent(Component,properties){const slots=[];let index=0;
 const state=initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];};
 const hooks={useState:state,useRef:value=>state(()=>({current:value}))[0],useEffect:()=>{index++;},useSyncExternalStore:(_subscribe,get)=>{index++;return get();},useMemo:factory=>{index++;return factory();}};
 return()=>{const internals=React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,old=internals.H;index=0;internals.H=hooks;try{return Component(properties);}finally{internals.H=old;}};
}
function find(node,predicate){if(!node||typeof node!=="object")return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}}
test("the verified dashboard has branding, an accessible account disclosure and truthful empty states without another lookup",()=>{
 const f=fixture(),html=renderToStaticMarkup(createElement(Dashboard,props(f)));
 assert.match(html,/aria-label="StitchTrack home"/);assert.match(html,/aria-label="Dashboard navigation"/);assert.match(html,/<details[^>]*class="accountMenu"/);assert.match(html,/<summary aria-label="Open account menu"/);assert.match(html,/<summary aria-label="Open account menu"><svg[^>]*aria-hidden="true"/);
 assert.match(html,/>Account settings</);assert.match(html,/>Log out</);assert.match(html,/Welcome back, Synthetic &lt;tailor&gt;/);assert.doesNotMatch(html,/Hello,/);
 assert.match(html,/Loading your business information/);assert.match(html,/Your workspace at a glance/);assert.match(html,/Orders &amp; clothes/);assert.equal((html.match(/>Planned</g)||[]).length,2);assert.doesNotMatch(html,/Tailor dashboard|>Dashboard<|<button[^>]*disabled/);
 assert.doesNotMatch(html,/tailor@example.invalid|Request account deletion|href="\/auth\?login"|Administration/);assert.equal(f.reads(),0);
});
test("authenticated session confirmation is not displayed while other dashboard status messages remain available",async()=>{
 const f=fixture();assert.equal(await f.controller.refresh(),true);
 const html=renderToStaticMarkup(createElement(Dashboard,props(f)));
 assert.doesNotMatch(html,/You are logged in\./);assert.doesNotMatch(html,/role="status"/);
 const failed=fixture({logout:async()=>({ok:false,kind:"network"})});await failed.controller.logout();
 assert.match(renderToStaticMarkup(createElement(Dashboard,props(failed))),/Logout could not be confirmed/);
});
test("account-menu actions are native buttons, preserve pending guards and invoke their actual handlers",()=>{
 let settings=0,logout=0;const render=renderComponent(AccountMenu,{disabled:false,onSettings:()=>settings++,onLogout:()=>logout++});let tree=render();
 const summary=find(tree,n=>n.type==="summary"),details=find(tree,n=>n.type==="details");assert.equal(summary.props.role,undefined);assert.equal(summary.props['aria-label'],"Open account menu");
 let focused=false;details.props.ref.current={open:true,querySelector:selector=>{assert.equal(selector,"summary");return {focus:()=>{focused=true;}};}};
 details.props.onKeyDown({key:"Escape"});assert.equal(details.props.ref.current.open,false);assert.equal(focused,true);
 for(const text of ["Account settings","Log out"]){const button=find(tree,n=>n.type==="button"&&n.props.children===text);assert.equal(button.props.type,"button");assert.equal(button.props.disabled,false);details.props.ref.current.open=true;button.props.onClick();assert.equal(details.props.ref.current.open,false);}
 assert.equal(settings,1);assert.equal(logout,1);
 const blocked=renderToStaticMarkup(createElement(AccountMenu,{disabled:true,onSettings(){},onLogout(){}}));assert.equal((blocked.match(/disabled=""/g)||[]).length,2);
});
test("settings stay inside the dashboard and reuse password-reset and password-confirmed deletion controls",()=>{
 const f=fixture(),render=renderComponent(Dashboard,props(f));let tree=render();find(tree,n=>n.type===AccountMenu).props.onSettings();tree=render();
 const html=renderToStaticMarkup(tree);assert.match(html,/<h1[^>]*>Settings<\/h1>/);assert.match(html,/Synthetic &lt;tailor&gt;/);assert.match(html,/tailor@example.invalid/);assert.match(html,/Email verified. Account active./);assert.match(html,/href="\/auth\?reset"/);
 assert.match(html,/Request account deletion/);assert.ok(find(tree,n=>n.type===AccountDeletionForm));assert.doesNotMatch(html,/There are no business records/);
 const deletion=find(tree,n=>n.type===AccountDeletionForm);assert.equal(deletion.props.controller,f.current);assert.equal(f.reads(),0);
 const other=renderComponent(Dashboard,{...props(f),accountDeletionEnabled:false,passwordResetEnabled:false});find(other(),n=>n.type===AccountMenu).props.onSettings();assert.doesNotMatch(renderToStaticMarkup(other()),/Request account deletion|Reset your password/);
});
test("uncertain logout hides private account information and offers recheck without claiming revocation",async()=>{
 const f=fixture({logout:async()=>({ok:false,kind:"network"})}),render=renderComponent(Dashboard,props(f));find(render(),n=>n.type===AccountMenu).props.onSettings();
 assert.equal(await f.controller.logout(),false);let html=renderToStaticMarkup(render());assert.match(html,/Logout could not be confirmed/);assert.match(html,/>Check session</);assert.match(html,/>Try logout again</);assert.doesNotMatch(html,/tailor@example.invalid|Synthetic|You are logged out|Request account deletion|Account menu/);
 await f.controller.refresh();html=renderToStaticMarkup(render());assert.match(html,/tailor@example.invalid/);assert.equal(f.reads(),1);
});
test("logout success, session expiration and revoked sessions clear identity without a second authentication mechanism",async()=>{
 const f=fixture();assert.equal(await f.controller.logout(),true);assert.equal(f.logouts(),1);assert.equal(f.controller.getSnapshot().session,null);
 assert.doesNotMatch(renderToStaticMarkup(createElement(Dashboard,props(f))),/Synthetic|tailor@example.invalid|Account menu|Welcome,/);
 const revoked=fixture({session:async()=>({ok:true,data:null})});await revoked.controller.refresh();assert.equal(revoked.controller.getSnapshot().status,"unauthenticated");assert.doesNotMatch(renderToStaticMarkup(createElement(Dashboard,props(revoked))),/Synthetic|tailor@example.invalid|Account menu/);
 const expired=createSessionController({enabled:true},{now:()=>Date.now()+604800001},session);assert.equal(expired.getSnapshot().status,"unauthenticated");assert.equal(expired.getSnapshot().session,null);
});
test("the Administration link follows current trusted server eligibility and disappears on refresh",async()=>{
 let administrator=true;const f=fixture({session:async()=>({ok:true,data:{...session,administration:administrator}})});await f.controller.refresh();assert.match(renderToStaticMarkup(createElement(Dashboard,props(f))),/href="\/admin"/);
 administrator=false;await f.controller.refresh();assert.doesNotMatch(renderToStaticMarkup(createElement(Dashboard,props(f))),/href="\/admin"/);
 const plain=fixture();assert.doesNotMatch(renderToStaticMarkup(createElement(Dashboard,props(plain))),/Administration/);
});
test("dashboard CSP has a fresh overwritten nonce, no arbitrary inline scripts, and no production eval allowance",async()=>{
 const {NextRequest}=await import("next/server.js"),{proxy}=await import("../../proxy.ts");const old=process.env.NODE_ENV;
 try{
  const policies=[];for(const mode of ["development","production"]){process.env.NODE_ENV=mode;
   const response=proxy(new NextRequest("http://127.0.0.1:3000/dashboard",{headers:{"x-nonce":"caller-nonce","content-security-policy":"caller-policy"}}));const csp=response.headers.get("content-security-policy");policies.push(csp);
   assert.match(csp,/nonce-[0-9a-f]{32}/);assert.match(csp,/strict-dynamic/);assert.match(csp,/frame-ancestors 'none'/);assert.doesNotMatch(csp,/unsafe-inline|caller-nonce|caller-policy/);assert.equal(csp.includes("unsafe-eval"),mode==="development");assert.equal(response.headers.get("cache-control"),"no-store");
  }assert.notEqual(policies[0],policies[1]);
 }finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});

test("sidebar uses one selected state and sends all seven destinations through the existing dashboard",()=>{
 const labels=["Home","Orders","Clients","Measurements","Agreements","Deliveries","Settings"];
 const views=["home","orders","clients","measurements","agreements","deliveries","settings"];
 for(const selected of views){
  const chosen=[];const render=renderComponent(DashboardNavigation,{view:selected,onSelect:view=>chosen.push(view)}),tree=render();
  const html=renderToStaticMarkup(tree);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  labels.forEach((label,index)=>{const button=find(tree,n=>n.type==="button"&&[n.props.children].flat().includes(label));assert.ok(button);assert.equal(button.props['aria-current'],views[index]===selected?"page":undefined);assert.equal(button.props.type,"button");button.props.onClick();});
  assert.deepEqual(chosen,views);assert.doesNotMatch(html,/<a |disabled=/);
 }
});
test("all unfinished sections share an honest informational view and return Home without fetching business records",()=>{
 const f=fixture(),render=renderComponent(Dashboard,props(f));
 for(const [view,label] of [["agreements","Agreements"],["deliveries","Deliveries"]]){
  let tree=render();find(tree,n=>n.type===DashboardNavigation).props.onSelect(view);tree=render();
  const html=renderToStaticMarkup(tree);assert.match(html,new RegExp(`<h1[^>]*>${label}</h1>`));assert.match(html,/Coming soon/);assert.match(html,/is coming soon/);assert.doesNotMatch(html,/Your studio, in one place|tailor@example.invalid|Request account deletion|<table/);
  find(tree,n=>n.type==="button"&&n.props.children==="Return Home").props.onClick();assert.match(renderToStaticMarkup(render()),/Welcome back, Synthetic &lt;tailor&gt;/);
 }
 assert.equal(f.reads(),0);
});
test("sidebar Settings opens the same authorized settings as the account menu",()=>{
 const f=fixture(),render=renderComponent(Dashboard,props(f)),initial=render(),initialHtml=renderToStaticMarkup(initial);
 assert.match(initialHtml,/d="M19\.14 12\.94/);
 find(initial,n=>n.type===DashboardNavigation).props.onSelect("settings");
 const tree=render(),html=renderToStaticMarkup(tree);assert.match(html,/tailor@example.invalid/);assert.match(html,/Email verified. Account active./);assert.ok(find(tree,n=>n.type===AccountDeletionForm));assert.equal(f.reads(),0);
});
test("mobile navigation uses a labelled modal, synchronized disclosure state and closes before focusing the section",()=>{
 const f=fixture(),render=renderComponent(Dashboard,props(f)),events=[];let tree=render();
 const dialog=find(tree,n=>n.type==="dialog"),toggle=find(tree,n=>n.props['aria-controls']==="workspace-navigation"),heading=find(tree,n=>n.type==="h1");
 assert.equal(dialog.props['aria-labelledby'],"navigation-title");assert.equal(toggle.props['aria-expanded'],false);assert.equal(toggle.props['aria-haspopup'],"dialog");
 dialog.props.ref.current={showModal:()=>events.push("open"),close:()=>events.push("close")};heading.props.ref.current={focus:()=>events.push("focus")};
 toggle.props.onClick();tree=render();assert.equal(find(tree,n=>n.props['aria-controls']==="workspace-navigation").props['aria-expanded'],true);
 find(tree,n=>n.type===DashboardNavigation).props.onSelect("orders");tree=render();assert.deepEqual(events,["open","close","focus"]);assert.equal(find(tree,n=>n.props['aria-controls']==="workspace-navigation").props['aria-expanded'],false);
 find(tree,n=>n.props['aria-label']==="Close workspace navigation").props.onClick();assert.equal(events.at(-1),"close");
 find(tree,n=>n.type==="dialog").props.onClose();assert.equal(find(render(),n=>n.props['aria-controls']==="workspace-navigation").props['aria-expanded'],false);
});

test("Home greets only the current server-confirmed identity and falls back for empty or generic labels",async()=>{
 for(const name of ["Blessing","  Chidi Okoro  ","","   ","my account"," My ACCOUNT "]){
  let lookups=0;const f=fixture({session:async()=>{lookups++;return {ok:true,data:{...session,user:{...session.user,name}}};}});await f.controller.refresh();
  const html=renderToStaticMarkup(createElement(Dashboard,props(f))),heading=html.match(/<h1[^>]*>(.*?)<\/h1>/)[1];
  assert.equal(heading,name.trim()&&!/^my\s+account$/iu.test(name.trim())?"Welcome back, "+name.trim():"Welcome to your workspace");
  assert.doesNotMatch(html,/Hello,|A little more clarity/);assert.equal(lookups,1);
 }
});
test("branding belongs to the desktop sidebar and mobile header while account actions remain in the workspace toolbar",()=>{
 const f=fixture(),tree=renderComponent(Dashboard,props(f))();
 const sidebar=find(tree,n=>n.type==="aside"),toolbar=find(tree,n=>n.type==="header");
 assert.ok(find(sidebar,n=>n.type==="a"&&n.props.className.includes("sidebarBrand")));
 assert.ok(find(sidebar,n=>n.type===DashboardNavigation));
 assert.ok(find(toolbar,n=>n.type==="a"&&n.props.className.includes("headerBrand")));
 assert.ok(find(toolbar,n=>n.type===AccountMenu));assert.equal(f.reads(),0);
});
test("the decorative standalone illustration loads locally and preserves truthful setup copy",async()=>{
 const {readFile}=await import("node:fs/promises");const f=fixture(),tree=renderComponent(Dashboard,props(f))();
 const image=find(tree,n=>n.type==="img");assert.equal(image.props.src,"/images/stitchtrack_dashboard_tailoring_artwork.png");assert.equal(image.props.alt,"");assert.equal(Number(image.props.width),1030);assert.equal(Number(image.props.height),415);
 const png=await readFile(new URL("../../public/images/stitchtrack_dashboard_tailoring_artwork.png",import.meta.url));
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),1030);assert.equal(png.readUInt32BE(20),415);
 const css=await readFile(new URL("../../app/dashboard/dashboard.module.css",import.meta.url),"utf8");
 assert.match(css,/\.studioPanel::before/);assert.match(css,/clip-path:\s*ellipse/);assert.match(css,/mask-image:\s*linear-gradient/);assert.match(css,/object-fit:\s*contain/);assert.doesNotMatch(css,/aspect-ratio:\s*360\s*\/\s*220/);
 const html=renderToStaticMarkup(tree);assert.match(html,/Loading your business information/);
 assert.equal((html.match(/>Planned</g)||[]).length,2);assert.doesNotMatch(html,/>Set up.*<button|<table/);assert.equal(f.reads(),0);
});

test("Home and Settings share the saved business, with editing separated from account security",async()=>{
 const f=fixture();let stored={id:"offline-studio",name:"Saved Studio",timeZone:"Africa/Lagos"},reads=0,writes=0;
 const business=createBusinessController(createBusinessClient("http://127.0.0.1:3000",{currentOrigin:()=>"http://127.0.0.1:3000",fetch:async(_p,init)=>{if(init.method==="POST"){writes++;stored={...stored,name:JSON.parse(init.body).name};}else reads++;return Response.json({business:stored});}}));await business.load();
 const draw=renderComponent(Dashboard,{...props(f),businessController:business});let tree=draw(),home=find(tree,n=>n.type===BusinessSetup);
 assert.equal(home.props.controller,business);assert.equal(home.props.view,"home");let html=renderToStaticMarkup(tree);assert.match(html,/Saved Studio/);assert.match(html,/Your studio, in one place/);assert.match(html,/stitchtrack_dashboard_tailoring_artwork.png/);assert.doesNotMatch(html,/Edit business name|Timezone|Africa\/Lagos|Business details saved/);
 find(tree,n=>n.type===DashboardNavigation).props.onSelect("settings");tree=draw();const section=find(tree,n=>n.props['aria-labelledby']==="business-details-heading");assert.ok(section);const settings=find(section,n=>n.type===BusinessSetup);assert.equal(settings.props.controller,business);assert.equal(settings.props.view,"settings");
 html=renderToStaticMarkup(tree);assert.match(html,/<h1[^>]*>Settings<\/h1>/);assert.match(html,/>Business details</);assert.match(html,/>Account &amp; Security</);assert.match(html,/Edit business name/);assert.match(html,/Request account deletion/);assert.match(html,/tailor@example.invalid/);
 business.edit();business.setName("Renamed Studio");await business.save();assert.match(renderToStaticMarkup(draw()),/Business details saved/);
 find(draw(),n=>n.type===DashboardNavigation).props.onSelect("home");html=renderToStaticMarkup(draw());assert.match(html,/Renamed Studio/);assert.doesNotMatch(html,/Edit business name|Business details saved|Africa\/Lagos/);assert.equal(reads,1);assert.equal(writes,1);
});

test("Clients navigation opens functional management within the authenticated dashboard instead of the planned view",async()=>{
 const f=fixture(),draw=renderComponent(Dashboard,props(f));
 find(draw(),n=>n.type===DashboardNavigation).props.onSelect("clients");const tree=draw(),html=renderToStaticMarkup(tree);
 assert.match(html,/<h1[^>]*>Clients<\/h1>/);assert.match(html,/Loading clients/);assert.ok(find(tree,n=>n.type===Clients));assert.doesNotMatch(html,/Client management is coming soon|Clients availability/);
 assert.equal(f.reads(),0);assert.ok(find(tree,n=>n.type===AccountMenu));
 await f.controller.logout();assert.equal(find(draw(),n=>n.type===Clients),undefined);assert.doesNotMatch(renderToStaticMarkup(draw()),/Client management|Loading clients/);
});

test("Measurements navigation directs the tailor to existing Client details without claiming the feature is unavailable",()=>{
 const f=fixture(),render=renderComponent(Dashboard,props(f));let tree=render();
 find(tree,n=>n.type===DashboardNavigation).props.onSelect("measurements");tree=render();
 assert.match(renderToStaticMarkup(tree),/Open a client to view measurement history/);assert.doesNotMatch(renderToStaticMarkup(tree),/Measurement management is coming soon/);
 find(tree,n=>n.type==="button"&&n.props.children==="Choose a client").props.onClick();
 const clients=find(render(),n=>n.type?.name==="Clients");assert.ok(clients);assert.equal(clients.props.measurementContext.origin,props(f).origin);assert.equal(clients.props.measurementContext.userId,f.controller.getSnapshot().session.user.id);
});


test("desktop sidebar stays viewport-bound and independently scrollable without changing its grid column",async()=>{
 const {readFile}=await import("node:fs/promises");
 const css=await readFile(new URL("../../app/dashboard/dashboard.module.css",import.meta.url),"utf8");
 const desktop=css.split("@media (min-width: 900px) {")[1].split("\n}\n")[0];
 const sidebar=desktop.match(/\.sidebar \{([^}]+)\}/)[1];
 for(const rule of [/position:\s*sticky/,/top:\s*0(?:;|$)/,/align-self:\s*start/,/height:\s*100dvh/,/min-height:\s*0(?:;|$)/,/overflow-y:\s*auto/])assert.match(sidebar,rule);
 assert.match(sidebar,/grid-column:\s*1/);assert.match(sidebar,/grid-row:\s*1 \/ 3/);assert.match(sidebar,/padding:\s*24px 16px/);
 assert.match(desktop,/grid-template-columns:\s*256px minmax\(0,1fr\)/);
 // Sticky positioning must follow document scrolling, not an overflowing ancestor.
 const globals=await readFile(new URL("../../app/globals.css",import.meta.url),"utf8");
 for(const source of [css,globals])for(const rule of source.matchAll(/(?:^|[}\n])\s*(?:\.shell|body|html)\s*\{([^}]+)\}/g))assert.doesNotMatch(rule[1],/overflow(?:-[xy])?:\s*(?:auto|scroll|hidden)/);
});

test("viewport-bound sidebar rules remain desktop-only while mobile keeps its existing modal drawer",async()=>{
 const {readFile}=await import("node:fs/promises");
 const css=await readFile(new URL("../../app/dashboard/dashboard.module.css",import.meta.url),"utf8");
 const mobile=css.split("@media (min-width: 900px) {")[0];
 assert.match(mobile,/\.sidebar \{\s*display:\s*none;/);assert.doesNotMatch(mobile,/position:\s*sticky/);
 assert.match(mobile,/\.drawer \{[^}]*position:\s*fixed;[^}]*height:\s*100dvh/);
 assert.match(mobile,/\.drawer\[open\] \{[^}]*display:\s*flex/);
});

test("Orders navigation uses the existing management view within the dashboard and hides it after logout",async()=>{
 const f=fixture(),draw=renderComponent(Dashboard,props(f));find(draw(),n=>n.type===DashboardNavigation).props.onSelect("orders");const tree=draw(),html=renderToStaticMarkup(tree);
 assert.match(html,/<h1[^>]*>Orders<\/h1>/);assert.match(html,/Loading orders/);const orders=find(tree,n=>n.type===Orders);assert.ok(orders);assert.equal(orders.props.origin,props(f).origin);assert.equal(orders.props.sessionController,f.current);assert.equal(orders.key,session.user.id);assert.equal(orders.props.userId,session.user.id);assert.doesNotMatch(html,/Order management is coming soon|Orders availability/);assert.equal(f.reads(),0);assert.ok(find(tree,n=>n.type===AccountMenu));
 find(tree,n=>n.type===DashboardNavigation).props.onSelect("home");assert.equal(find(draw(),n=>n.type===Orders),undefined);find(draw(),n=>n.type===DashboardNavigation).props.onSelect("orders");assert.ok(find(draw(),n=>n.type===Orders));
 await f.controller.logout();assert.equal(find(draw(),n=>n.type===Orders),undefined);assert.doesNotMatch(renderToStaticMarkup(draw()),/Order management|Loading orders/);
});
