"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import type {FrontendSession} from "../../lib/auth/session-client.ts";
import {createLocalSessionClient} from "../../lib/auth/local-session.ts";
import {createSessionController,type SessionController} from "../../lib/auth/session-controller.ts";
import AccountDeletionForm from "../(auth)/_components/AccountDeletionForm";
import styles from "./dashboard.module.css";
import BusinessSetup from "./BusinessSetup";
import Clients from "./Clients";
import {OrdersView} from "./Orders";
import {createClientRecordClient,createClientRecordsController} from "../../lib/client-record-client.ts";
import {createBusinessClient,createBusinessController,type BusinessController} from "../../lib/business-client.ts";

type Props={initialSession:FrontendSession;origin:string;accountDeletionEnabled:boolean;passwordResetEnabled:boolean;controller?:SessionController;businessController?:BusinessController};
export function AccountMenu({disabled,onSettings,onLogout}:{disabled:boolean;onSettings:()=>void;onLogout:()=>void}){
  const menu=useRef<HTMLDetailsElement>(null);
  return <details ref={menu} className={styles.accountMenu} onKeyDown={event=>{if(event.key==="Escape"&&menu.current){menu.current.open=false;menu.current.querySelector("summary")?.focus();}}}>
    <summary aria-label="Open account menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M20 21v-2a8 8 0 0 0-16 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg></summary>
    <div className={styles.menuPanel}><button type="button" disabled={disabled} onClick={()=>{if(menu.current)menu.current.open=false;onSettings();}}>Account settings</button>
      <button type="button" disabled={disabled} onClick={()=>{if(menu.current)menu.current.open=false;onLogout();}}>Log out</button></div>
  </details>;
}
const modules = {
  measurements: {label:"Measurements",copy:"Open a client to view measurement history, record a complete set or copy an earlier version."},
  agreements: {label:"Agreements",copy:"Agreement management is coming soon. You'll be able to review proposals and track client approvals here."},
  deliveries: {label:"Deliveries",copy:"Delivery tracking is coming soon. You'll be able to keep delivery plans and progress together here."},
};
type View = "home" | "settings" | "clients" | "orders" | keyof typeof modules;
const navigation: {view:View;label:string}[] = [{view:"home",label:"Home"},{view:"orders",label:"Orders"},{view:"clients",label:"Clients"},
  ...Object.entries(modules).map(([view,{label}])=>({view:view as keyof typeof modules,label}))];
const iconPaths = {
  home:"m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  orders:"M5 4h14v17H5zM9 4V2h6v2M8 9h8M8 13h8M8 17h5",
  clients:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  measurements:"m3 16 13-13 5 5L8 21zM7 12l3 3M11 8l3 3M15 4l3 3",
  agreements:"M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h4m1 2 2 2 5-5",
  deliveries:"M3 4h13v14H3zM16 9h3l3 4v5h-6M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0M21 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  settings:"M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.63-.94l-.36-2.54a.49.49 0 0 0-.49-.42h-3.84a.49.49 0 0 0-.49.42L9.2 5.32c-.59.23-1.14.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.49 7.49 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.12.21.37.29.6.22l2.39-.96c.49.39 1.04.71 1.63.94l.36 2.54c.04.24.24.42.49.42h3.84c.25 0 .45-.18.49-.42l.36-2.54c.59-.23 1.14-.55 1.63-.94l2.39.96c.23.08.48-.01.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.02-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z",
};
function Icon({name}:{name:View}){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={iconPaths[name]}/></svg>;
}
export function DashboardNavigation({view,onSelect}:{view:View;onSelect:(view:View)=>void}){
  const item=({view:target,label}:{view:View;label:string})=><button key={target} type="button" aria-current={view===target?"page":undefined} onClick={()=>onSelect(target)}><Icon name={target}/>{label}</button>;
  return <nav aria-label="Dashboard navigation" className={styles.navigation}>
    <div className={styles.mainNavigation}>{navigation.map(item)}</div>
    <div className={styles.bottomNavigation}>{item({view:"settings",label:"Settings"})}</div>
  </nav>;
}
export default function Dashboard({initialSession,origin,accountDeletionEnabled,passwordResetEnabled,controller:supplied,businessController:suppliedBusiness}:Props){
  const router=useRouter();
  const controller=useMemo(()=>supplied??createSessionController(createLocalSessionClient(origin),{},initialSession),[supplied,origin,initialSession]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  const business=useMemo(()=>suppliedBusiness??createBusinessController(createBusinessClient(origin),()=>{void controller.refresh();}),[suppliedBusiness,origin,controller,state.session?.user.id]);
  const clients=useMemo(()=>createClientRecordsController(createClientRecordClient(origin),()=>{void controller.refresh();}),[origin,controller,state.session?.user.id]);
  const [view,setView]=useState<View>("home");
  const [menuOpen,setMenuOpen]=useState(false);
  const drawer=useRef<HTMLDialogElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const current=state.status==="authenticated"&&state.session!==null,busy=state.pending!==null||state.retryUntil!==null;
  useEffect(()=>{
    const refresh=()=>{void controller.refresh();};
    const restored=(event:PageTransitionEvent)=>{if(event.persisted)refresh();};
    window.addEventListener("focus",refresh);window.addEventListener("pageshow",restored);
    return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("pageshow",restored);};
  },[controller]);
  useEffect(()=>{if(state.status==="unauthenticated"&&!state.deletionRequested)router.replace("/auth?login");},[router,state.status,state.deletionRequested]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[view]);
  useEffect(()=>{if(!current)setMenuOpen(false);},[current]);
  useEffect(()=>{
    const desktop=window.matchMedia("(min-width: 900px)");
    const close=()=>{if(desktop.matches)drawer.current?.close();};
    desktop.addEventListener("change",close);
    return()=>desktop.removeEventListener("change",close);
  },[]);
  const select=(next:View)=>{
    drawer.current?.close();business.dismissSuccess();setMenuOpen(false);setView(next);
    heading.current?.focus({preventScroll:true});
  };
  const settings=()=>select("settings"),logout=()=>{void controller.logout();};
  const planned=view!=="home"&&view!=="settings"&&view!=="clients"&&view!=="orders"?modules[view]:null;
  // Identity comes from the existing server-validated session, not another lookup.
  const name=state.session?.user.name.trim();
  const greeting=name&&!/^my\s+account$/iu.test(name)?`Welcome back, ${name}`:"Welcome to your workspace";
  return <main id="main" data-dashboard className={`${styles.shell} ${!current?styles.signedOut:""}`} tabIndex={-1}>
    <header className={styles.toolbar}>
      <a className={`brand ${styles.headerBrand}`} href="/" aria-label="StitchTrack home"><span className="brand-mark" aria-hidden="true">ST</span>StitchTrack</a>
      {current&&<div className={styles.headerActions}>
        {state.session?.administration===true&&<a href="/admin">Administration</a>}
        <button className={styles.menuToggle} type="button" aria-label="Open workspace navigation" aria-controls="workspace-navigation" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={()=>{drawer.current?.showModal();setMenuOpen(true);}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <AccountMenu disabled={busy} onSettings={settings} onLogout={logout}/>
      </div>}
    </header>
    {current&&<>
      <aside className={styles.sidebar}><a className={`brand ${styles.sidebarBrand}`} href="/" aria-label="StitchTrack home"><span className="brand-mark" aria-hidden="true">ST</span>StitchTrack</a><DashboardNavigation view={view} onSelect={select}/></aside>
      <dialog ref={drawer} id="workspace-navigation" aria-labelledby="navigation-title" className={styles.drawer} onClose={()=>setMenuOpen(false)}>
        <div className={styles.drawerHeading}><h2 id="navigation-title">Your workspace</h2><button type="button" onClick={()=>drawer.current?.close()} aria-label="Close workspace navigation">Close</button></div>
        <DashboardNavigation view={view} onSelect={select}/>
      </dialog>
    </>}
    <div className={styles.content}>
    {state.deletionRequested?<section className={styles.panel}><h1>Account deletion requested</h1>
      <p>Your account has been locked, and your sessions have been ended. Your personal information has not yet been permanently deleted.</p>
      <p>Your deletion request is awaiting processing. A completion date is not yet confirmed.</p><a href="/">Return to homepage</a></section>:
      current?<>
        <div className={styles.pageHeading}><h1 ref={heading} tabIndex={-1}>{view==="settings"?"Settings":view==="clients"?"Clients":view==="orders"?"Orders":planned?planned.label:greeting}</h1>
          {view==="home"&&<p>Manage your account and explore your workspace.</p>}
          {view==="settings"&&<p>Manage your business details, account information and security.</p>}
        </div>
        {view==="settings"?<>
          <section className={styles.panel} aria-labelledby="business-details-heading"><h2 id="business-details-heading">Business details</h2><BusinessSetup key={state.session!.user.id} origin={origin} sessionController={controller} controller={business} view="settings" disabled={busy}/></section>
          <section className={styles.settingsAccount} aria-labelledby="account-security-heading"><h2 id="account-security-heading">Account &amp; Security</h2>
          <section className={styles.panel} aria-labelledby="identity-heading"><h3 id="identity-heading">Your account</h3><dl><div><dt>Name</dt><dd>{state.session!.user.name}</dd></div><div><dt>Email</dt><dd>{state.session!.user.email}</dd></div><div><dt>Status</dt><dd>Email verified. Account active.</dd></div></dl>
            {passwordResetEnabled&&<a href="/auth?reset">Reset your password</a>}</section>
          {accountDeletionEnabled&&<section className={styles.danger} aria-labelledby="deletion-section-heading"><h3 id="deletion-section-heading">Account deletion</h3><p>Requesting deletion locks your account and ends all sessions. Permanent erasure is a separate process.</p><AccountDeletionForm controller={controller}/></section>}
          </section>
        </>:view==="orders"?<OrdersView key={state.session!.user.id} userId={state.session!.user.id} origin={origin} sessionController={controller} disabled={busy}/>:view==="clients"?<Clients key={state.session!.user.id} controller={clients} disabled={busy} measurementContext={{origin,userId:state.session!.user.id,sessionController:controller}}/>:planned?<section className={`${styles.panel} ${styles.information}`} aria-label={`${planned.label} availability`}>
          <span className={styles.featureIcon}><Icon name={view}/></span><span className={styles.badge}>{view==="measurements"?"By client":"Coming soon"}</span><p>{planned.copy}</p><button type="button" className={styles.secondaryButton} onClick={()=>select(view==="measurements"?"clients":"home")}>{view==="measurements"?"Choose a client":"Return Home"}</button>
        </section>:<>
          <section className={styles.studioPanel} aria-labelledby="studio-heading"><div><h2 id="studio-heading">Your studio, in one place</h2><BusinessSetup key={state.session!.user.id} origin={origin} sessionController={controller} controller={business} view="home" disabled={busy}/></div>
            <img className={styles.studioIllustration} src="/images/stitchtrack_dashboard_tailoring_artwork.png" alt="" width="1030" height="415"/>
          </section>
          <section aria-labelledby="overview-heading" className={styles.overview}><h2 id="overview-heading">Your workspace at a glance</h2><div className={styles.cards}>
            {[{icon:"orders" as const,title:"Orders & clothes",copy:"Create and view orders with individual clothing items."},{icon:"agreements" as const,title:"Client approvals",copy:"Keep client decisions and changes clear."},{icon:"deliveries" as const,title:"Deliveries",copy:"Track progress and delivery plans."}].map(card=><article className={styles.featureCard} key={card.title}><span className={styles.featureIcon}><Icon name={card.icon}/></span><div className={styles.featureText}><div className={styles.cardHeading}><h3>{card.title}</h3><span className={styles.badge}>{card.icon==="orders"?"Available":"Planned"}</span></div><p>{card.copy}</p></div></article>)}
          </div></section>
        </>}
      </>:<section className={styles.panel}><h1>Check your session</h1><p>Your current account access could not be confirmed.</p>
        {state.status==="unknown"&&<div className={styles.retryActions}><button type="button" disabled={busy} onClick={()=>{void controller.refresh();}}>Check session</button>{state.session&&<button type="button" disabled={busy} onClick={logout}>Try logout again</button>}</div>}</section>}
    {!(current&&state.message==="You are logged in.")&&<div role="status" aria-live="polite" aria-atomic="true" className={styles.status}>{state.message}</div>}
    </div>
  </main>;
}
