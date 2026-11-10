import {z} from "zod";
import {orderPath,orderRequestSchema,orderCreateSchema,orderUpdateItemSchema,orderDescriptionSchema,orderSingleReplySchema,orderListReplySchema,type OrderSummary,type OrderDetails} from "./order-contract.ts";
import {clientIdSchema,type ClientRecord} from "./client-record-contract.ts";
import type {createClientRecordClient} from "./client-record-client.ts";
import type {createMeasurementClient} from "./measurement-client.ts";
import type {MeasurementVersion} from "./measurement-contract.ts";
type RequestData=Extract<z.infer<typeof orderRequestSchema>,{operation:"list"|"get"|"create"|"update_item"}>;
type Page=z.infer<typeof orderListReplySchema>;
type Create=z.infer<typeof orderCreateSchema>;
type ItemUpdate=z.infer<typeof orderUpdateItemSchema>;
type ItemEdit={original:OrderDetails["items"][number];description:string;measurementVersionId:string|null;touched:boolean;reason:"conflict"|"uncertain"|"not_found"|null};
export const orderItemDescriptionValidation=(description:string)=>orderDescriptionSchema.safeParse(description);
type Intent={read:()=>string|null;write:(id:string)=>void;clear:(id:string)=>void};
// Retain only a reconciliation UUID per account/tab, never client details or credentials.
export function createOrderIntent(userId:string,storage:()=>Pick<Storage,"getItem"|"setItem"|"removeItem">=()=>globalThis.sessionStorage):Intent{
  const key="stitchtrack:order-save:"+encodeURIComponent(userId);
  const read=()=>{const id=storage().getItem(key);return id===null?null:clientIdSchema.parse(id);};
  return {read,write(id){const prior=read();if(prior!==null&&prior!==id)throw Error("Check the previous save first.");storage().setItem(key,id);if(read()!==id)throw Error("Save reference unavailable.");},clear(id){if(read()===id)storage().removeItem(key);}};
}
type Draft={clientId:string;items:Create["items"]};
const validationId="00000000-0000-4000-8000-000000000000";
export const orderDraftValidation=(draft:Draft)=>orderCreateSchema.safeParse({operation:"create",id:validationId,...draft});
const sameOrder=(order:OrderDetails,input:Create)=>order.id===input.id&&order.clientId===input.clientId&&order.items.length===input.items.length&&input.items.every(item=>order.items.some(saved=>saved.id===item.id&&saved.description===item.description&&saved.measurementVersionId===item.measurementVersionId));
type Failure={ok:false;kind:"unauthenticated"|"business_required"|"not_found"|"conflict"|"invalid"|"limited"|"forbidden"|"unavailable";retryAfterSeconds?:number};
type Result<T>={ok:true;data:T}|Failure;
export function createOrderClient(origin:string,options:{fetch?:typeof fetch;currentOrigin?:()=>string|undefined}={}){
  async function request<T>(input:RequestData,schema:z.ZodType<T>):Promise<Result<T>>{
    if((options.currentOrigin?.()??globalThis.location?.origin)!==origin)return {ok:false,kind:"unavailable"};
    const parsed=orderRequestSchema.safeParse(input);if(!parsed.success||!["list","get","create","update_item"].includes(parsed.data.operation))return {ok:false,kind:"invalid"};
    const data=parsed.data;
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const response=await(options.fetch??fetch)(orderPath,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
        headers:{"content-type":"application/json"},body:JSON.stringify(parsed.data),signal:abort.signal});
      if(response.redirected)return {ok:false,kind:"unavailable"};
      if(response.status!==200){
        let kind:Failure["kind"]=response.status===401?"unauthenticated":response.status===403?"forbidden":response.status===404?"not_found":response.status===409?"conflict":response.status===422?"invalid":response.status===429?"limited":"unavailable";
        if(response.status===409){try{if((await response.json())?.error==="business_required")kind="business_required";}catch{}}
        const seconds=Number(response.headers.get("retry-after"));return {ok:false,kind,...(kind==="limited"&&Number.isSafeInteger(seconds)&&seconds>0?{retryAfterSeconds:seconds}:{})};
      }
      if(!response.headers.get("content-type")?.startsWith("application/json"))return {ok:false,kind:"unavailable"};
      const reply=schema.safeParse(await response.json());if(!reply.success)return {ok:false,kind:"unavailable"};
      if(data.operation==="create"){
        if(!sameOrder((reply.data as {order:OrderDetails}).order,data))return {ok:false,kind:"unavailable"};
      }else if(data.operation==="update_item"){
        const order=(reply.data as {order:OrderDetails}).order,item=order.items.find(item=>item.id===data.itemId);
        if(order.id!==data.id||!item||data.description!==undefined&&item.description!==data.description||data.measurementVersionId!==undefined&&item.measurementVersionId!==data.measurementVersionId)return {ok:false,kind:"unavailable"};
      }else if(data.operation==="get"){
        if((reply.data as {order:OrderDetails}).order.id!==data.id)return {ok:false,kind:"unavailable"};
      }else if(data.operation==="list"){
        const page=reply.data as Page,rows=page.orders,older=(a:{createdAt:string;id:string},b:{createdAt:string;id:string})=>a.createdAt<b.createdAt||a.createdAt===b.createdAt&&a.id<b.id;
        if(rows.length>data.limit||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some((row,i)=>i>0&&!older(row,rows[i-1]))||
          data.cursor&&rows.some(row=>!older(row,data.cursor!))||page.nextCursor&&(!rows.length||page.nextCursor.id!==rows.at(-1)?.id||page.nextCursor.createdAt!==rows.at(-1)?.createdAt))return {ok:false,kind:"unavailable"};
      }
      return {ok:true,data:reply.data};
    }catch{return {ok:false,kind:"unavailable"};}finally{clearTimeout(timer);}
  }
  return {list:(cursor?:NonNullable<Page["nextCursor"]>)=>request({operation:"list",limit:25,...(cursor?{cursor}:{})},orderListReplySchema),
    get:(id:string)=>request({operation:"get",id},orderSingleReplySchema),
    create:(input:Create)=>request(input,orderSingleReplySchema),
    updateItem:(input:ItemUpdate)=>request(input,orderSingleReplySchema)};
}
type State={status:"idle"|"ready"|"unavailable"|"unauthenticated"|"business_required"|"forbidden";rows:OrderSummary[];cursor:Page["nextCursor"];
  mode:"list"|"details"|"create";selected:OrderDetails|null;client:ClientRecord|null;clientMessage:string;requestedId:string|null;
  edit:ItemEdit|null;draft:Draft;touched:string[];createId:string|null;submitted:Create|null;uncertain:boolean;intentBlocked:boolean;reserved:boolean;rebuildAvailable:boolean;reviewAvailable:boolean;
  choices:ClientRecord[];choiceCursor:Parameters<ReturnType<typeof createClientRecordClient>["list"]>[0]|null;choicesLoaded:boolean;
  versions:MeasurementVersion[];versionCursor:Parameters<ReturnType<typeof createMeasurementClient>["list"]>[1]|null;versionsLoaded:boolean;choiceFailure:{message:string;more:boolean}|null;versionFailure:{message:string;more:boolean}|null;
  pending:"list"|"more"|"get"|"client"|"choices"|"versions"|"save"|"reconcile"|"edit_save"|"edit_check"|null;retryUntil:number|null;errorAt:"list"|"more"|"get"|null;message:string};
export function createOrdersController(api:ReturnType<typeof createOrderClient>,clients:Pick<ReturnType<typeof createClientRecordClient>,"get"|"list">,onUnauthenticated:()=>void,options:{now?:()=>number;isActive?:()=>boolean;newId?:()=>string;measurements?:Pick<ReturnType<typeof createMeasurementClient>,"list">;intent?:Intent}={}){
  const initial=():State=>({status:"idle",rows:[],cursor:null,mode:"list",selected:null,client:null,clientMessage:"",requestedId:null,pending:null,retryUntil:null,errorAt:null,message:"",edit:null,draft:{clientId:"",items:[]},touched:[],createId:null,submitted:null,uncertain:false,intentBlocked:false,reserved:false,rebuildAvailable:false,reviewAvailable:false,
    choices:[],choiceCursor:null,choicesLoaded:false,versions:[],versionCursor:null,versionsLoaded:false,choiceFailure:null,versionFailure:null});
  let state=initial(),generation=0,intentLoaded=false;const listeners=new Set<()=>void>(),now=options.now??Date.now;
  const update=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const busy=()=>state.pending!==null||state.retryUntil!==null;
  const active=()=>options.isActive?.()!==false;
  const editable=()=>active()&&!busy()&&!state.uncertain&&!state.intentBlocked&&state.mode==="create";
  const newId=()=>clientIdSchema.parse((options.newId??(()=>crypto.randomUUID()))());
  const forget=(id:string|null)=>{if(id)try{options.intent?.clear(id);}catch{/* A retained UUID is checked on the next mount. */}};
  function restore(){
    try{const id=options.intent?.read();if(id){update({mode:"create",createId:id,uncertain:true,reserved:true,rebuildAvailable:false,reviewAvailable:false,message:"An earlier order save needs checking before starting another. Check the saved order using its original reference."});return true;}}
    catch{update({intentBlocked:true,message:"Your browser could not read the previous save reference. Allow tab storage and reload before creating an order."});return true;}
    return false;
  }
  // Check settlements, keeping an in-flight read through Strict Mode effect replay.
  const current=(token:number)=>token===generation&&options.isActive?.()!==false;
  function failure(result:Failure){
    if(["unauthenticated","business_required","forbidden"].includes(result.kind)){
      generation++;update({...initial(),status:result.kind as "unauthenticated"|"business_required"|"forbidden",message:result.kind==="unauthenticated"?"Your session has expired. Please sign in again.":result.kind==="business_required"?"Set up your business on Home before viewing orders.":"Access to orders was refused. Check your session before trying again."});
      if(result.kind==="unauthenticated")onUnauthenticated();return;
    }
    update({pending:null,...(result.kind==="limited"?{retryUntil:now()+(result.retryAfterSeconds??1)*1000}:{}),message:result.kind==="limited"?`Too many requests. Wait ${result.retryAfterSeconds??1} seconds before trying again.`:
      result.kind==="not_found"?"This order is no longer available.":"Orders are temporarily unavailable. Please try again."});
  }
  async function load(more=false){
    if(!active()||busy()||state.edit||state.reserved&&intentLoaded||more&&!state.cursor)return false;
    if(!intentLoaded){intentLoaded=true;restore();}
    const token=++generation;update({pending:more?"more":"list",...(state.uncertain?{}:{mode:"list" as const}),selected:null,client:null,...(state.uncertain||state.intentBlocked?{}:{message:""}),errorAt:null});
    const result=await api.list(more?state.cursor??undefined:undefined);if(!current(token))return false;
    if(!result.ok){failure(result);if(!["unauthenticated","business_required","forbidden"].includes(result.kind))update({status:"unavailable",errorAt:more?"more":"list"});return false;}
    if(more&&result.data.orders.some(row=>state.rows.some(prior=>prior.id===row.id))){failure({ok:false,kind:"unavailable"});update({status:"unavailable",errorAt:"more"});return false;}
    update({status:"ready",rows:more?[...state.rows,...result.data.orders]:result.data.orders,cursor:result.data.nextCursor,pending:null});return true;
  }
  async function loadClient(token:number){
    if(!state.selected)return false;const id=state.selected.clientId;update({pending:"client",client:null,clientMessage:""});
    const result=await clients.get(id);if(!current(token))return false;
    if(result.ok){update({client:result.data.client,pending:null});return true;}
    if(["unauthenticated","business_required"].includes(result.kind)){failure(result);return false;}
    if(result.kind==="limited")update({retryUntil:now()+(result.retryAfterSeconds??1)*1000});
    update({pending:null,clientMessage:result.kind==="limited"?`Client details are temporarily limited. Wait ${result.retryAfterSeconds??1} seconds before trying again.`:"Client details could not be loaded. The saved client reference is shown below."});return false;
  }
  async function open(id:string){
    if(!active()||busy()||state.reserved||state.edit)return false;const token=++generation;update({mode:"details",selected:null,client:null,clientMessage:"",requestedId:id,pending:"get",message:"",errorAt:null});
    const result=await api.get(id);if(!current(token))return false;
    if(!result.ok){failure(result);if(!["unauthenticated","business_required","forbidden"].includes(result.kind))update({status:"unavailable",errorAt:"get"});return false;}
    update({status:"ready",selected:result.data.order,pending:null});await loadClient(token);return current(token);
  }
  async function loadChoices(more=false){
    if(!active()||busy()||state.uncertain||state.mode!=="create"||more&&!state.choiceCursor)return false;
    const token=++generation;update({pending:"choices",choiceFailure:null});
    const result=await clients.list(more?state.choiceCursor??undefined:undefined);if(!current(token))return false;
    if(!result.ok){failure(result);if(!["unauthenticated","business_required"].includes(result.kind))update({message:"",choiceFailure:{more,message:result.kind==="limited"?`Too many requests. Wait ${result.retryAfterSeconds??1} seconds.`:"Clients could not be loaded."}});return false;}
    update({pending:null,choicesLoaded:true,choices:more?[...state.choices,...result.data.clients.filter(row=>!state.choices.some(old=>old.id===row.id))]:result.data.clients,choiceCursor:result.data.nextCursor});return true;
  }
  async function loadVersions(more=false){
    const clientId=state.mode==="create"?state.draft.clientId:state.edit?state.selected?.clientId:null;
    if(!active()||busy()||state.uncertain||state.edit?.reason||!clientId||!options.measurements||more&&!state.versionCursor)return false;
    const token=++generation;update({pending:"versions",versionFailure:null});
    const result=await options.measurements.list(clientId,more?state.versionCursor??undefined:undefined);if(!current(token))return false;
    if(!result.ok){failure(result);if(!["unauthenticated","business_required","forbidden"].includes(result.kind))update({message:"",versionFailure:{more,message:result.kind==="limited"?`Too many requests. Wait ${result.retryAfterSeconds??1} seconds.`:"Saved measurements could not be loaded."}});return false;}
    // IDs are choices only, never evidence of authorization; the server revalidates them.
    if(result.data.versions.some(row=>row.clientId!==clientId)){update({pending:null,versionFailure:{more,message:"Saved measurements could not be verified."}});return false;}
    update({pending:null,versionsLoaded:true,versions:more?[...state.versions,...result.data.versions.filter(row=>!state.versions.some(old=>old.id===row.id))]:result.data.versions,versionCursor:result.data.nextCursor});return true;
  }
  const accepted=async(order:OrderDetails,message:string,token:number)=>{
    forget(state.createId);update({status:"ready",mode:"details",selected:order,client:null,requestedId:order.id,pending:null,uncertain:false,reserved:false,rebuildAvailable:false,reviewAvailable:false,createId:null,submitted:null,draft:{clientId:"",items:[]},message,
      rows:[order,...state.rows.filter(row=>row.id!==order.id)].sort((a,b)=>a.createdAt===b.createdAt?(a.id>b.id?-1:a.id<b.id?1:0):a.createdAt>b.createdAt?-1:1)});
    await loadClient(token);return current(token);
  };
  const canSave=()=>editable()&&state.status==="ready"&&state.choices.some(client=>client.id===state.draft.clientId)&&orderDraftValidation(state.draft).success&&
    state.draft.items.every(item=>item.measurementVersionId===null||state.versions.some(version=>version.id===item.measurementVersionId&&version.clientId===state.draft.clientId));
  async function submit(retry=false){
    if(!active()||busy()||retry&&(!state.uncertain||!state.submitted)||!retry&&!canSave())return false;
    const parsed=orderCreateSchema.safeParse(retry?state.submitted:{operation:"create",id:state.createId,...state.draft});if(!parsed.success)return false;
    const submitted=parsed.data;
    try{options.intent?.write(submitted.id);}catch{update({message:"Your browser could not keep the save reference. No order request was sent. Allow tab storage and try again."});return false;}
    const token=++generation;update({pending:"save",submitted,rebuildAvailable:false,reviewAvailable:false,message:""});
    const result=await api.create(submitted);if(!current(token))return false;
    if(result.ok&&sameOrder(result.data.order,submitted))return accepted(result.data.order,"Order created.",token);
    if(!result.ok&&["unauthenticated","business_required","forbidden"].includes(result.kind)){
      if(!retry&&!state.reserved)forget(submitted.id);failure(result);return false;
    }
    if(!retry&&!result.ok&&["invalid","not_found","limited"].includes(result.kind)){
      if(!state.reserved)forget(submitted.id);failure(result);update({submitted:null,message:result.kind==="limited"?state.message:result.kind==="not_found"?"The client or a selected measurement version is no longer available. Reload the choices and review your selection.":"Check each clothing-item description and selection before trying again."});return false;
    }
    update({pending:null,uncertain:true,reserved:true,message:!result.ok&&result.kind==="conflict"?"This save reference conflicts with an existing record. Check the saved order before continuing.":"The order save could not be confirmed. Check the saved order before retrying the same request. Your draft and original identifiers have been kept."});
    if(!result.ok&&result.kind==="limited")update({retryUntil:now()+(result.retryAfterSeconds??1)*1000});return false;
  }
  async function checkSaved(review=false){
    if(!active()||busy()||!state.uncertain||!state.createId||review&&!state.reviewAvailable)return false;
    const token=++generation;update({pending:"reconcile",rebuildAvailable:false,reviewAvailable:false,message:"Checking the original order reference..."});
    const result=await api.get(state.createId);if(!current(token))return false;
    if(result.ok){
      if(review)return accepted(result.data.order,"Showing the existing saved Order. Your draft has not replaced its contents.",token);
      if(state.submitted?sameOrder(result.data.order,state.submitted):state.draft.items.length===0)return accepted(result.data.order,state.submitted?"Saved order confirmed.":"Showing the saved Order for your original reference. Review its contents before continuing.",token);
      update({pending:null,reviewAvailable:true,message:"The saved Order has different contents from this draft. This check has not saved or replaced your draft. Review the existing saved Order before continuing."});return false;
    }
    if(result.kind==="not_found"){
      update({pending:null,rebuildAvailable:!state.submitted,message:state.submitted?"No order was found by this check. The earlier write may still be processing. Check again or explicitly retry the same request.":"No order was found by this check. The earlier write may still commit. You can rebuild using the reserved original reference; a differing saved Order will cause a conflict."});return false;
    }
    failure(result);return false;
  }
  const editing=()=>active()&&!busy()&&state.mode==="details"&&state.status==="ready"&&!!state.selected&&!!state.edit&&!state.edit.reason;
  const canSaveEdit=()=>{
    const e=state.edit;if(!editing()||!e)return false;const description=orderItemDescriptionValidation(e.description);
    return description.success&&(description.data!==e.original.description||e.measurementVersionId!==e.original.measurementVersionId)&&
      (e.measurementVersionId===null||e.measurementVersionId===e.original.measurementVersionId||state.versions.some(v=>v.id===e.measurementVersionId&&v.clientId===state.selected!.clientId));
  };
  async function checkEditedItem(){
    const e=state.edit,order=state.selected;if(!active()||busy()||!e?.reason||!order)return false;
    const token=++generation;update({pending:"edit_check"});const result=await api.get(order.id);if(!current(token))return false;
    if(!result.ok){failure(result);if(result.kind==="not_found")update({selected:null,edit:null,status:"unavailable",errorAt:"get",requestedId:order.id});return false;}
    if(result.data.order.clientId!==order.clientId){update({pending:null,message:"Current item details could not be verified. Check the saved item again."});return false;}
    update({selected:result.data.order,edit:null,pending:null,versionFailure:null,message:e.reason==="conflict"?"This item changed. Current saved details are shown; your edit was not reapplied.":e.reason==="not_found"?"Current saved details are shown. Review the item and its saved measurements before editing again.":"The save response was not confirmed. Current saved details are shown; review before editing again."});return true;
  }
  async function saveEdit(){
    if(!canSaveEdit()||!state.edit||!state.selected)return false;
    const e=state.edit,originalOrder=state.selected,description=orderDescriptionSchema.parse(e.description),parsed=orderUpdateItemSchema.safeParse({operation:"update_item",id:originalOrder.id,itemId:e.original.id,expectedUpdatedAt:e.original.updatedAt,
      ...(description!==e.original.description?{description}:{}),...(e.measurementVersionId!==e.original.measurementVersionId?{measurementVersionId:e.measurementVersionId}:{})});if(!parsed.success)return false;
    const token=++generation;update({pending:"edit_save",message:""});const result=await api.updateItem(parsed.data);if(!current(token))return false;
    if(result.ok){const saved=result.data.order,item=saved.items.find(item=>item.id===e.original.id);
      if(item&&saved.clientId===originalOrder.clientId&&saved.createdAt===originalOrder.createdAt&&saved.updatedAt===originalOrder.updatedAt&&item.createdAt===e.original.createdAt&&item.updatedAt>e.original.updatedAt&&item.description===description&&item.measurementVersionId===e.measurementVersionId){update({selected:saved,edit:null,pending:null,message:"Clothing item saved."});return true;}
    }else if(["unauthenticated","business_required","forbidden"].includes(result.kind)){failure(result);return false;}
    else if(result.kind==="invalid"||result.kind==="limited"){failure(result);if(result.kind==="invalid")update({message:"Check the description and saved measurements before trying again."});return false;}
    const reason=!result.ok&&result.kind==="conflict"?"conflict":!result.ok&&result.kind==="not_found"?"not_found":"uncertain";
    update({pending:null,edit:{...e,reason},message:reason==="conflict"?"This item changed. Checking its current saved details...":"The save could not be confirmed. Checking the saved item..."});
    await checkEditedItem();return false;
  }
  return {subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},getSnapshot:()=>state,getServerSnapshot:()=>state,
    load,loadMore:()=>load(true),open,loadChoices,loadVersions,canSave,canSaveEdit,saveEdit,checkEditedItem,
    async beginEdit(itemId:string){
      if(!active()||busy()||state.reserved||state.edit||state.mode!=="details"||state.status!=="ready")return false;
      const original=state.selected?.items.find(item=>item.id===itemId);if(!original)return false;
      update({edit:{original:{...original},description:original.description,measurementVersionId:original.measurementVersionId,touched:false,reason:null},versions:[],versionCursor:null,versionsLoaded:false,versionFailure:null,message:""});return loadVersions();
    },
    setEditDescription(description:string){if(editing()&&state.edit)update({edit:{...state.edit,description,touched:true},message:""});},
    setEditMeasurement(value:string){if(editing()&&state.edit&&(value===""||value===state.edit.original.measurementVersionId||state.versions.some(v=>v.id===value&&v.clientId===state.selected!.clientId)))update({edit:{...state.edit,measurementVersionId:value||null},message:""});},
    cancelEdit(){if(editing())update({edit:null,versionFailure:null,message:""});},
    async beginCreate(){
      if(!active()||busy()||state.reserved||state.edit||state.intentBlocked||state.status!=="ready")return false;if(restore())return false;
      update({mode:"create",selected:null,client:null,createId:newId(),submitted:null,draft:{clientId:"",items:[{id:newId(),description:"",measurementVersionId:null}]},touched:[],versions:[],versionCursor:null,versionsLoaded:false,choiceFailure:null,versionFailure:null,message:"",errorAt:null});
      return loadChoices();
    },
    async rebuild(){
      if(!active()||busy()||!state.uncertain||!state.reserved||!state.rebuildAvailable||state.submitted||!state.createId)return false;
      // A 404 is not a failed-write guarantee. Keep the original Order UUID and
      // let its primary key/content checks arbitrate any late original commit.
      update({status:"ready",mode:"create",uncertain:false,rebuildAvailable:false,reviewAvailable:false,draft:{clientId:"",items:[{id:newId(),description:"",measurementVersionId:null}]},touched:[],versions:[],versionCursor:null,versionsLoaded:false,choiceFailure:null,versionFailure:null,errorAt:null,
        message:"Rebuilding with the original Order reference. It stays reserved if you cancel or leave; an earlier write may still commit."});
      return loadChoices();
    },
    async chooseClient(id:string){
      if(!editable()||id!==""&&!state.choices.some(client=>client.id===id))return false;
      update({draft:{clientId:id,items:state.draft.items.map(item=>({...item,measurementVersionId:null}))},versions:[],versionCursor:null,versionsLoaded:false,message:"",choiceFailure:null,versionFailure:null});
      return id?loadVersions():true;
    },
    setDescription(id:string,description:string){if(editable())update({draft:{...state.draft,items:state.draft.items.map(item=>item.id===id?{...item,description}:item)},touched:[...new Set([...state.touched,id])],message:""});},
    setMeasurement(id:string,value:string){if(editable()&&(value===""||state.versions.some(v=>v.id===value&&v.clientId===state.draft.clientId)))update({draft:{...state.draft,items:state.draft.items.map(item=>item.id===id?{...item,measurementVersionId:value||null}:item)},message:""});},
    addItem(){if(editable()&&state.draft.items.length<50)update({draft:{...state.draft,items:[...state.draft.items,{id:newId(),description:"",measurementVersionId:null}]}});},
    removeItem(id:string){if(editable()&&state.draft.items.length>1)update({draft:{...state.draft,items:state.draft.items.filter(item=>item.id!==id)}});},
    cancelCreate(){if(editable()){
      if(state.reserved){update({uncertain:true,rebuildAvailable:false,reviewAvailable:false,message:"Reconstruction cancelled. The original Order reference is still reserved. Check the saved order before continuing."});return;}
      forget(state.createId);update({mode:"list",draft:{clientId:"",items:[]},createId:null,submitted:null,message:"",choiceFailure:null,versionFailure:null});
    }},
    save:()=>submit(),retryCreate:()=>submit(true),
    checkSaved:()=>checkSaved(),reviewSaved:()=>checkSaved(true),
    back(){if(state.pending==="save"||state.pending==="reconcile"||state.reserved||state.edit)return;generation++;update({mode:"list",selected:null,client:null,requestedId:null,pending:null,message:"",clientMessage:"",errorAt:null,status:"ready"});},
    retry(){return state.errorAt==="get"&&state.requestedId?open(state.requestedId):load(state.errorAt==="more");},
    retryClient(){if(busy())return Promise.resolve(false);return loadClient(generation);},
    resume(){if(state.retryUntil!==null&&now()>=state.retryUntil)update({retryUntil:null});}};
}
export type OrdersController=ReturnType<typeof createOrdersController>;
