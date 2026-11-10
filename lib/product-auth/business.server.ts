import "server-only";
import {randomUUID} from "node:crypto";
import type {PrismaClient,Prisma} from "../../prisma/product/generated/client.ts";
import type {createSessionService} from "./session.server.ts";
import {accountAccessEnabled,lockAccountAccess,withAccountAccessTransaction} from "./account-access.server.ts";
import {businessProfileSchema,businessWriteSchema,type BusinessProfile} from "../business-contract.ts";
type Sessions=Pick<ReturnType<typeof createSessionService>,"lookup"|"hasSessionForLockedUser">;
export class BusinessError extends Error {
  readonly code:"unauthenticated"|"conflict"|"invalid_input"|"unavailable";
  constructor(code:BusinessError["code"]){super("Business operation unavailable.");this.code=code;}
}
const select={id:true,name:true,timeZone:true} as const;
export async function findOwnedBusiness(tx:Prisma.TransactionClient,userId:string):Promise<BusinessProfile|null>{
    const row=await tx.business.findUnique({where:{primaryOwnerUserId:userId},select});
    if(!row)return null;
    const member=await tx.businessMember.findUnique({where:{businessId_userId:{businessId:row.id,userId}},select:{businessId:true,userId:true}});
    if(!member||member.businessId!==row.id||member.userId!==userId)throw new BusinessError("unavailable");
    return businessProfileSchema.parse(row);
  }
export function createBusinessService(client:PrismaClient,sessions:Sessions){
  async function run(headers:Headers,write:boolean,input?:unknown):Promise<BusinessProfile|null>{
    if(process.env.NODE_ENV!=="development")throw new BusinessError("unavailable");
    const parsed=write?businessWriteSchema.safeParse(input):null;
    if(parsed&&!parsed.success)throw new BusinessError("invalid_input");
    try{
      const current=await sessions.lookup(headers);
      if(!current.session)throw new BusinessError("unauthenticated");
      const actor=current.session.user.id;
      return await withAccountAccessTransaction(client,"test",async tx=>{
        // Same User-first lock order as login, reset and deletion; no browser ID.
        const user=await lockAccountAccess(tx,{id:actor});
        if(!accountAccessEnabled(user)||!user?.emailVerified||!await sessions.hasSessionForLockedUser(tx,headers,user))throw new BusinessError("unauthenticated");
        const credential=await tx.account.findFirst({where:{userId:actor,accountId:actor,providerId:"credential"},select:{password:true}});
        if(!credential?.password)throw new BusinessError("unauthenticated");
        const existing=await findOwnedBusiness(tx,actor);
        if(!parsed)return existing;
        const {operation,name}=parsed.data;
        if(operation==="create"){
          if(existing){if(existing.name!==name)throw new BusinessError("conflict");return existing;}
          const id=randomUUID();
          await tx.business.create({data:{id,primaryOwnerUserId:actor,name,timeZone:"Africa/Lagos"},select:{id:true}});
          await tx.businessMember.create({data:{businessId:id,userId:actor},select:{businessId:true}});
          // Force validation now as well as at COMMIT. No orphan can be published.
          await tx.$executeRaw`SET CONSTRAINTS product."Business_id_primaryOwnerUserId_fkey" IMMEDIATE`;
        }else{
          if(!existing)throw new BusinessError("conflict");
          // Update is scoped again by owner; IDs/ownership/timezone never come from input.
          await tx.business.update({where:{primaryOwnerUserId:actor},data:{name},select:{id:true}});
        }
        const saved=await findOwnedBusiness(tx,actor);
        if(!saved||saved.name!==name)throw new BusinessError("unavailable");
        return saved;
      });
    }catch(error){
      if(error instanceof BusinessError)throw error;
      // Missing tables/grants, rollback, and uncertain COMMIT all stay generic.
      throw new BusinessError("unavailable");
    }
  }
  return {read:(headers:Headers)=>run(headers,false),write:(headers:Headers,input:unknown)=>run(headers,true,input)};
}
