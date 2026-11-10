import {signupAcknowledgementsSchema,developmentSignupSchema} from "./registration-contract.ts";
import {codeFormatError} from "./email-code.ts";
import type {RegistrationClient,RegistrationFailure} from "./registration-client.ts";
export type RegistrationSnapshot=Readonly<{phase:"signup"|"verification"|"verified";pending:"signup"|"verify"|"resend"|null;email:string|null;message:string;codeError:string|null;retryUntil:number|null;resendAt:number|null}>;
// In-memory presentation only. Never retains a password/OTP or creates a session.
export function createRegistrationController(client:RegistrationClient,clock:{now?:()=>number;setTimer?:typeof setTimeout;clearTimer?:typeof clearTimeout}={}) {
  const now=clock.now??Date.now,setTimer=clock.setTimer??setTimeout,clearTimer=clock.clearTimer??clearTimeout;
  const initial:RegistrationSnapshot=Object.freeze({phase:"signup",pending:null,email:null,message:"",codeError:null,retryUntil:null,resendAt:null});
  let state=initial,timer:ReturnType<typeof setTimeout>|undefined;const listeners=new Set<()=>void>();
  function schedule(){if(timer!==undefined)clearTimer(timer);timer=undefined;if(!listeners.size)return;
    const next=[state.retryUntil,state.resendAt].filter((x):x is number=>x!==null&&x>now());
    if(next.length)timer=setTimer(()=>publish({...state,retryUntil:state.retryUntil!==null&&state.retryUntil<=now()?null:state.retryUntil,resendAt:state.resendAt!==null&&state.resendAt<=now()?null:state.resendAt}),Math.min(2147483647,Math.max(1,Math.min(...next)-now())));}
  function publish(next:RegistrationSnapshot){state=Object.freeze(next);schedule();for(const f of listeners)f();}
  function blocked(){return !client.enabled||state.pending!==null||state.retryUntil!==null&&state.retryUntil>now();}
  function failure(result:RegistrationFailure,operation:"signup"|"verify"|"resend") {
    const message=result.kind==="rate_limited"?"Too many attempts. Please wait before trying again.":result.kind==="invalid_code"?"The code could not be verified. Check it or request another code.":
      result.kind==="invalid_input"?"Check the information you entered.":operation==="signup"?(state.phase==="verification"?"Signup could not be confirmed. If a code arrives, enter it below.":"Signup could not be confirmed. Please try again when the service is available."):
      operation==="verify"?"Verification could not be confirmed. Try again when the service is available.":"A new code request could not be confirmed. Check your email before trying again.";
    publish({...state,pending:null,message,codeError:operation==="verify"&&(result.kind==="invalid_code"||result.kind==="invalid_input")?message:null,retryUntil:result.kind==="rate_limited"&&result.retryAfterSeconds?now()+result.retryAfterSeconds*1000:null});
  }
  return {enabled:client.enabled,terms:client.terms,consentDeferred:client.consentDeferred,getSnapshot:()=>state,getServerSnapshot:()=>initial,
    subscribe(listener:()=>void){listeners.add(listener);schedule();return()=>{listeners.delete(listener);schedule();};},
    async signup(input:unknown) {
      if(blocked()||state.phase!=="signup")return false;
      const parsed=(client.consentDeferred?developmentSignupSchema:signupAcknowledgementsSchema).safeParse(input);if(!parsed.success){failure({ok:false,kind:"invalid_input"},"signup");return false;}
      publish({...state,pending:"signup",message:"Submitting signup..."});
      try {
        const r=await client.signup(parsed.data);
        if(!r.ok){if(r.kind==="network")publish({...state,phase:"verification",email:parsed.data.email,resendAt:now()+60000});failure(r,"signup");return false;}
        publish({...state,phase:"verification",pending:null,email:parsed.data.email,message:"If your email is eligible for registration, we'll send you a verification code. Please check your inbox or spam folder.",resendAt:now()+60000});return true;
      }catch{publish({...state,phase:"verification",email:parsed.data.email,resendAt:now()+60000});failure({ok:false,kind:"network"},"signup");return false;}
    },
    returnToSignup() {
      if(state.pending!==null)return;
      // Discard transient verification state, but preserve any active retry budget.
      publish({...initial,retryUntil:state.retryUntil});
    },
    async verify(otp:string) {
      if(blocked()||state.phase!=="verification"||!state.email)return false;
      if(codeFormatError(otp)){failure({ok:false,kind:"invalid_input"},"verify");return false;}
      publish({...state,pending:"verify",codeError:null,message:"Checking your code..."});
      try{const r=await client.verify({email:state.email,otp});if(!r.ok){failure(r,"verify");return false;}
        publish({...state,phase:"verified",pending:null,codeError:null,resendAt:null,retryUntil:null,message:"Email verified. Log in to continue."});return true;
      }catch{failure({ok:false,kind:"network"},"verify");return false;}
    },
    async resend() {
      if(blocked()||state.phase!=="verification"||!state.email||state.resendAt!==null&&state.resendAt>now())return false;
      publish({...state,pending:"resend",message:"Requesting another code..."});
      try{const r=await client.resend(state.email);if(!r.ok){failure(r,"resend");return false;}
        publish({...state,pending:null,codeError:null,resendAt:now()+60000,message:"If eligible, another code will be emailed. Use the newest code."});return true;
      }catch{failure({ok:false,kind:"network"},"resend");return false;}
    },
  };
}
export type RegistrationController=ReturnType<typeof createRegistrationController>;
