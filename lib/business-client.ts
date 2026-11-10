import {businessPath,businessNameSchema,businessReadReply,businessWriteReply,businessWriteSchema,type BusinessProfile,type BusinessWrite} from "./business-contract.ts";
type Failure={ok:false;kind:"unauthenticated"|"conflict"|"invalid"|"limited"|"unavailable";retryAfterSeconds?:number};
type Result<T>={ok:true;data:T}|Failure;
export function createBusinessClient(origin:string,options:{fetch?:typeof fetch;currentOrigin?:()=>string|undefined}={}){
  async function request(write?:BusinessWrite):Promise<Result<BusinessProfile|null>>{
    if((options.currentOrigin?.()??globalThis.location?.origin)!==origin)return {ok:false,kind:"unavailable"};
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const response=await(options.fetch??fetch)(businessPath,{method:write?"POST":"GET",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",signal:abort.signal,
        ...(write?{headers:{"content-type":"application/json"},body:JSON.stringify(write)}:{})});
      if(response.redirected)return {ok:false,kind:"unavailable"};
      if(response.status!==200){
        const kind=response.status===401?"unauthenticated":response.status===409?"conflict":response.status===422?"invalid":response.status===429?"limited":"unavailable";
        const seconds=Number(response.headers.get("retry-after"));
        return {ok:false,kind,...(kind==="limited"&&Number.isSafeInteger(seconds)&&seconds>0?{retryAfterSeconds:seconds}:{})};
      }
      if(!response.headers.get("content-type")?.startsWith("application/json"))return {ok:false,kind:"unavailable"};
      const parsed=(write?businessWriteReply:businessReadReply).safeParse(await response.json());
      if(!parsed.success||write&&parsed.data.business?.name!==write.name)return {ok:false,kind:"unavailable"};
      return {ok:true,data:parsed.data.business};
    }catch{return {ok:false,kind:"unavailable"};}finally{clearTimeout(timer);}
  }
  return {read:()=>request(),write:(input:BusinessWrite)=>{const parsed=businessWriteSchema.safeParse(input);return parsed.success?request(parsed.data):Promise.resolve<Result<BusinessProfile|null>>({ok:false,kind:"invalid"});}};
}
export const isBusinessSuccess=(message:string)=>message==="Business details saved."||message==="Your saved business details have been confirmed.";
type Client=ReturnType<typeof createBusinessClient>;
export type BusinessState={status:"loading"|"ready"|"unavailable";business:BusinessProfile|null;draft:string;pending:"read"|"write"|null;editing:boolean;uncertain:boolean;message:string;nameError:string|null};
// Transient presentation only. Every read/write goes to the authorized server;
// no storage, inferred ownership, mutation retries or optimistic success.
export function createBusinessController(client:Client,onUnauthenticated:()=>void=()=>{}){
  let state:BusinessState={status:"loading",business:null,draft:"",pending:null,editing:false,uncertain:false,message:"",nameError:null};
  const listeners=new Set<()=>void>();
  function update(patch:Partial<BusinessState>){state={...state,...patch};for(const listener of listeners)listener();}
  function lost(){update({status:"unavailable",business:null,draft:"",pending:null,message:"Your account access needs to be checked."});onUnauthenticated();}
  async function load(conflict=false){
    if(state.pending)return false;
    const uncertain=state.uncertain,wanted=state.draft.trim();update({pending:"read"});
    const result=await client.read();
    if(!result.ok){
      if(result.kind==="unauthenticated"){lost();return false;}
      update({status:"unavailable",business:null,pending:null,message:uncertain?"The save could not be confirmed. Check your saved business before trying again.":"Business information could not be loaded. Try again."});return false;
    }
    const confirmed=uncertain&&result.data?.name===wanted;
    update({status:"ready",business:result.data,pending:null,uncertain:uncertain&&!confirmed,
      ...(uncertain&&!confirmed?{}:{draft:result.data?.name??"",editing:false,nameError:null}),
      message:confirmed?"Your saved business details have been confirmed.":conflict?"Business details changed. Review the saved information before continuing.":uncertain?"The earlier save could not be confirmed. Current saved details are shown below; review them before continuing.":""});
    return true;
  }
  return {
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},getSnapshot:()=>state,getServerSnapshot:()=>state,
    load,
    dismissSuccess(){if(!state.pending&&!state.uncertain&&isBusinessSuccess(state.message))update({message:""});},
    setName(value:string){if(!state.pending&&!state.uncertain)update({draft:value,nameError:null,message:""});},
    edit(){if(state.status==="ready"&&state.business&&!state.pending&&!state.uncertain)update({editing:true,draft:state.business.name,message:""});},
    cancel(){if(!state.pending&&!state.uncertain)update({editing:false,draft:state.business?.name??"",nameError:null,message:""});},
    useSaved(){if(state.status==="ready"&&!state.pending)update({uncertain:false,editing:!!state.business,draft:state.business?.name??state.draft,nameError:null,message:"Review the details before submitting a new request."});},
    async save(){
      if(state.status!=="ready"||state.pending||state.uncertain||state.business&&!state.editing)return false;
      const parsed=businessNameSchema.safeParse(state.draft);
      if(!parsed.success){update({nameError:"Enter a business name using 2-120 characters."});return false;}
      const prior=state.business;update({pending:"write",draft:parsed.data,nameError:null,message:""});
      const result=await client.write({operation:prior?"rename":"create",name:parsed.data});
      if(result.ok&&result.data&&result.data.name===parsed.data&&(!prior||prior.id===result.data.id)){
        update({status:"ready",business:result.data,draft:result.data.name,pending:null,editing:false,uncertain:false,message:"Business details saved."});return true;
      }
      if(!result.ok&&result.kind==="unauthenticated"){lost();return false;}
      if(!result.ok&&["invalid","limited"].includes(result.kind)){
        update({pending:null,nameError:result.kind==="invalid"?"Check your business name and try again.":null,message:result.kind==="limited"?`Too many requests. Wait ${result.retryAfterSeconds??1} seconds before trying again.`:""});return false;
      }
      // A failed response may follow a committed write. Only GET reconciliation
      // follows automatically; never issue a second POST.
      update({pending:null,uncertain:true,message:"The save could not be confirmed. Checking your saved business."});
      await load(!result.ok&&result.kind==="conflict");return false;
    },
  };
}
export type BusinessController=ReturnType<typeof createBusinessController>;
