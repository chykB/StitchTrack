import type {AuthFailure,FrontendSession,SessionClient} from "./session-client.ts";
export type SessionSnapshot=Readonly<{
  status:"disabled"|"unknown"|"authenticated"|"unauthenticated";
  pending:"login"|"session"|"logout"|null;
  session:FrontendSession|null;message:string;retryUntil:number|null;
}>;
// Presentation-only session state, never authorization. Passwords/tokens are
// never included. Server checks remain mandatory for every protected action.
export function createSessionController(client:SessionClient,clock:{now?:()=>number;setTimer?:typeof setTimeout;clearTimer?:typeof clearTimeout}={}) {
  const now=clock.now??Date.now,setTimer=clock.setTimer??setTimeout,clearTimer=clock.clearTimer??clearTimeout;
  const initial:SessionSnapshot=Object.freeze({status:client.enabled?"unknown":"disabled",pending:null,session:null,message:"",retryUntil:null});
  let state=initial,timer:ReturnType<typeof setTimeout>|undefined;
  const listeners=new Set<()=>void>();
  function schedule() {
    if(timer!==undefined)clearTimer(timer);timer=undefined;
    if(!listeners.size)return;
    const deadlines=[state.session?.expiresAt,state.retryUntil].filter((x):x is number=>typeof x==="number");
    if(deadlines.length)timer=setTimer(tick,Math.min(2147483647,Math.max(1,Math.min(...deadlines)-now())));
  }
  function publish(next:SessionSnapshot){state=Object.freeze(next);schedule();for(const listener of listeners)listener();}
  function tick() {
    const expired=state.session!==null&&state.session.expiresAt<=now(),ready=state.retryUntil!==null&&state.retryUntil<=now();
    if(expired||ready)publish({...state,...(expired?{status:"unauthenticated" as const,session:null,message:"Your session has expired. Log in again."}:{}),
      ...(ready?{retryUntil:null,...(!expired&&state.message.startsWith("Too many attempts.")?{message:"You can try again."}:{})}:{})});else schedule();
  }
  function failed(failure:AuthFailure,operation:"login"|"session"|"logout") {
    const seconds=failure.retryAfterSeconds;
    const message=failure.kind==="rate_limited"?(seconds?`Too many attempts. Please wait ${seconds} seconds before trying again.`:"Too many attempts. Please wait before trying again."):
      failure.kind==="invalid_credentials"?"Email or password is incorrect.":failure.kind==="invalid_input"?"Check your email and password.":
      operation==="logout"?"Logout could not be confirmed. You may still be logged in. Check your session or try logout again.":
      operation==="session"?"Your session could not be checked. Try again.":"Login could not be confirmed. Check your session before trying again.";
    publish({...state,pending:null,status:(failure.kind==="invalid_credentials"||failure.kind==="invalid_input")&&!state.session?"unauthenticated":"unknown",message,
      retryUntil:failure.kind==="rate_limited"&&seconds?now()+seconds*1000:null});
  }
  function accept(session:FrontendSession|null,message:string) {
    if(session&&session.expiresAt<=now())session=null;
    publish({...state,pending:null,status:session?"authenticated":"unauthenticated",session,message:session?message:"You are not logged in. Log in to continue.",retryUntil:null});
  }
  function blocked(){tick();return !client.enabled||state.pending!==null||state.retryUntil!==null&&state.retryUntil>now();}
  return {
    enabled:client.enabled,
    getSnapshot:()=>state,getServerSnapshot:()=>initial,
    subscribe(listener:()=>void){listeners.add(listener);schedule();return()=>{listeners.delete(listener);schedule();};},
    async refresh() {
      if(blocked())return false;publish({...state,pending:"session",message:"Checking your session..."});
      try{const result=await client.session();if(!result.ok){failed(result,"session");return false;}accept(result.data,"You are logged in.");return true;}
      catch{failed({ok:false,kind:"network"},"session");return false;}
    },
    async login(input:unknown) {
      if(blocked()||state.status==="authenticated")return false;
      publish({...state,pending:"login",message:"Logging in..."});
      try {
        const result=await client.login(input);if(!result.ok){failed(result,"login");return false;}
        // Login JSON intentionally has no session token or expiry. Confirm the
        // browser's cookie with the existing server lookup before claiming login.
        const checked=await client.session();
        if(!checked.ok){failed(checked,"session");return false;}
        if(!checked.data||checked.data.expiresAt<=now()||checked.data.user.id!==result.data.user.id){
          publish({...state,status:"unknown",pending:null,message:"Login could not be confirmed. Check your session before trying again."});return false;
        }
        accept(checked.data,"You are logged in.");return true;
      }catch{failed({ok:false,kind:"network"},"login");return false;}
    },
    async logout() {
      if(blocked())return false;publish({...state,pending:"logout",message:"Logging out..."});
      try {
        const result=await client.logout();
        if(!result.ok){
          if(result.kind==="unauthenticated"){
            const checked=await client.session();
            if(checked.ok&&checked.data===null){accept(null,"");return true;}
          }
          failed(result,"logout");return false;
        }
        publish({...state,status:"unauthenticated",pending:null,session:null,retryUntil:null,message:"You are logged out."});return true;
      }catch{failed({ok:false,kind:"network"},"logout");return false;}
    },
  };
}
export type SessionController=ReturnType<typeof createSessionController>;
