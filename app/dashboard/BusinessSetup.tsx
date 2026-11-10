"use client";
import {useEffect,useMemo,useSyncExternalStore} from "react";
import type {SessionController} from "../../lib/auth/session-controller.ts";
import {createBusinessClient,createBusinessController,isBusinessSuccess,type BusinessController} from "../../lib/business-client.ts";
import styles from "./dashboard.module.css";
export default function BusinessSetup({origin,sessionController,disabled=false,view="home",controller:supplied}:{origin:string;sessionController:SessionController;disabled?:boolean;view?:"home"|"settings";controller?:BusinessController}){
  const controller=useMemo(()=>supplied??createBusinessController(createBusinessClient(origin),()=>{void sessionController.refresh();}),[supplied,origin,sessionController]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
  useEffect(()=>{if(controller.getSnapshot().status==="loading")void controller.load();},[controller]);
  const success=isBusinessSuccess(state.message);
  useEffect(()=>{
    if(!success)return;
    if(view==="home"){controller.dismissSuccess();return;}
    const timer=setTimeout(()=>controller.dismissSuccess(),5000);
    return()=>clearTimeout(timer);
  },[controller,view,success,state.message]);
  const busy=disabled||state.pending!==null||state.status==="loading";
  return <div className={styles.businessSetup} aria-busy={busy}>
    {state.status==="loading"?<p>Loading your business information...</p>:state.uncertain?<>
      <h3>Check your saved business</h3>
      {state.status==="ready"&&(state.business?<p>Currently saved: <strong>{state.business.name}</strong></p>:<p>No business was returned by the latest check. This does not confirm that the earlier save failed.</p>)}
      <div className={styles.businessActions}><button type="button" disabled={busy} onClick={()=>{void controller.load();}}>Check saved business</button>
        {state.status==="ready"&&<button type="button" disabled={busy} onClick={controller.useSaved}>Use currently saved details</button>}</div>
    </>:state.status==="unavailable"?<>
      <h3>Business setup is temporarily unavailable</h3><button type="button" disabled={busy} onClick={()=>{void controller.load();}}>Try again</button>
    </>:state.business&&(!state.editing||view==="home")?<>
      <h3 className={styles.businessName}>{state.business.name}</h3>
      {view==="settings"&&<button type="button" disabled={busy} onClick={controller.edit}>Edit business name</button>}
    </>:view==="settings"&&!state.business?<p>No business has been set up yet. Use Home to set up your business.</p>:<form noValidate onSubmit={event=>{event.preventDefault();if(!busy)void controller.save();}}>
      <h3>{state.business?"Edit business name":"Set up your business"}</h3>
      <label htmlFor="business-name">Business name</label>
      <input id="business-name" name="name" type="text" autoComplete="organization" required value={state.draft} disabled={busy}
        onChange={event=>controller.setName(event.currentTarget.value)} aria-invalid={state.nameError?true:undefined} aria-describedby={state.nameError?"business-name-hint business-name-error":"business-name-hint"}/>
      <p id="business-name-hint" className={styles.businessHint}>Use 2-120 characters.</p>
      {state.nameError&&<p id="business-name-error" className={styles.businessError}>{state.nameError}</p>}
      <div className={styles.businessActions}><button type="submit" disabled={busy}>{state.pending==="write"?"Saving...":state.business?"Save business name":"Create business"}</button>
        {state.business&&<button type="button" disabled={busy} onClick={controller.cancel}>Cancel</button>}</div>
    </form>}
    {state.message&&!(view==="home"&&success)&&<p role="status" aria-live="polite" aria-atomic="true">{state.message}</p>}
  </div>;
}
