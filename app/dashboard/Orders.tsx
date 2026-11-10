"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {createOrderClient,createOrderIntent,createOrdersController,orderDraftValidation,orderItemDescriptionValidation,type OrdersController} from "../../lib/order-client.ts";
import {createMeasurementClient} from "../../lib/measurement-client.ts";
import {createClientRecordClient} from "../../lib/client-record-client.ts";
import type {SessionController} from "../../lib/auth/session-controller.ts";
import styles from "./dashboard.module.css";
const recorded=new Intl.DateTimeFormat("en-NG",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Lagos"});
function Timestamp({value}:{value:string}){return <time dateTime={value}>{recorded.format(new Date(value))}</time>;}
export function OrdersView({origin,userId,sessionController,disabled=false}:{origin:string;userId:string;sessionController:SessionController;disabled?:boolean}){
  const workspace=useMemo(()=>{
    const lifetime={active:true};
    return {lifetime,controller:createOrdersController(createOrderClient(origin),createClientRecordClient(origin),()=>{void sessionController.refresh();},
      {isActive:()=>lifetime.active,measurements:createMeasurementClient(origin),intent:createOrderIntent(userId)})};
  },[origin,userId,sessionController]);
  useEffect(()=>{
    workspace.lifetime.active=true;
    return()=>{workspace.lifetime.active=false;};
  },[workspace]);
  return <Orders controller={workspace.controller} disabled={disabled}/>;
}
export default function Orders({controller,disabled=false}:{controller:OrdersController;disabled?:boolean}){
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot),heading=useRef<HTMLHeadingElement>(null);
  const busy=disabled||state.pending!==null||state.retryUntil!==null,order=state.selected;
  const [copyFeedback,setCopyFeedback]=useState<{id:string;message:string}|null>(null);
  const editInput=useRef<HTMLTextAreaElement>(null),lastEdited=useRef<string|null>(null);
  useEffect(()=>{if(controller.getSnapshot().status==="idle")void controller.load();},[controller]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[state.mode,state.selected?.id]);
  useEffect(()=>{
    if(state.edit){lastEdited.current=state.edit.original.id;editInput.current?.focus({preventScroll:true});}
    else if(lastEdited.current){document.getElementById(`order-edit-${lastEdited.current}`)?.focus({preventScroll:true});lastEdited.current=null;}
  },[state.edit?.original.id]);
  useEffect(()=>{
    if(state.retryUntil===null)return;
    const timer=setTimeout(()=>controller.resume(),Math.min(Math.max(0,state.retryUntil-Date.now()),2147483647));return()=>clearTimeout(timer);
  },[controller,state.retryUntil]);
  useEffect(()=>{
    if(state.mode!=="create"&&state.pending!=="save"&&!state.uncertain)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[state.mode,state.pending,state.uncertain]);
  const parsed=orderDraftValidation(state.draft),locked=busy||state.uncertain;
  const compactSuccess=!state.errorAt&&["Order created.","Clothing item saved.","Saved order confirmed."].includes(state.message);
  async function copyOrderId(){
    if(!order)return;
    try{await navigator.clipboard.writeText(order.id);setCopyFeedback({id:order.id,message:"Order identifier copied."});}
    catch{setCopyFeedback({id:order.id,message:"Copy unavailable. Open Full Order identifier to select and copy it."});}
  }
  return <section className={`${styles.businessSetup} ${styles.orders}`} aria-label="Order management" aria-busy={state.pending!==null}>
    {state.status==="unauthenticated"?<p role="status">Your session has expired. <a href="/auth?login">Sign in again</a>.</p>:
     state.status==="business_required"?<p role="status">{state.message}</p>:
     state.status==="forbidden"?<div className={styles.clientFeedback}><p role="status">{state.message}</p><button type="button" disabled={busy} onClick={()=>{void controller.retry();}}>Retry loading orders</button></div>:
     state.status==="idle"?<p role="status">Loading orders...</p>:<>
       {state.message&&!state.edit&&<div className={compactSuccess?styles.orderSuccess:styles.clientFeedback}><p role="status" aria-live="polite">{state.message}</p>{state.errorAt&&<button type="button" disabled={busy||state.uncertain} onClick={()=>{void controller.retry();}}>{state.errorAt==="get"?"Retry loading order":"Retry loading orders"}</button>}</div>}
       {state.mode==="create"?<section className={styles.panel} aria-labelledby="order-create-heading">
         <h2 id="order-create-heading" ref={heading} tabIndex={-1}>Create Order</h2>
         {state.reserved&&!state.uncertain&&<p role="status">This form uses your original reserved Order reference. Cancel, navigation and refresh keep that reference for recovery.</p>}
         <form noValidate onSubmit={event=>{event.preventDefault();if(!disabled)void controller.save();}}>
           <div className={styles.clientField}><label htmlFor="order-client">Client</label>
             <select id="order-client" required value={state.draft.clientId} disabled={locked} aria-describedby={state.choiceFailure?"order-client-error":undefined} onChange={event=>{void controller.chooseClient(event.currentTarget.value);}}>
               <option value="">Select an existing client</option>{state.draft.clientId&&!state.choices.some(client=>client.id===state.draft.clientId)&&<option value={state.draft.clientId}>Selection unavailable - choose again</option>}{state.choices.map(client=><option key={client.id} value={client.id}>{client.fullName} · {client.email??client.phone??client.id.slice(0,8)}</option>)}
             </select>
             {!state.uncertain&&state.choiceCursor&&!state.choiceFailure&&<div className={styles.orderPickerActions}><button type="button" disabled={busy} onClick={()=>{void controller.loadChoices(true);}}>Load more clients</button></div>}
             {state.pending==="choices"&&<p role="status">Loading clients...</p>}
             {state.choiceFailure&&<div className={styles.orderPickerActions}><p id="order-client-error" role="status">{state.choiceFailure.message}</p>
               {!state.uncertain&&<button type="button" disabled={busy} aria-label="Try loading clients again" onClick={()=>{void controller.loadChoices(state.choiceFailure!.more);}}>Try again</button>}</div>}
             {state.choicesLoaded&&state.choices.length===0&&!state.choiceFailure&&<p>No clients yet. Add a client from Clients before creating an order.</p>}
           </div>
           <div className={styles.orderItems}>{state.draft.items.map((item,index)=>{
             const issue=!parsed.success&&state.touched.includes(item.id)?parsed.error.issues.find(issue=>issue.path[0]==="items"&&issue.path[1]===index&&issue.path[2]==="description"):undefined;
             const fieldId=`order-item-${item.id}`;
             return <fieldset className={styles.orderDraftItem} key={item.id}><legend>Clothing item {index+1}</legend>
               <div className={styles.clientField}><label htmlFor={fieldId}>Description</label><textarea id={fieldId} required value={item.description} disabled={locked} rows={3}
                 aria-invalid={issue?true:undefined} aria-describedby={issue?fieldId+"-error":undefined} onChange={event=>controller.setDescription(item.id,event.currentTarget.value)}/>
                 {issue&&<p id={fieldId+"-error"} className={styles.businessError}>{issue.message}</p>}</div>
               <div className={styles.clientField}><label htmlFor={fieldId+"-version"}>Saved measurements (optional)</label>
                 <select id={fieldId+"-version"} value={item.measurementVersionId??""} disabled={locked||!state.draft.clientId} aria-describedby={state.versionFailure?fieldId+"-version-error":undefined} onChange={event=>controller.setMeasurement(item.id,event.currentTarget.value)}>
                   <option value="">No measurements selected</option>
                   {item.measurementVersionId&&!state.versions.some(v=>v.id===item.measurementVersionId)&&<option value={item.measurementVersionId}>Selection unavailable - choose again</option>}
                   {state.versions.map(v=><option key={v.id} value={v.id}>Version {v.versionNumber} · {v.unit} · {recorded.format(new Date(v.recordedAt))}</option>)}
                 </select>
                 {state.pending==="versions"&&index===0&&<p role="status">Loading saved measurements...</p>}
                 {state.draft.clientId&&state.versionFailure&&<div className={styles.orderPickerActions}><p id={fieldId+"-version-error"} role={index===0?"status":undefined}>{state.versionFailure.message}</p>
                   {!state.uncertain&&<button type="button" disabled={busy} aria-label={`Try loading saved measurements again for clothing item ${index+1}`} onClick={()=>{void controller.loadVersions(state.versionFailure!.more);}}>Try again</button>}</div>}
                 {state.draft.clientId&&state.versionsLoaded&&state.versions.length===0&&!state.versionFailure&&<p>No saved measurements for this client.</p>}
                 {!state.uncertain&&state.versionCursor&&!state.versionFailure&&<div className={styles.orderPickerActions}><button type="button" disabled={busy} onClick={()=>{void controller.loadVersions(true);}}>Load more measurements</button></div>}
               </div>
               {state.draft.items.length>1&&<button type="button" disabled={locked} aria-label={`Remove clothing item ${index+1}`} onClick={()=>controller.removeItem(item.id)}>Remove</button>}
             </fieldset>;
           })}</div>
           {!state.uncertain&&<><button type="button" className={styles.addOrderItem} disabled={busy||state.draft.items.length>=50} aria-describedby={state.draft.items.length>=50?"order-item-limit":undefined} onClick={()=>controller.addItem()}>Add clothing item</button>
             {state.draft.items.length>=50&&<p id="order-item-limit" className={styles.businessHint} role="status">Maximum of 50 clothing items reached.</p>}
             <div className={styles.businessActions}><button type="submit" disabled={disabled||!controller.canSave()}>{state.pending==="save"?"Creating...":"Create Order"}</button>
               <button type="button" disabled={busy} onClick={()=>controller.cancelCreate()}>Cancel</button></div></>}
         </form>
         {state.uncertain&&<div className={styles.clientFeedback}><p>Check the original save before starting another order.</p>
           <div className={styles.businessActions}><button type="button" disabled={busy} onClick={()=>{void controller.checkSaved();}}>{state.pending==="reconcile"?"Checking...":"Check saved order"}</button>
             {state.submitted&&<button type="button" disabled={busy} onClick={()=>{void controller.retryCreate();}}>{state.pending==="save"?"Creating...":"Retry same request"}</button>}
             {state.rebuildAvailable&&!state.submitted&&<button type="button" disabled={busy} onClick={()=>{void controller.rebuild();}}>Rebuild using original reference</button>}
             {state.reviewAvailable&&<button type="button" disabled={busy} onClick={()=>{void controller.reviewSaved();}}>Review saved Order</button>}</div>
         </div>}
       </section>:state.mode==="details"?<>
         <div className={styles.businessActions}><button type="button" disabled={disabled||!!state.edit} onClick={()=>controller.back()}>Back to Orders</button></div>
         {state.pending==="get"&&<p role="status">Loading order details...</p>}
         {order&&<section className={`${styles.panel} ${styles.orderDetails}`} aria-labelledby="order-details-heading">
           <header className={styles.orderDetailsHeader}>
             <div><h2 id="order-details-heading" ref={heading} tabIndex={-1}>Order details</h2><p className={styles.orderMeta}>Created <Timestamp value={order.createdAt}/></p></div>
             <div className={styles.orderReference}><span>Order {order.id.slice(0,8)}</span><button type="button" aria-label="Copy complete Order identifier" onClick={()=>{void copyOrderId();}}>Copy ID</button></div>
           </header>
           <details className={styles.orderIdentifier}><summary>Full Order identifier</summary><code>{order.id}</code></details>
           {copyFeedback?.id===order.id&&<p className={styles.orderMeta} role="status">{copyFeedback.message}</p>}
           <section className={styles.orderClient} aria-labelledby="order-client-heading"><h3 id="order-client-heading">Client</h3>
             {state.pending==="client"&&<p role="status">Loading client details...</p>}
             {state.client?<><p className={styles.orderClientName}>{state.client.fullName}</p>
               {(state.client.phone||state.client.email)&&<dl className={styles.orderContacts}>{state.client.phone&&<div><dt>Phone number</dt><dd>{state.client.phone}</dd></div>}{state.client.email&&<div><dt>Email address</dt><dd>{state.client.email}</dd></div>}</dl>}</>:
               <dl><div><dt>Client reference</dt><dd>{order.clientId}</dd></div></dl>}
             {state.clientMessage&&<div className={styles.clientFeedback}><p role="status">{state.clientMessage}</p><button type="button" disabled={busy} onClick={()=>{void controller.retryClient();}}>Retry client details</button></div>}
           </section>
           <section aria-labelledby="order-clothes-heading"><h3 id="order-clothes-heading">Clothing items ({order.items.length})</h3>
             <ol className={styles.orderItems}>{order.items.map((item,index)=>{
               const edit=state.edit?.original.id===item.id?state.edit:null,validation=edit?orderItemDescriptionValidation(edit.description):null;
               const invalid=edit?.touched&&validation&&!validation.success?validation.error.issues[0]:undefined,fieldId=`order-edit-description-${item.id}`,editLocked=busy||!!edit?.reason;
               const measurement=state.versions.find(v=>v.id===item.measurementVersionId&&v.clientId===order.clientId);
               return <li key={item.id}>
                 <div className={styles.orderItemHeading}><h4>Clothing item {index+1}</h4>
                   {!edit&&<button id={`order-edit-${item.id}`} type="button" disabled={busy||!!state.edit} aria-label={`Edit clothing item ${index+1}`} onClick={()=>{void controller.beginEdit(item.id);}}>Edit</button>}
                 </div>
                 {edit?<form noValidate aria-label={`Edit clothing item ${index+1}`} onSubmit={event=>{event.preventDefault();if(!disabled)void controller.saveEdit();}}>
                   <div className={styles.clientField}><label htmlFor={fieldId}>Description</label><textarea id={fieldId} ref={editInput} value={edit.description} required rows={3} disabled={editLocked}
                     aria-invalid={invalid?true:undefined} aria-describedby={invalid?fieldId+"-error":undefined} onChange={event=>controller.setEditDescription(event.currentTarget.value)}/>
                     {invalid&&<p id={fieldId+"-error"} className={styles.businessError}>{invalid.message}</p>}</div>
                   <div className={styles.clientField}><label htmlFor={fieldId+"-version"}>Saved measurements (optional)</label>
                     <select id={fieldId+"-version"} value={edit.measurementVersionId??""} disabled={editLocked} aria-describedby={state.versionFailure?fieldId+"-version-error":undefined} onChange={event=>controller.setEditMeasurement(event.currentTarget.value)}>
                       <option value="">No measurements selected</option>
                       {edit.original.measurementVersionId&&!state.versions.some(v=>v.id===edit.original.measurementVersionId)&&<option value={edit.original.measurementVersionId}>Current saved selection</option>}
                       {state.versions.map(v=><option key={v.id} value={v.id}>Version {v.versionNumber} - {v.unit} - {recorded.format(new Date(v.recordedAt))}</option>)}
                     </select>
                     {state.pending==="versions"&&<p role="status">Loading saved measurements...</p>}
                     {state.versionFailure&&<div className={styles.orderPickerActions}><p id={fieldId+"-version-error"} role="status">{state.versionFailure.message}</p>
                       <button type="button" disabled={editLocked} onClick={()=>{void controller.loadVersions(state.versionFailure!.more);}}>Try again</button></div>}
                     {state.versionsLoaded&&state.versions.length===0&&!state.versionFailure&&!edit.original.measurementVersionId&&<p>No saved measurements for this client.</p>}
                     {state.versionCursor&&!state.versionFailure&&<div className={styles.orderPickerActions}><button type="button" disabled={editLocked} onClick={()=>{void controller.loadVersions(true);}}>Load more measurements</button></div>}
                   </div>
                   {state.message&&<p role="status" aria-live="polite">{state.message}</p>}
                   {edit.reason&&<button type="button" disabled={busy} onClick={()=>{void controller.checkEditedItem();}}>{state.pending==="edit_check"?"Checking...":"Check saved item"}</button>}
                   <div className={styles.businessActions}><button type="submit" disabled={disabled||!controller.canSaveEdit()}>{state.pending==="edit_save"?"Saving...":"Save changes"}</button><button type="button" disabled={editLocked} onClick={()=>controller.cancelEdit()}>Cancel</button></div>
                 </form>:<>
                   <dl className={styles.orderItemDetails}>
                     <div><dt>Description</dt><dd className={styles.orderDescription}>{item.description}</dd></div>
                     <div><dt>Saved measurements</dt><dd>{item.measurementVersionId?measurement?`Version ${measurement.versionNumber} · ${measurement.unit}`:"Saved measurements selected":"Not selected"}</dd></div>
                   </dl>
                   {item.measurementVersionId&&<details className={styles.orderIdentifier}><summary>Measurement version identifier</summary><code>{item.measurementVersionId}</code></details>}
                   {item.updatedAt!==item.createdAt&&<p className={styles.orderMeta}>Last edited <Timestamp value={item.updatedAt}/></p>}
                 </>}
               </li>;
             })}</ol>
           </section>
         </section>}
       </>:<>
         <div className={styles.clientToolbar}><h2 ref={heading} tabIndex={-1}>Your orders</h2><button type="button" disabled={busy||state.intentBlocked||state.status!=="ready"} onClick={()=>{void controller.beginCreate();}}>Create Order</button></div>
         {state.pending==="list"&&<p role="status">Loading orders...</p>}
         {state.status==="ready"&&state.rows.length===0&&state.pending===null?<section className={styles.panel}><h3>No orders yet</h3><p>Orders saved for your business will appear here.</p></section>:
           state.rows.length>0&&<ul className={styles.clientList} aria-label="Orders">{state.rows.map(row=><li key={row.id}>
             <button type="button" disabled={busy} onClick={()=>{void controller.open(row.id);}} aria-label={`View order ${row.id}`}>
               <strong>Order {row.id.slice(0,8)}</strong><span>Client reference: {row.clientId}</span><span>Created <Timestamp value={row.createdAt}/><br/>Updated <Timestamp value={row.updatedAt}/></span>
             </button></li>)}</ul>}
         {state.cursor&&<div className={styles.businessActions}><button type="button" disabled={busy} onClick={()=>{void controller.loadMore();}}>{state.pending==="more"?"Loading more...":"Load more orders"}</button></div>}
       </>}
     </>}
  </section>;
}
