import "server-only";
import {Prisma,type PrismaClient} from "../../prisma/product/generated/client.ts";
import type {createSessionService} from "./session.server.ts";
import {accountAccessEnabled,lockAccountAccess,withAccountAccessTransaction} from "./account-access.server.ts";
import {findOwnedBusiness} from "./business.server.ts";
import {clientRequestSchema,clientRecordSchema,type ClientRecord,type ClientReply} from "../client-record-contract.ts";
export class ClientRecordError extends Error{
  readonly code:"unauthenticated"|"business_required"|"not_found"|"conflict"|"invalid_input"|"unavailable";
  constructor(code:ClientRecordError["code"]){super("Client operation unavailable.");this.code=code;}
}
const select={id:true,fullName:true,phone:true,email:true,createdAt:true,updatedAt:true} as const;
type Row=Prisma.ClientGetPayload<{select:typeof select}>;
function record(row:Row):ClientRecord{return clientRecordSchema.parse({...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});}
export function createClientRecordService(client:PrismaClient,sessions:Pick<ReturnType<typeof createSessionService>,"lookup"|"hasSessionForLockedUser">){
  return {async execute(headers:Headers,input:unknown):Promise<ClientReply>{
    if(process.env.NODE_ENV!=="development")throw new ClientRecordError("unavailable");
    const parsed=clientRequestSchema.safeParse(input);if(!parsed.success)throw new ClientRecordError("invalid_input");
    const data=parsed.data;
    try{
      const current=await sessions.lookup(headers);if(!current.session)throw new ClientRecordError("unauthenticated");
      const actor=current.session.user.id;
      return await withAccountAccessTransaction(client,"test",async tx=>{
        const user=await lockAccountAccess(tx,{id:actor});
        if(!accountAccessEnabled(user)||!user?.emailVerified||!await sessions.hasSessionForLockedUser(tx,headers,user))throw new ClientRecordError("unauthenticated");
        const credential=await tx.account.findFirst({where:{userId:actor,accountId:actor,providerId:"credential"},select:{password:true}});
        if(!credential?.password)throw new ClientRecordError("unauthenticated");
        const business=await findOwnedBusiness(tx,actor);if(!business)throw new ClientRecordError("business_required");
        const businessId=business.id;
        if(data.operation==="list"){
          const cursor=data.cursor,rows=await tx.client.findMany({where:{businessId,...(cursor?{OR:[
            {createdAt:{gt:new Date(cursor.createdAt)}},{createdAt:new Date(cursor.createdAt),id:{gt:cursor.id}},
          ]}:{})},orderBy:[{createdAt:"asc"},{id:"asc"}],take:data.limit+1,select});
          const clients=rows.slice(0,data.limit).map(record),last=clients.at(-1);
          return {clients,nextCursor:rows.length>data.limit&&last?{createdAt:last.createdAt,id:last.id}:null};
        }
        const where={id:data.id,businessId},existing=await tx.client.findFirst({where,select});
        if(data.operation==="create"){
          if(existing){
            if(existing.fullName!==data.fullName||existing.phone!==data.phone||existing.email!==data.email)throw new ClientRecordError("conflict");
            return {client:record(existing)};
          }
          const saved=await tx.client.create({data:{id:data.id,businessId,fullName:data.fullName,phone:data.phone,email:data.email},select});
          return {client:record(saved)};
        }
        if(!existing)throw new ClientRecordError("not_found");
        if(data.operation==="get")return {client:record(existing)};
        const changes={...(data.fullName===undefined?{}:{fullName:data.fullName}),...(data.phone===undefined?{}:{phone:data.phone}),...(data.email===undefined?{}:{email:data.email})};
        return {client:record(await tx.client.update({where,data:changes,select}))};
      });
    }catch(error){
      if(error instanceof ClientRecordError)throw error;
      // A global UUID collision may belong to another business. Never read or expose it.
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")throw new ClientRecordError("conflict");
      // No mutation retry on timeout, rollback or uncertain COMMIT. Reconcile by get with the same UUID.
      throw new ClientRecordError("unavailable");
    }
  }};
}
