"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {useStore} from "zustand";
import Link from "next/link";
import type {FormEvent} from "react";
import {type AuthFlowStore} from "../../../lib/auth/auth-flow-store.ts";
import {createPasswordResetClient,type ResetResult} from "../../../lib/auth/password-reset-client.ts";
import {emailSchema,signupPasswordSchema,PASSWORD_GUIDANCE} from "../../../lib/auth/schemas.ts";
import FormField from "./FormField";
import EmailCodeField from "./EmailCodeField";
import {codeFormatError} from "../../../lib/auth/email-code.ts";
import styles from "../auth.module.css";
export default function PasswordResetForm({store,origin}:{store:AuthFlowStore;origin:string}){
 const state=useStore(store),client=useMemo(()=>createPasswordResetClient(origin),[origin]);
 const [ready,setReady]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState<string>();
 const [password,setPassword]=useState(""),[visible,setVisible]=useState(false),[done,setDone]=useState(false),[waitUntil,setWaitUntil]=useState(0),[time,setTime]=useState(Date.now),[resendUntil,setResendUntil]=useState(0);
 const [codeValid,setCodeValid]=useState(false);
 const code=useRef<HTMLInputElement>(null),heldCode=useRef(""),busy=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{setReady(true);return()=>{heldCode.current="";store.getState().step("request");};},[]);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[state.resetStep,done]);
 useEffect(()=>{if(!waitUntil&&!resendUntil)return;const timer=setInterval(()=>{const now=Date.now();setTime(now);if(now>=waitUntil)setWaitUntil(0);if(now>=resendUntil)setResendUntil(0);},1000);return()=>clearInterval(timer);},[waitUntil,resendUntil]);
 function back(){heldCode.current="";setCodeValid(false);setPassword("");setVisible(false);setError(undefined);setMessage("");state.step("request");}
 function failure(result:Extract<ResetResult,{ok:false}>){
  if(result.kind==="rate_limited"&&result.retryAfter){setWaitUntil(Date.now()+result.retryAfter*1000);setTime(Date.now());}
  setMessage(result.kind==="rate_limited"?"Too many attempts. Wait before trying again.":result.kind==="invalid_code"?"The code is invalid or expired. Request another code if needed.":
   result.kind==="password_rejected"?"Choose a password that has not appeared in known data breaches.":result.kind==="validation"?"Check your details and the password requirements.":"This request could not be confirmed. If you submitted a new password, try logging in with it before requesting another code.");
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(!ready||busy.current||waitUntil>Date.now()||state.resetStep==="request"&&resendUntil>Date.now())return;
  const step=state.resetStep;
  if(step==="request"){const parsed=emailSchema.safeParse(state.email);if(!parsed.success){setError(parsed.error.issues[0]?.message);return;}}
  if(step==="code"&&codeFormatError(code.current?.value??"")){setError("Enter the six-digit code.");code.current?.focus();return;}
  if(step==="password"){const parsed=signupPasswordSchema.safeParse(password);if(!parsed.success){setError(parsed.error.issues[0]?.message);return;}}
  setError(undefined);setMessage("Working...");busy.current=true;setPending(true);
  try{
   const otp=step==="code"?code.current!.value:heldCode.current;
   const result=await client.send(step==="request"?"request":step==="code"?"check":"complete",{email:state.email,...(step!=="request"?{otp}:{}),...(step==="password"?{password}:{})});
   if(!result.ok){failure(result);if(step==="password"&&result.kind!=="rate_limited"){heldCode.current="";setCodeValid(false);state.step("code");}return;}
   if(step==="request"){setCodeValid(false);state.step("code");setResendUntil(Date.now()+60000);setTime(Date.now());setMessage("If this account is eligible, a code will be emailed. Enter it below.");}
   else if(step==="code"){setCodeValid(false);heldCode.current=otp;state.step("password");setMessage("Choose a new password. The code must still be valid when you submit it.");}
   else{heldCode.current="";state.clear();setDone(true);setMessage("Password reset. All sessions were revoked. Log in again.");}
  }finally{if(step==="password"){setPassword("");setVisible(false);}busy.current=false;setPending(false);}
 }
 if(done)return <section aria-label="Password reset complete"><h1 ref={heading} tabIndex={-1} className={styles.title}>Password reset</h1><p role="status">{message}</p><Link href="/auth?login" prefetch={false}>Log in</Link></section>;
 return <form noValidate onSubmit={submit} aria-busy={pending||undefined} aria-describedby="reset-status">
  <h1 ref={heading} tabIndex={-1} className={styles.title}>{state.resetStep==="request"?"Reset your password":state.resetStep==="code"?"Enter your reset code":"Choose a new password"}</h1>
  <fieldset disabled={!ready||pending} className={styles.fields}><legend className={styles.visuallyHidden}>Password reset</legend>
   {state.resetStep==="request"?<FormField id="reset-email" name="email" label="Email address" type="email" autoComplete="email" value={state.email}
    onChange={e=>{state.rememberEmail(e.currentTarget.value);setError(undefined);}} onBlur={()=>{}} error={error}/>:<p>Use the reset code sent to your entered email. <button type="button" onClick={back}>Edit email or request another code</button></p>}
   {state.resetStep==="code"&&<EmailCodeField id="reset-code" label="Password reset code" hint="Enter the six-digit code from your password-reset email." inputRef={code} error={error} onChange={e=>{setCodeValid(!codeFormatError(e.currentTarget.value));setError(undefined);}} onBlur={()=>{}}/>}
   {state.resetStep==="password"&&<FormField id="reset-password" name="password" label="New password" type="password" autoComplete="new-password" value={password} hint={PASSWORD_GUIDANCE} error={error}
    onChange={e=>{setPassword(e.currentTarget.value);setError(undefined);}} onBlur={()=>{}} passwordVisible={visible} onTogglePassword={()=>setVisible(v=>!v)}/>}
   <button type="submit" className={styles.submit} disabled={!ready||pending||state.resetStep==="code"&&!codeValid||waitUntil>time||state.resetStep==="request"&&(!emailSchema.safeParse(state.email).success||resendUntil>time)}>{pending?"Working...":state.resetStep==="request"?"Send reset code":state.resetStep==="code"?"Check code":"Reset password"}</button>
  </fieldset><p id="reset-status" role="status" aria-live="polite" aria-atomic="true">{message}{waitUntil>time&&` Wait ${Math.ceil((waitUntil-time)/1000)} seconds before retrying.`}{state.resetStep==="request"&&resendUntil>time&&` Wait ${Math.ceil((resendUntil-time)/1000)} seconds before another code request.`}</p><Link href="/auth?login" prefetch={false}>Back to login</Link>
 </form>;
}
