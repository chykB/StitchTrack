import {z} from "zod";
import {clientRecordPath,clientRequestSchema,clientSingleReplySchema,clientListReplySchema,clientFullNameSchema,clientPhoneSchema,clientEmailSchema,
  type ClientRequest,type ClientRecord} from "./client-record-contract.ts";
type Failure={ok:false;kind:"unauthenticated"|"business_required"|"not_found"|"conflict"|"invalid"|"limited"|"unavailable";retryAfterSeconds?:number};
type Result<T>={ok:true;data:T}|Failure;
type Page=z.infer<typeof clientListReplySchema>;
export function createClientRecordClient(origin:string,options:{fetch?:typeof fetch;currentOrigin?:()=>string|undefined}={}){
  async function request<T>(input:ClientRequest,schema:z.ZodType<T>):Promise<Result<T>>{
    if((options.currentOrigin?.()??globalThis.location?.origin)!==origin)return {ok:false,kind:"unavailable"};
    const parsed=clientRequestSchema.safeParse(input);if(!parsed.success)return {ok:false,kind:"invalid"};
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const response=await(options.fetch??fetch)(clientRecordPath,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
        headers:{"content-type":"application/json"},body:JSON.stringify(parsed.data),signal:abort.signal});
      if(response.redirected)return {ok:false,kind:"unavailable"};
      if(response.status!==200){
        let kind:Failure["kind"]=response.status===401?"unauthenticated":response.status===404?"not_found":response.status===409?"conflict":response.status===422?"invalid":response.status===429?"limited":"unavailable";
        if(response.status===409){try{if((await response.json())?.error==="business_required")kind="business_required";}catch{}}
        const seconds=Number(response.headers.get("retry-after"));
        return {ok:false,kind,...(kind==="limited"&&Number.isSafeInteger(seconds)&&seconds>0?{retryAfterSeconds:seconds}:{})};
      }
      if(!response.headers.get("content-type")?.startsWith("application/json"))return {ok:false,kind:"unavailable"};
      const reply=schema.safeParse(await response.json());if(!reply.success)return {ok:false,kind:"unavailable"};
      if(parsed.data.operation!=="list"&&(!("client" in (reply.data as object))||(reply.data as {client:ClientRecord}).client.id!==parsed.data.id))return {ok:false,kind:"unavailable"};
      return {ok:true,data:reply.data};
    }catch{return {ok:false,kind:"unavailable"};}finally{clearTimeout(timer);}
  }
  return {
    list:(cursor?:NonNullable<Page["nextCursor"]>)=>request({operation:"list",limit:25,...(cursor?{cursor}:{})},clientListReplySchema),
    get:(id:string)=>request({operation:"get",id},clientSingleReplySchema),
    create:(input:Extract<ClientRequest,{operation:"create"}>)=>request(input,clientSingleReplySchema),
    update:(input:Extract<ClientRequest,{operation:"update"}>)=>request(input,clientSingleReplySchema),
  };
}
const fieldsSchema=z.strictObject({fullName:clientFullNameSchema,phone:clientPhoneSchema,email:clientEmailSchema});
type Fields=z.infer<typeof fieldsSchema>;
type Draft={fullName:string;phone:string;email:string};
const emptyDraft=():Draft=>({fullName:"",phone:"",email:""});
const draftOf=(client:ClientRecord):Draft=>({fullName:client.fullName,phone:client.phone??"",email:client.email??""});
const equal=(a:Fields,b:Fields)=>a.fullName===b.fullName&&a.phone===b.phone&&a.email===b.email;
export function clientDraftValidation(draft:Draft){return fieldsSchema.safeParse(draft);}
type State={status:"idle"|"ready"|"unavailable"|"unauthenticated"|"business_required";rows:ClientRecord[];cursor:Page["nextCursor"];
  mode:"list"|"add"|"details"|"edit";selected:ClientRecord|null;draft:Draft;createId:string|null;submitted:Fields|null;
  pending:"list"|"more"|"get"|"save"|"reconcile"|null;uncertain:boolean;message:string;retryUntil:number|null};
export function createClientRecordsController(client:ReturnType<typeof createClientRecordClient>,onUnauthenticated:()=>void,options:{newId?:()=>string;now?:()=>number}={}){
  const initial=():State=>({status:"idle",rows:[],cursor:null,mode:"list",selected:null,draft:emptyDraft(),createId:null,submitted:null,pending:null,uncertain:false,message:"",retryUntil:null});
  let state=initial(),generation=0;const listeners=new Set<()=>void>(),now=options.now??Date.now;
  const update=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const busy=()=>state.pending!==null||state.retryUntil!==null;
  function failure(result:Failure){
    if(result.kind==="unauthenticated"){generation++;state={...initial(),status:"unauthenticated",message:"Your session has expired. Please sign in again."};listeners.forEach(fn=>fn());onUnauthenticated();return;}
    if(result.kind==="business_required"){update({...initial(),status:"business_required",message:"Set up your business on Home before adding clients."});return;}
    update({pending:null,...(result.kind==="limited"?{retryUntil:now()+(result.retryAfterSeconds??1)*1000}:{}),message:
      result.kind==="limited"?`Too many requests. Wait ${result.retryAfterSeconds??1} seconds before trying again.`:
      result.kind==="invalid"?"Check the client details and try again.":result.kind==="not_found"?"This client could not be found. Refresh the list and try again.":
      result.kind==="conflict"?"This request conflicts with saved client details. Check the saved record before continuing.":"Client information is temporarily unavailable. Please try again."});
  }
  async function load(more=false,keepMessage=false){
    if(busy()||more&&!state.cursor)return false;
    const token=generation;update({pending:more?"more":"list",...(keepMessage?{}:{message:""})});
    const result=await client.list(more?state.cursor??undefined:undefined);if(token!==generation)return false;
    if(!result.ok){failure(result);if(!["unauthenticated","business_required"].includes(result.kind))update({status:"unavailable"});return false;}
    const rows=more?[...state.rows,...result.data.clients]:result.data.clients;
    update({status:"ready",rows:rows.filter((row,index)=>rows.findIndex(other=>other.id===row.id)===index),cursor:result.data.nextCursor,pending:null});return true;
  }
  async function accepted(saved:ClientRecord,message:string,created:boolean){
    update({selected:saved,mode:"details",draft:draftOf(saved),createId:null,submitted:null,uncertain:false,pending:null,message,
      rows:state.rows.map(row=>row.id===saved.id?saved:row)});
    if(created)await load(false,true);
    return true;
  }
  return {
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},getSnapshot:()=>state,getServerSnapshot:()=>state,
    load,loadMore:()=>load(true),
    resume(){if(state.retryUntil!==null&&now()>=state.retryUntil)update({retryUntil:null});},
    canSave(){const parsed=clientDraftValidation(state.draft);return !busy()&&!state.uncertain&&state.status==="ready"&&parsed.success&&
      (state.mode==="add"||state.mode==="edit"&&!!state.selected&&!equal(parsed.data,state.selected));},
    beginAdd(){if(busy()||state.uncertain||state.status!=="ready")return;update({mode:"add",selected:null,draft:emptyDraft(),createId:state.createId??(options.newId??(()=>crypto.randomUUID()))(),submitted:null,message:""});},
    setField(field:keyof Draft,value:string){if(!busy()&&!state.uncertain)update({draft:{...state.draft,[field]:value},message:""});},
    edit(){if(!busy()&&state.selected&&!state.uncertain)update({mode:"edit",draft:draftOf(state.selected),message:""});},
    cancel(){if(!busy()&&!state.uncertain)update({mode:state.selected?"details":"list",createId:null,submitted:null,message:""});},
    back(){if(!busy()&&!state.uncertain)update({mode:"list",selected:null,createId:null,submitted:null,message:""});},
    async select(id:string){
      if(busy()||state.uncertain)return false;const token=generation;update({pending:"get",message:""});
      const result=await client.get(id);if(token!==generation)return false;
      if(!result.ok){failure(result);return false;}update({selected:result.data.client,mode:"details",draft:draftOf(result.data.client),pending:null});return true;
    },
    async save(){
      if(!this.canSave())return false;return this.submit(false);
    },
    async retry(){if(!state.uncertain||busy())return false;return this.submit(true);},
    async submit(retry:boolean){
      if(busy()||!retry&&!this.canSave()||retry&&!state.uncertain)return false;
      const parsed=clientDraftValidation(state.draft);if(!parsed.success)return false;
      const submitted=retry?state.submitted:parsed.data;if(!submitted)return false;
      const created=state.mode==="add",id=created?state.createId:state.selected?.id;if(!id)return false;
      const token=generation;update({pending:"save",submitted,message:""});
      const result=await(created?client.create({operation:"create",id,...submitted}):client.update({operation:"update",id,...submitted}));
      if(token!==generation)return false;
      if(result.ok&&equal(result.data.client,submitted))return accepted(result.data.client,"Client details saved.",created);
      if(!result.ok&&["unauthenticated","business_required","invalid","limited"].includes(result.kind)){failure(result);return false;}
      update({pending:null,uncertain:true,message:!result.ok&&result.kind==="conflict"
        ?"This request conflicts with saved client details. Check the saved client before retrying the same request."
        :"The save could not be confirmed. Check the saved client or retry the same request. Keep this page open until the outcome is resolved."});return false;
    },
    async checkSaved(){
      if(!state.uncertain||busy())return false;
      const created=state.mode==="add",id=created?state.createId:state.selected?.id;if(!id)return false;
      const token=generation;update({pending:"reconcile"});const result=await client.get(id);if(token!==generation)return false;
      if(result.ok){
        if(state.submitted&&equal(result.data.client,state.submitted))return accepted(result.data.client,"Your saved client details have been confirmed.",created);
        if(!created){update({selected:result.data.client,draft:draftOf(result.data.client),uncertain:false,submitted:null,pending:null,message:"Current saved details are shown. Review them before making another change."});return false;}
        update({pending:null,message:"This request has different saved details. The original request remains unchanged; please check again before continuing."});return false;
      }
      if(result.kind==="not_found"){update({pending:null,message:"No saved client was found by this check. This does not confirm that the earlier save failed. You can retry the same request."});return false;}
      failure(result);return false;
    },
  };
}
export type ClientRecordsController=ReturnType<typeof createClientRecordsController>;
