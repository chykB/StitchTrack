"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {clientDraftValidation,type ClientRecordsController} from "../../lib/client-record-client.ts";
import styles from "./dashboard.module.css";
import Measurements,{type MeasurementContext} from "./Measurements";
export default function Clients({controller,disabled=false,measurementContext}:{controller:ClientRecordsController;disabled?:boolean;measurementContext?:MeasurementContext}){
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  const heading=useRef<HTMLHeadingElement>(null);
  const [measurementBusy,setMeasurementBusy]=useState(false);
  useEffect(()=>{if(controller.getSnapshot().status==="idle")void controller.load();},[controller]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[state.mode,state.selected?.id]);
  useEffect(()=>{
    if(state.retryUntil===null)return;
    const timer=setTimeout(()=>controller.resume(),Math.min(Math.max(0,state.retryUntil-Date.now()),2147483647));return()=>clearTimeout(timer);
  },[controller,state.retryUntil]);
  useEffect(()=>{
    if(!state.uncertain&&state.pending!=="save")return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[state.uncertain,state.pending]);
  const clientBusy=disabled||state.pending!==null||state.retryUntil!==null,busy=clientBusy||measurementBusy;
  const parsed=clientDraftValidation(state.draft);
  const form=state.mode==="add"||state.mode==="edit";
  return <section className={styles.businessSetup} aria-label="Client management" aria-busy={state.pending!==null}>
    {state.status==="unauthenticated"?<p role="status">Your session has expired. <a href="/auth?login">Sign in again</a>.</p>:
     state.status==="business_required"?<p>{state.message}</p>:
     state.status==="idle"?<p role="status">Loading clients...</p>:<>
      {state.pending==="list"&&<p role="status">Loading clients...</p>}
      {state.status==="unavailable"&&<div className={styles.clientFeedback}><p>Clients could not be loaded. Your saved records have not been replaced.</p><button type="button" disabled={busy} onClick={()=>{void controller.load();}}>Retry loading clients</button></div>}
      {form?<section className={styles.panel} aria-labelledby="client-form-heading">
        <h2 id="client-form-heading" ref={heading} tabIndex={-1}>{state.mode==="add"?"Add client":"Edit client"}</h2>
        <form noValidate onSubmit={event=>{event.preventDefault();if(!disabled)void controller.save();}}>
          {([{key:"fullName",label:"Full name",type:"text",complete:"name"},{key:"phone",label:"Phone number (optional)",type:"tel",complete:"tel"},
            {key:"email",label:"Email address (optional)",type:"email",complete:"email"}] as const).map(field=>{
            const issue=!parsed.success&&state.draft[field.key]!==""?parsed.error.issues.find(issue=>issue.path[0]===field.key):undefined;
            return <div className={styles.clientField} key={field.key}>
              <label htmlFor={`client-${field.key}`}>{field.label}</label>
              <input id={`client-${field.key}`} name={field.key} type={field.type} autoComplete={field.complete} required={field.key==="fullName"}
                value={state.draft[field.key]} disabled={busy||state.uncertain} aria-invalid={issue?true:undefined} aria-describedby={issue?`client-${field.key}-error`:undefined}
                onChange={event=>controller.setField(field.key,event.currentTarget.value)}/>
              {issue&&<p id={`client-${field.key}-error`} className={styles.businessError}>{issue.message}</p>}
            </div>;
          })}
          {!state.uncertain&&<div className={styles.businessActions}><button type="submit" disabled={disabled||!controller.canSave()}>{state.pending==="save"?"Saving...":state.mode==="add"?"Add client":"Save changes"}</button>
            <button type="button" disabled={busy} onClick={()=>controller.cancel()}>Cancel</button></div>}
        </form>
        {state.uncertain&&<div className={styles.businessActions}><button type="button" disabled={busy} onClick={()=>{void controller.checkSaved();}}>{state.pending==="reconcile"?"Checking...":"Check saved client"}</button>
          <button type="button" disabled={busy} onClick={()=>{void controller.retry();}}>{state.pending==="save"?"Saving...":"Retry same request"}</button></div>}
      </section>:state.mode==="details"&&state.selected?<><section className={styles.panel} aria-labelledby="client-details-heading">
        <h2 id="client-details-heading" ref={heading} tabIndex={-1} className={styles.clientName}>{state.selected.fullName}</h2>
        <dl><div><dt>Phone number</dt><dd>{state.selected.phone??"Not provided"}</dd></div><div><dt>Email address</dt><dd>{state.selected.email??"Not provided"}</dd></div></dl>
        <div className={styles.businessActions}><button type="button" disabled={busy} onClick={()=>controller.edit()}>Edit client</button><button type="button" disabled={busy} onClick={()=>controller.back()}>Back to clients</button></div>
      </section>{measurementContext&&<Measurements key={state.selected.id} clientId={state.selected.id} context={measurementContext} disabled={clientBusy} onBusyChange={setMeasurementBusy}/>}</> :<>
        <div className={styles.clientToolbar}><p>Keep your business's client contact details together.</p><button type="button" disabled={busy||state.status!=="ready"} onClick={()=>controller.beginAdd()}>Add client</button></div>
        {state.status==="ready"&&state.rows.length===0?<section className={styles.panel}><h2>No clients yet</h2><p>Add your first client to start organizing their details. A name is all you need.</p></section>:
          state.rows.length>0&&<ul className={styles.clientList} aria-label="Clients">{state.rows.map(client=><li key={client.id}>
            <button type="button" disabled={busy} onClick={()=>{void controller.select(client.id);}} aria-label={`View ${client.fullName}`}>
              <strong>{client.fullName}</strong><span>{client.phone??"No phone number"}</span><span>{client.email??"No email address"}</span>
            </button></li>)}</ul>}
        {state.cursor&&<div className={styles.businessActions}><button type="button" disabled={busy} onClick={()=>{void controller.loadMore();}}>{state.pending==="more"?"Loading more...":"Load more clients"}</button></div>}
      </>}
      {state.pending==="get"&&<p role="status">Loading client details...</p>}
      {state.message&&<p role="status" aria-live="polite" aria-atomic="true">{state.message}</p>}
    </>}
  </section>;
}
