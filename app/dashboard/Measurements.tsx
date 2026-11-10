"use client";
import {useEffect,useMemo,useRef,useSyncExternalStore} from "react";
import type {SessionController} from "../../lib/auth/session-controller.ts";
import {createMeasurementClient,createMeasurementIntent,createMeasurementsController,measurementDraftValidation,type MeasurementsController} from "../../lib/measurement-client.ts";
import styles from "./dashboard.module.css";
export type MeasurementContext={origin:string;userId:string;sessionController:SessionController};
type Props={clientId:string;context?:MeasurementContext;controller?:MeasurementsController;disabled?:boolean;onBusyChange?:(blocked:boolean)=>void};
const recorded=new Intl.DateTimeFormat("en-NG",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Lagos"});
export default function Measurements({clientId,context,controller:supplied,disabled=false,onBusyChange}:Props){
  const controller=useMemo(()=>{
    if(supplied)return supplied;if(!context)throw Error("Measurement context required.");
    return createMeasurementsController(createMeasurementClient(context.origin),clientId,()=>{void context.sessionController.refresh();},
      {intent:createMeasurementIntent(context.userId,clientId)});
  },[supplied,clientId,context?.origin,context?.userId,context?.sessionController]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  const heading=useRef<HTMLHeadingElement>(null),busy=disabled||state.pending!==null||state.retryUntil!==null;
  useEffect(()=>{if(controller.getSnapshot().status==="idle")void controller.load();},[controller]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[state.mode,state.selected?.id]);
  useEffect(()=>{onBusyChange?.(state.mode==="draft"||state.pending!==null||state.uncertain);return()=>onBusyChange?.(false);},[onBusyChange,state.mode,state.pending,state.uncertain]);
  useEffect(()=>{
    if(state.retryUntil===null)return;
    const timer=setTimeout(()=>controller.resume(),Math.min(Math.max(0,state.retryUntil-Date.now()),2147483647));return()=>clearTimeout(timer);
  },[controller,state.retryUntil]);
  useEffect(()=>{
    if(state.mode!=="draft"&&!state.uncertain&&state.pending!=="save")return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[state.mode,state.uncertain,state.pending]);
  const parsed=measurementDraftValidation(state.draft),version=state.selected;
  return <section className={`${styles.panel} ${styles.businessSetup} ${styles.measurements}`} aria-labelledby="measurements-heading" aria-busy={state.pending!==null}>
    <h2 id="measurements-heading">Measurements</h2>
    {state.status==="unauthenticated"?<p role="status">Your session has expired. <a href="/auth?login">Sign in again</a>.</p>:
     state.status==="business_required"||state.status==="not_found"?<p role="status">{state.message}</p>:
     state.status==="idle"?<p role="status">Loading measurement history...</p>:<>
      {state.status==="unavailable"&&<div className={styles.clientFeedback}><p>Measurement history could not be loaded. Your saved measurements have not been replaced.</p><button type="button" disabled={busy} onClick={()=>{void controller.load();}}>Retry loading measurements</button></div>}
      {state.mode==="draft"?<>
        <h3 ref={heading} tabIndex={-1}>New measurement version</h3><p>Record a complete set. Saving adds a new version to this client's history.</p>
        <form noValidate onSubmit={event=>{event.preventDefault();if(!disabled)void controller.save();}}>
          <div className={styles.clientField}><label htmlFor="measurement-unit">Measurement unit</label><select id="measurement-unit" value={state.draft.unit} disabled={busy||state.uncertain} onChange={event=>controller.setUnit(event.currentTarget.value)}>
            <option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option></select></div>
          <p id="measurement-value-hint" className={styles.businessHint}>Use values greater than 0 and at most 1000, with up to two decimal places. All rows use the selected unit.</p>
          <div className={styles.measurementRows}>{state.draft.entries.map((entry,index)=><fieldset className={styles.measurementRow} key={entry.key}>
            <legend>Measurement {index+1}</legend>
            {([{field:"name",label:"Measurement label"},{field:"value",label:`Value (${state.draft.unit})`}] as const).map(({field,label})=>{
              const issue=!parsed.success&&state.touched.includes(entry.key+":"+field)?parsed.error.issues.find(issue=>issue.path[0]==="entries"&&issue.path[1]===index&&issue.path[2]===field):undefined;
              const id=`measurement-${entry.key}-${field}`;
              return <div className={styles.clientField} key={field}><label htmlFor={id}>{label}</label>
                <input id={id} name={field} type="text" inputMode={field==="value"?"decimal":undefined} autoComplete="off" required value={entry[field]} disabled={busy||state.uncertain}
                  aria-invalid={issue?true:undefined} aria-describedby={[field==="value"?"measurement-value-hint":"",issue?id+"-error":""].filter(Boolean).join(" ")||undefined}
                  onChange={event=>controller.setField(entry.key,field,event.currentTarget.value)}/>
                {issue&&<p className={styles.businessError} id={id+"-error"}>{issue.message}</p>}</div>;
            })}
            <button type="button" className={styles.removeMeasurement} aria-label={`Remove measurement ${index+1}`} disabled={busy||state.uncertain||state.draft.entries.length===1} onClick={()=>controller.removeRow(entry.key)}>Remove</button>
          </fieldset>)}</div>
          <button type="button" disabled={busy||state.uncertain||state.draft.entries.length>=50} onClick={()=>controller.addRow()}>Add measurement</button>
          <p className={styles.businessHint}>{state.draft.entries.length} of 50 measurements</p>
          {!state.uncertain&&<div className={styles.businessActions}><button type="submit" disabled={disabled||!controller.canSave()}>{state.pending==="save"?"Saving...":"Save measurement version"}</button><button type="button" disabled={busy} onClick={()=>controller.cancel()}>Cancel</button></div>}
        </form>
      </>:state.mode==="details"&&version?<>
        <h3 ref={heading} tabIndex={-1}>Version {version.versionNumber}</h3>
        <p>{version.unit==="cm"?"Centimetres (cm)":"Inches (in)"} <span aria-hidden="true">&middot;</span> <time dateTime={version.recordedAt}>{recorded.format(new Date(version.recordedAt))}</time></p>
        <dl className={styles.measurementValues}>{version.entries.map(entry=><div key={entry.name}><dt>{entry.name}</dt><dd>{entry.value} {version.unit}</dd></div>)}</dl>
        <p className={styles.businessHint}>Corrections are saved as a new version. This saved version stays in your client's history.</p>
        <div className={styles.businessActions}><button type="button" disabled={busy||state.uncertain} onClick={()=>controller.begin(true)}>Copy to new version</button><button type="button" disabled={busy||state.uncertain} onClick={()=>controller.back()}>Back to measurement history</button></div>
      </>:<>
        <div className={styles.clientToolbar}><h3 ref={heading} tabIndex={-1}>Measurement history</h3><button type="button" disabled={busy||state.uncertain||state.status!=="ready"} onClick={()=>controller.begin()}>Add measurements</button></div>
        <p className={styles.businessHint}>Record measurements for this client. Each complete set is kept as a separate version.</p>
        {state.status==="ready"&&state.rows.length===0&&!state.uncertain?<p>No measurement versions yet. Add the first set of measurements for this client.</p>:
          state.rows.length>0&&<ul className={styles.measurementHistory} aria-label="Measurement versions">{state.rows.map(v=><li key={v.id}><button type="button" disabled={busy||state.uncertain} onClick={()=>{void controller.open(v.id);}}>
            <strong>Version {v.versionNumber}</strong><span>{v.unit==="cm"?"Centimetres (cm)":"Inches (in)"}</span><time dateTime={v.recordedAt}>{recorded.format(new Date(v.recordedAt))}</time></button></li>)}</ul>}
        {state.cursor&&<button type="button" disabled={busy||state.uncertain} onClick={()=>{void controller.loadMore();}}>{state.pending==="more"?"Loading more...":"Load more versions"}</button>}
      </>}
      {state.uncertain&&<div className={styles.clientFeedback}><p>The save outcome needs checking before another version can be started.</p><div className={styles.businessActions}>
        <button type="button" disabled={busy} onClick={()=>{void controller.checkSaved();}}>{state.pending==="reconcile"?"Checking...":"Check saved version"}</button>
        {state.submitted&&<button type="button" disabled={busy} onClick={()=>{void controller.retry();}}>{state.pending==="save"?"Saving...":"Retry same request"}</button>}
      </div></div>}
      {state.pending==="list"&&<p role="status">Loading measurement history...</p>}{state.pending==="get"&&<p role="status">Loading measurement version...</p>}
      {state.message&&<p role="status" aria-live="polite" aria-atomic="true">{state.message}</p>}
    </>}
  </section>;
}
