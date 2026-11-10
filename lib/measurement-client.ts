import {z} from "zod";
import {clientIdSchema} from "./client-record-contract.ts";
import {measurementPath,measurementRequestSchema,measurementSingleReplySchema,measurementListReplySchema,type MeasurementVersion} from "./measurement-contract.ts";
type RequestData=z.infer<typeof measurementRequestSchema>;
type Create=Extract<RequestData,{operation:"create"}>;
type Page=z.infer<typeof measurementListReplySchema>;
type Failure={ok:false;kind:"unauthenticated"|"business_required"|"not_found"|"conflict"|"invalid"|"limited"|"forbidden"|"unavailable";retryAfterSeconds?:number};
type Result<T>={ok:true;data:T}|Failure;
export function createMeasurementClient(origin:string,options:{fetch?:typeof fetch;currentOrigin?:()=>string|undefined}={}){
  async function request<T>(input:RequestData,schema:z.ZodType<T>):Promise<Result<T>>{
    if((options.currentOrigin?.()??globalThis.location?.origin)!==origin)return {ok:false,kind:"unavailable"};
    const parsed=measurementRequestSchema.safeParse(input);if(!parsed.success)return {ok:false,kind:"invalid"};
    const data=parsed.data;
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const response=await(options.fetch??fetch)(measurementPath,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
        headers:{"content-type":"application/json"},body:JSON.stringify(data),signal:abort.signal});
      if(response.redirected)return {ok:false,kind:"unavailable"};
      if(response.status!==200){
        let kind:Failure["kind"]=response.status===401?"unauthenticated":response.status===403?"forbidden":response.status===404?"not_found":response.status===409?"conflict":response.status===422?"invalid":response.status===429?"limited":"unavailable";
        if(response.status===409){try{if((await response.json())?.error==="business_required")kind="business_required";}catch{}}
        const seconds=Number(response.headers.get("retry-after"));return {ok:false,kind,...(kind==="limited"&&Number.isSafeInteger(seconds)&&seconds>0?{retryAfterSeconds:seconds}:{})};
      }
      if(!response.headers.get("content-type")?.startsWith("application/json"))return {ok:false,kind:"unavailable"};
      const reply=schema.safeParse(await response.json());if(!reply.success)return {ok:false,kind:"unavailable"};
      if(data.operation==="list"){
        const page=reply.data as Page,rows=page.versions;
        if(rows.length>data.limit||rows.some(v=>v.clientId!==data.clientId)||new Set(rows.map(v=>v.id)).size!==rows.length||
          rows.some((v,i)=>i>0&&v.versionNumber>=rows[i-1].versionNumber)||
          data.cursor&&rows.some(v=>v.versionNumber>=data.cursor!.versionNumber)||
          page.nextCursor&&page.nextCursor.versionNumber!==rows.at(-1)?.versionNumber)return {ok:false,kind:"unavailable"};
      }else{
        const version=(reply.data as {version:MeasurementVersion}).version;
        if(version.id!==data.id||version.clientId!==data.clientId)return {ok:false,kind:"unavailable"};
      }
      return {ok:true,data:reply.data};
    }catch{return {ok:false,kind:"unavailable"};}finally{clearTimeout(timer);}
  }
  return {
    list:(clientId:string,cursor?:NonNullable<Page["nextCursor"]>)=>request({operation:"list",clientId,limit:25,...(cursor?{cursor}:{})},measurementListReplySchema),
    get:(clientId:string,id:string)=>request({operation:"get",clientId,id},measurementSingleReplySchema),
    create:(input:Create)=>request(input,measurementSingleReplySchema),
  };
}
type Intent={read:()=>string|null;write:(id:string)=>void;clear:(id:string)=>void};
// Only a UUID is retained per authenticated account/client and browser tab. No labels,
// values, names or tokens are persisted. It is a reconciliation reference, never authority.
export function createMeasurementIntent(actorId:string,clientId:string,storage:()=>Pick<Storage,"getItem"|"setItem"|"removeItem">=()=>globalThis.sessionStorage):Intent{
  const key="stitchtrack:measurement-save:"+encodeURIComponent(actorId)+":"+clientId;
  const read=()=>{const value=storage().getItem(key);if(value===null)return null;return clientIdSchema.parse(value);};
  return {read,write(id){const prior=read();if(prior!==null&&prior!==id)throw Error("An earlier save needs checking.");storage().setItem(key,id);if(read()!==id)throw Error("Save reference unavailable.");},
    clear(id){if(read()===id)storage().removeItem(key);}};
}
type Draft={unit:"cm"|"in";entries:{key:string;name:string;value:string}[]};
const validationId="00000000-0000-4000-8000-000000000000";
export const measurementDraftValidation=(draft:Draft)=>measurementRequestSchema.safeParse({operation:"create",id:validationId,clientId:validationId,unit:draft.unit,entries:draft.entries.map(({name,value})=>({name,value}))});
const same=(a:MeasurementVersion,b:Create)=>{
  const ordered=(entries:{name:string;value:string}[])=>[...entries].sort((x,y)=>x.name<y.name?-1:x.name>y.name?1:0);
  return a.id===b.id&&a.clientId===b.clientId&&a.unit===b.unit&&JSON.stringify(ordered(a.entries))===JSON.stringify(ordered(b.entries));
};
type State={status:"idle"|"ready"|"unavailable"|"unauthenticated"|"business_required"|"not_found";rows:MeasurementVersion[];cursor:Page["nextCursor"];
  mode:"history"|"details"|"draft";selected:MeasurementVersion|null;draft:Draft;touched:string[];createId:string|null;submitted:Create|null;
  pending:"list"|"more"|"get"|"save"|"reconcile"|null;uncertain:boolean;message:string;retryUntil:number|null};
export function createMeasurementsController(client:ReturnType<typeof createMeasurementClient>,clientId:string,onUnauthenticated:()=>void,options:{newId?:()=>string;now?:()=>number;intent?:Intent}={}){
  clientId=clientIdSchema.parse(clientId);let serial=0,generation=0,loadedIntent=false;
  const entry=(name="",value="")=>({key:String(++serial),name,value});
  const initial=():State=>({status:"idle",rows:[],cursor:null,mode:"history",selected:null,draft:{unit:"cm",entries:[entry()]},touched:[],createId:null,submitted:null,pending:null,uncertain:false,message:"",retryUntil:null});
  let state=initial();const listeners=new Set<()=>void>(),now=options.now??Date.now;
  const update=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const busy=()=>state.pending!==null||state.retryUntil!==null;
  const forget=(id:string|null)=>{if(id)try{options.intent?.clear(id);}catch{/* Keep the confirmed server outcome; a retained reference will be rechecked. */}};
  const restore=()=>{
    try{const id=options.intent?.read();if(id){update({createId:id,submitted:null,uncertain:true,message:"A previous save may still be processing. Check the saved version before starting another request."});return true;}}
    catch{update({status:"unavailable",message:"Your browser could not read the previous save reference. Allow tab storage and reload before saving measurements."});return true;}
    return false;
  };
  function failure(result:Failure){
    if(result.kind==="unauthenticated"){generation++;state={...initial(),status:"unauthenticated",message:"Your session has expired. Please sign in again."};listeners.forEach(fn=>fn());onUnauthenticated();return;}
    if(result.kind==="business_required"){update({...initial(),status:"business_required",message:"Set up your business on Home before recording measurements."});return;}
    update({pending:null,...(result.kind==="limited"?{retryUntil:now()+(result.retryAfterSeconds??1)*1000}:{}),message:
      result.kind==="limited"?`Too many requests. Wait ${result.retryAfterSeconds??1} seconds before trying again.`:
      result.kind==="invalid"?"Check the measurement labels and values. Labels that differ only by case or equivalent Unicode spelling may be duplicates.":
      result.kind==="not_found"?"This client or measurement version is no longer available.":result.kind==="forbidden"?"Measurement access was refused. Check your session before trying again.":
      result.kind==="conflict"?"This request conflicts with saved measurements. Check the original save reference before continuing.":"Measurements are temporarily unavailable. Please try again."});
  }
  const accepted=(version:MeasurementVersion,message:string)=>{
    forget(state.createId);const rows=[version,...state.rows.filter(v=>v.id!==version.id)].sort((a,b)=>b.versionNumber-a.versionNumber);
    update({status:"ready",rows,mode:"details",selected:version,pending:null,uncertain:false,createId:null,submitted:null,message});return true;
  };
  async function load(more=false){
    if(busy()||more&&!state.cursor)return false;
    if(!loadedIntent){loadedIntent=true;if(restore()&&state.status==="unavailable")return false;}
    const token=generation;update({pending:more?"more":"list",...(state.uncertain?{}:{message:""})});
    const result=await client.list(clientId,more?state.cursor??undefined:undefined);if(token!==generation)return false;
    if(!result.ok){failure(result);if(!["unauthenticated","business_required"].includes(result.kind))update({status:result.kind==="not_found"?"not_found":"unavailable"});return false;}
    const rows=more?[...state.rows,...result.data.versions]:result.data.versions;
    update({status:"ready",rows:rows.filter((v,i)=>rows.findIndex(r=>r.id===v.id)===i),cursor:result.data.nextCursor,pending:null});return true;
  }
  return {
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},getSnapshot:()=>state,getServerSnapshot:()=>state,
    load,loadMore:()=>load(true),resume(){if(state.retryUntil!==null&&now()>=state.retryUntil)update({retryUntil:null});},
    canSave(){return state.mode==="draft"&&state.status==="ready"&&!busy()&&!state.uncertain&&measurementDraftValidation(state.draft).success;},
    begin(copy=false){
      if(busy()||state.uncertain||state.status!=="ready"||copy&&!state.selected)return;
      if(restore())return;
      const source=copy?state.selected:null;
      update({mode:"draft",draft:{unit:source?.unit??"cm",entries:source?source.entries.map(e=>entry(e.name,e.value)):[entry()]},touched:[],createId:null,submitted:null,message:""});
    },
    setUnit(unit:string){if(!busy()&&!state.uncertain&&(unit==="cm"||unit==="in"))update({draft:{...state.draft,unit},message:""});},
    setField(key:string,field:"name"|"value",value:string){if(!busy()&&!state.uncertain)update({draft:{...state.draft,entries:state.draft.entries.map(e=>e.key===key?{...e,[field]:value}:e)},touched:[...new Set([...state.touched,key+":"+field])],message:""});},
    addRow(){if(!busy()&&!state.uncertain&&state.draft.entries.length<50)update({draft:{...state.draft,entries:[...state.draft.entries,entry()]}});},
    removeRow(key:string){if(!busy()&&!state.uncertain&&state.draft.entries.length>1)update({draft:{...state.draft,entries:state.draft.entries.filter(e=>e.key!==key)}});},
    cancel(){if(!busy()&&!state.uncertain){forget(state.createId);update({mode:state.selected?"details":"history",createId:null,submitted:null,message:""});}},
    back(){if(!busy()&&!state.uncertain)update({mode:"history",selected:null,message:""});},
    async open(id:string){
      if(busy()||state.uncertain)return false;const token=generation;update({pending:"get",message:""});
      const result=await client.get(clientId,id);if(token!==generation)return false;if(!result.ok){failure(result);return false;}
      update({status:"ready",selected:result.data.version,mode:"details",pending:null});return true;
    },
    async save(){if(!this.canSave())return false;return this.submit(false);},
    async retry(){if(!state.uncertain||!state.submitted||busy())return false;return this.submit(true);},
    async submit(retry:boolean){
      if(busy()||retry&&(!state.uncertain||!state.submitted)||!retry&&!this.canSave())return false;
      const parsed=measurementDraftValidation(state.draft);if(!retry&&!parsed.success)return false;
      const id=state.createId??(options.newId??(()=>crypto.randomUUID()))();
      const submitted=retry?state.submitted:parsed.success?{...parsed.data,id,clientId} as Create:null;if(!submitted||submitted.operation!=="create")return false;
      try{options.intent?.write(id);}catch{update({message:"Your browser could not keep the save reference. Allow tab storage and try again; no save request was sent."});return false;}
      const token=generation;update({pending:"save",createId:id,submitted,message:""});
      const result=await client.create(submitted);if(token!==generation)return false;
      if(result.ok&&same(result.data.version,submitted))return accepted(result.data.version,`Measurement version ${result.data.version.versionNumber} saved.`);
      if(!result.ok&&["unauthenticated","business_required","invalid","limited","forbidden","not_found"].includes(result.kind)){if(!retry)forget(id);failure(result);return false;}
      update({pending:null,uncertain:true,message:!result.ok&&result.kind==="conflict"?"This request conflicts with saved measurements. Check the saved version before continuing.":
        "The save could not be confirmed. Check the saved version or retry the same request. Keep this page open until the outcome is resolved."});return false;
    },
    async checkSaved(){
      if(!state.uncertain||busy()||!state.createId)return false;const token=generation;update({pending:"reconcile"});
      const result=await client.get(clientId,state.createId);if(token!==generation)return false;
      if(result.ok){if(!state.submitted||same(result.data.version,state.submitted))return accepted(result.data.version,"Your saved measurement version has been confirmed.");
        update({pending:null,message:"This save reference contains different measurements. Your draft has not been replaced; check the saved version before continuing."});return false;}
      if(result.kind==="not_found"){update({pending:null,message:state.submitted?"No saved version was found by this check. This does not confirm that the earlier save failed. Check again or retry the same request.":"No saved version was found by this check. This does not confirm that the earlier save failed. Keep this save reference and check again before starting another version."});return false;}
      failure(result);return false;
    },
  };
}
export type MeasurementsController=ReturnType<typeof createMeasurementsController>;
