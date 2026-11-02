import "server-only";
import type {PrismaClient} from "../../prisma/product/generated/client.ts";
import type {createSessionService} from "./session.server.ts";
import {createAccountAccessService,accountAccessEnabled} from "./account-access.server.ts";
import {verifyPassword} from "../auth/password.server.ts";
import {accountDeletionSchema} from "../auth/account-deletion-contract.ts";
import {ProductAuthError} from "./secrets.server.ts";
type Sessions=Pick<ReturnType<typeof createSessionService>,"lookup"|"logout"|"hasSessionForLockedUser">;
// Inert, restricted product-test service. No purge, restore, caller userId or side effects on import.
export function createAccountDeletionService(client:PrismaClient,sessions:Sessions){
 if(process.env.NODE_ENV==="production"||!sessions||typeof sessions.hasSessionForLockedUser!=="function")throw new ProductAuthError("configuration_unavailable");
 return {async request(headers:Headers,input:unknown):Promise<{headers:Headers}>{
  const parsed=accountDeletionSchema.safeParse(input);if(!parsed.success)throw new ProductAuthError("deletion_rejected");
  try{
   const current=await sessions.lookup(headers);if(!current.session)throw new ProductAuthError("deletion_rejected");
   const actor=current.session.user.id;
   const lifecycle=createAccountAccessService(client,{mode:"test",authorize:async(tx,request,user)=>{
    if(request.kind!=="deletion-request"||request.userId!==actor||user.id!==actor||!accountAccessEnabled(user)||!user.emailVerified||
      !await sessions.hasSessionForLockedUser(tx,headers,user))return false;
    const credential=await tx.account.findFirst({where:{userId:actor,accountId:actor,providerId:"credential"},select:{password:true}});
    return !!credential?.password&&await verifyPassword({password:parsed.data.password,hash:credential.password});
   }});
   // Existing lock service owns BEGIN/User lock/status UPDATE/all-session DELETE/COMMIT.
   // Login and password reset use the same User lock, so no session survives this lock.
   await lifecycle.lock({userId:actor,kind:"deletion-request"});
   // The lock is already committed. Reuse Better Auth's signed-cookie clearing;
   // failure here is an uncertain response, never a claim of database rollback.
   return await sessions.logout(headers);
  }catch(error){
   if(error instanceof ProductAuthError&&["deletion_rejected","account_lock_refused"].includes(error.code))throw new ProductAuthError("deletion_rejected");
   throw new ProductAuthError("deletion_unavailable");
  }
 }};
}
