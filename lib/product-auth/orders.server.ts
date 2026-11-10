import "server-only";
import {Prisma,type PrismaClient} from "../../prisma/product/generated/client.ts";
import type {createSessionService} from "./session.server.ts";
import {accountAccessEnabled,lockAccountAccess,withAccountAccessTransaction} from "./account-access.server.ts";
import {findOwnedBusiness} from "./business.server.ts";
import {orderRequestSchema,orderSchema,orderSummarySchema,type OrderReply,type OrderDetails,type OrderSummary} from "../order-contract.ts";
export class OrderError extends Error{
  readonly code:"unauthenticated"|"business_required"|"not_found"|"conflict"|"invalid_input"|"unavailable";
  constructor(code:OrderError["code"]){super("Order operation unavailable.");this.code=code;}
}
const summarySelect={id:true,clientId:true,createdAt:true,updatedAt:true} as const;
const select={...summarySelect,items:{select:{id:true,description:true,measurementVersionId:true,createdAt:true,updatedAt:true},orderBy:{id:"asc"},take:51}} as const;
type SummaryRow=Prisma.OrderGetPayload<{select:typeof summarySelect}>;
type Row=Prisma.OrderGetPayload<{select:typeof select}>;
const summary=(row:SummaryRow):OrderSummary=>orderSummarySchema.parse({id:row.id,clientId:row.clientId,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});
const record=(row:Row):OrderDetails=>orderSchema.parse({...summary(row),items:row.items.map(item=>({...item,createdAt:item.createdAt.toISOString(),updatedAt:item.updatedAt.toISOString()}))});
// Initial item order is not persisted. UUIDs bind exact trimmed content for retries.
const content=(items:{id:string;description:string;measurementVersionId:string|null}[])=>items.map(({id,description,measurementVersionId})=>({id,description,measurementVersionId})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
export function createOrderService(client:PrismaClient,sessions:Pick<ReturnType<typeof createSessionService>,"lookup"|"hasSessionForLockedUser">){
 return {async execute(headers:Headers,input:unknown):Promise<OrderReply>{
  if(process.env.NODE_ENV!=="development")throw new OrderError("unavailable");
  const parsed=orderRequestSchema.safeParse(input);if(!parsed.success)throw new OrderError("invalid_input");const data=parsed.data;
  try{
   const current=await sessions.lookup(headers);if(!current.session)throw new OrderError("unauthenticated");const actor=current.session.user.id;
   return await withAccountAccessTransaction(client,"test",async tx=>{
    const user=await lockAccountAccess(tx,{id:actor});
    if(!accountAccessEnabled(user)||!user?.emailVerified||!await sessions.hasSessionForLockedUser(tx,headers,user))throw new OrderError("unauthenticated");
    const credential=await tx.account.findFirst({where:{userId:actor,accountId:actor,providerId:"credential"},select:{password:true}});
    if(!credential?.password)throw new OrderError("unauthenticated");
    const business=await findOwnedBusiness(tx,actor);if(!business)throw new OrderError("business_required");const businessId=business.id;
    if(data.operation==="list"){
     const cursor=data.cursor,rows=await tx.order.findMany({where:{businessId,...(cursor?{OR:[{createdAt:{lt:new Date(cursor.createdAt)}},{createdAt:new Date(cursor.createdAt),id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],take:data.limit+1,select:summarySelect});
     const orders=rows.slice(0,data.limit).map(summary),last=orders.at(-1);
     return {orders,nextCursor:rows.length>data.limit&&last?{createdAt:last.createdAt,id:last.id}:null};
    }
    if(data.operation==="create"){
     // User -> Client. Do not FOR UPDATE Order (no runtime UPDATE grant) or history.
     const locked=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM product."Client" WHERE "id"=${data.clientId}::uuid AND "businessId"=${businessId} FOR UPDATE`;
     if(locked.length!==1||locked[0].id!==data.clientId)throw new OrderError("not_found");
    }
    const where={id:data.id,businessId},existing=await tx.order.findFirst({where,select});
    if(data.operation==="get"){
     if(!existing)throw new OrderError("not_found");return {order:record(existing)};
    }
    if(data.operation==="update_item"){
     if(!existing)throw new OrderError("not_found");
     const saved=record(existing),item=saved.items.find(item=>item.id===data.itemId);
     if(!item)throw new OrderError("not_found");
     if(item.updatedAt!==data.expectedUpdatedAt)throw new OrderError("conflict");
     if(data.measurementVersionId!==undefined&&data.measurementVersionId!==null){
      const versions=await tx.measurementVersion.findMany({where:{businessId,clientId:existing.clientId,id:{in:[data.measurementVersionId]}},select:{id:true},take:1});
      if(versions.length!==1||versions[0].id!==data.measurementVersionId)throw new OrderError("not_found");
     }
     const description=data.description??item.description,measurementVersionId=data.measurementVersionId===undefined?item.measurementVersionId:data.measurementVersionId;
     if(description===item.description&&measurementVersionId===item.measurementVersionId)return {order:saved};
     const stamp=await tx.$queryRaw<{time:Date}[]>`SELECT transaction_timestamp()::timestamptz(3) AS time`;
     if(stamp.length!==1||!(stamp[0].time instanceof Date)||!Number.isFinite(stamp[0].time.getTime()))throw new OrderError("unavailable");
     // A monotonic millisecond token prevents same-tick edits from reusing a precondition.
     const updatedAt=new Date(Math.max(stamp[0].time.getTime(),Date.parse(item.updatedAt)+1));
     const changed=await tx.orderItem.updateMany({where:{id:item.id,orderId:existing.id,clientId:existing.clientId,order:{businessId},updatedAt:new Date(data.expectedUpdatedAt)},
      data:{description,measurementVersionId,updatedAt}});
     if(changed.count===0)throw new OrderError("conflict");
     if(changed.count!==1)throw new OrderError("unavailable");
     const final=await tx.order.findFirst({where,select});if(!final)throw new OrderError("unavailable");
     const result=record(final),edited=result.items.find(row=>row.id===item.id);
     if(!edited||edited.description!==description||edited.measurementVersionId!==measurementVersionId||edited.updatedAt!==updatedAt.toISOString()||edited.createdAt!==item.createdAt||
       result.updatedAt!==saved.updatedAt||result.createdAt!==saved.createdAt||result.clientId!==saved.clientId||
       JSON.stringify(result.items.filter(row=>row.id!==item.id))!==JSON.stringify(saved.items.filter(row=>row.id!==item.id)))throw new OrderError("unavailable");
     return {order:result};
    }
    if(existing){
     const saved=record(existing);
     if(saved.clientId!==data.clientId||JSON.stringify(content(saved.items))!==JSON.stringify(content(data.items)))throw new OrderError("conflict");
     return {order:saved};
    }
    const versionIds=[...new Set(data.items.flatMap(item=>item.measurementVersionId?[item.measurementVersionId]:[]))];
    if(versionIds.length){
     const versions=await tx.measurementVersion.findMany({where:{businessId,clientId:data.clientId,id:{in:versionIds}},select:{id:true},take:50});
     if(versions.length!==versionIds.length||new Set(versions.map(v=>v.id)).size!==versions.length||versions.some(v=>!versionIds.includes(v.id)))throw new OrderError("not_found");
    }
    const stamp=await tx.$queryRaw<{time:Date}[]>`SELECT transaction_timestamp()::timestamptz(3) AS time`;
    if(stamp.length!==1||!(stamp[0].time instanceof Date)||!Number.isFinite(stamp[0].time.getTime()))throw new OrderError("unavailable");
    const time=stamp[0].time;
    await tx.order.create({data:{id:data.id,businessId,clientId:data.clientId,createdAt:time,updatedAt:time},select:{id:true}});
    const inserted=await tx.orderItem.createMany({data:data.items.map(item=>({id:item.id,orderId:data.id,clientId:data.clientId,description:item.description,measurementVersionId:item.measurementVersionId,createdAt:time,updatedAt:time}))});
    if(inserted.count!==data.items.length)throw new OrderError("unavailable");
    const saved=await tx.order.findFirst({where,select});if(!saved)throw new OrderError("unavailable");
    const result=record(saved);
    if(result.clientId!==data.clientId||JSON.stringify(content(result.items))!==JSON.stringify(content(data.items)))throw new OrderError("unavailable");
    return {order:result};
   });
  }catch(error){
   if(error instanceof OrderError)throw error;
   // Colliding Order/item UUIDs do not authorize looking up the other Business's rows.
   if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")throw new OrderError("conflict");
   // No automatic mutation retry after timeouts, rollback or uncertain COMMIT.
   // Reconcile by get with the original Order UUID before an explicit identical retry.
   throw new OrderError("unavailable");
  }
 }};
}
