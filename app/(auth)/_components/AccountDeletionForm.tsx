"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import type {FormEvent} from "react";
import type {SessionController} from "../../../lib/auth/session-controller.ts";
import {accountDeletionSchema} from "../../../lib/auth/account-deletion-contract.ts";
import FormField from "./FormField";
import styles from "../auth.module.css";

export async function submitAccountDeletion(event:Pick<FormEvent<HTMLFormElement>,"preventDefault"|"currentTarget">,ready:boolean,
 controller:SessionController,fieldError:(message:string|undefined)=>void):Promise<boolean>{
 event.preventDefault();const state=controller.getSnapshot();
 if(!ready||state.status!=="authenticated"||state.pending!==null)return false;
 const field=event.currentTarget.elements.namedItem("password") as HTMLInputElement|null;
 const parsed=accountDeletionSchema.safeParse({password:field?.value??""});
 if(!parsed.success){fieldError("Enter your current password.");field?.focus();return false;}
 fieldError(undefined);
 try{return await controller.requestDeletion(parsed.data);}finally{if(field)field.value="";}
}
export default function AccountDeletionForm({controller}:{controller:SessionController}){
 const snapshot=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getServerSnapshot);
 const [ready,setReady]=useState(false),[open,setOpen]=useState(false),[password,setPassword]=useState(""),[visible,setVisible]=useState(false),[error,setError]=useState<string>();
 useEffect(()=>{setReady(true);},[]);
 useEffect(()=>{setPassword("");setVisible(false);setError(undefined);setOpen(false);},[snapshot.status,snapshot.session?.user.id]);
 if(snapshot.status!=="authenticated"||!snapshot.session)return null;
 const busy=snapshot.pending!==null||snapshot.retryUntil!==null;
 return <section className={styles.deletionPanel} aria-label="Request account deletion">
  {!open?<button className={styles.secondaryButton} type="button" disabled={!ready||busy} onClick={()=>setOpen(true)}>Request account deletion</button>:
   <form noValidate aria-labelledby="deletion-heading" aria-describedby="deletion-warning deletion-irreversible deletion-timing" aria-busy={snapshot.pending==="delete-account"||undefined} onSubmit={event=>{
    void submitAccountDeletion(event,ready,controller,setError).finally(()=>{setPassword("");setVisible(false);});
   }}>
    <h2 id="deletion-heading">Delete your StitchTrack account?</h2>
    <p id="deletion-warning">Your account will be locked immediately, and you'll be signed out on every device. You won't be able to log in again.</p>
    <p id="deletion-irreversible">This request cannot be reversed in the current application.</p>
    <h3>When will my data be deleted?</h3>
    <p id="deletion-timing">Your account becomes eligible for permanent deletion after 24 hours. Automatic deletion is not yet available, so we cannot confirm a completion date.</p>
    <fieldset className={styles.fields} disabled={!ready||busy}><legend className={styles.visuallyHidden}>Confirm account deletion request</legend>
     <FormField id="delete-account-password" name="password" type="password" label="Confirm your password" autoComplete="current-password" value={password} error={error}
      onChange={event=>{setPassword(event.currentTarget.value);setError(undefined);}} onBlur={()=>{}} passwordVisible={visible} onTogglePassword={()=>setVisible(v=>!v)}/>
     <div className={styles.deletionActions}>
      <button type="submit" className={styles.submit}>{snapshot.pending==="delete-account"?"Requesting deletion...":"Confirm account deletion"}</button>
      <button type="button" className={styles.secondaryButton} onClick={()=>{setPassword("");setVisible(false);setOpen(false);setError(undefined);}}>Cancel</button>
     </div>
    </fieldset>
   </form>}
 </section>;
}
