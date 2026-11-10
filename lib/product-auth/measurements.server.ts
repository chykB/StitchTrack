import "server-only";
import {Prisma,type PrismaClient} from "../../prisma/product/generated/client.ts";
import type {createSessionService} from "./session.server.ts";
import {accountAccessEnabled,lockAccountAccess,withAccountAccessTransaction} from "./account-access.server.ts";
import {findOwnedBusiness} from "./business.server.ts";
import {measurementRequestSchema,measurementVersionSchema,type MeasurementVersion,type MeasurementReply} from "../measurement-contract.ts";
export class MeasurementError extends Error{
  readonly code:"unauthenticated"|"business_required"|"not_found"|"conflict"|"invalid_input"|"unavailable";
  constructor(code:MeasurementError["code"]){super("Measurement operation unavailable.");this.code=code;}
}
const select={id:true,clientId:true,versionNumber:true,unit:true,recordedAt:true,
  entries:{select:{name:true,value:true},orderBy:{name:"asc"},take:51}} as const;
type Row=Prisma.MeasurementVersionGetPayload<{select:typeof select}>;
function record(row:Row):MeasurementVersion{return measurementVersionSchema.parse({...row,recordedAt:row.recordedAt.toISOString(),
  entries:row.entries.map(e=>({name:e.name,value:e.value.toString()}))});}
// Entry order has no persisted meaning. Compare exact stored labels and exact decimal
// values after validation, without treating ICU-equivalent spellings as identical content.
const ordered=(entries:MeasurementVersion["entries"])=>[...entries].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
export function createMeasurementService(client:PrismaClient,sessions:Pick<ReturnType<typeof createSessionService>,"lookup"|"hasSessionForLockedUser">){
  return {async execute(headers:Headers,input:unknown):Promise<MeasurementReply>{
    if(process.env.NODE_ENV!=="development")throw new MeasurementError("unavailable");
    const parsed=measurementRequestSchema.safeParse(input);if(!parsed.success)throw new MeasurementError("invalid_input");
    const data=parsed.data;
    try{
      const current=await sessions.lookup(headers);if(!current.session)throw new MeasurementError("unauthenticated");
      const actor=current.session.user.id;
      return await withAccountAccessTransaction(client,"test",async tx=>{
        const user=await lockAccountAccess(tx,{id:actor});
        if(!accountAccessEnabled(user)||!user?.emailVerified||!await sessions.hasSessionForLockedUser(tx,headers,user))throw new MeasurementError("unauthenticated");
        const credential=await tx.account.findFirst({where:{userId:actor,accountId:actor,providerId:"credential"},select:{password:true}});
        if(!credential?.password)throw new MeasurementError("unauthenticated");
        const business=await findOwnedBusiness(tx,actor);if(!business)throw new MeasurementError("business_required");
        const businessId=business.id,clientId=data.clientId;
        if(data.operation==="create"){
          // User -> Client. Existing Client column-UPDATE privilege permits this lock;
          // no mutation or lock requiring UPDATE on immutable measurement tables.
          const locked=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM product."Client"
            WHERE "id"=${clientId}::uuid AND "businessId"=${businessId} FOR UPDATE`;
          if(locked.length!==1||locked[0].id!==clientId)throw new MeasurementError("not_found");
        }else{
          const existingClient=await tx.client.findFirst({where:{id:clientId,businessId},select:{id:true}});
          if(!existingClient||existingClient.id!==clientId)throw new MeasurementError("not_found");
        }
        const scope={businessId,clientId};
        if(data.operation==="list"){
          const rows=await tx.measurementVersion.findMany({where:{...scope,...(data.cursor?{versionNumber:{lt:data.cursor.versionNumber}}:{})},
            orderBy:{versionNumber:"desc"},take:data.limit+1,select});
          const versions=rows.slice(0,data.limit).map(record),last=versions.at(-1);
          return {versions,nextCursor:rows.length>data.limit&&last?{versionNumber:last.versionNumber}:null};
        }
        const where={...scope,id:data.id},existing=await tx.measurementVersion.findFirst({where,select});
        if(data.operation==="get"){
          if(!existing)throw new MeasurementError("not_found");
          return {version:record(existing)};
        }
        // Use precisely the deployed index's ICU equality, not JavaScript lower()/NFC.
        const labels=data.entries.map(e=>e.name);
        const duplicates=await tx.$queryRaw<{duplicate:boolean}[]>`SELECT EXISTS (
          SELECT 1 FROM unnest(${labels}::text[]) AS labels(name)
          GROUP BY name COLLATE product.measurement_label_ci HAVING count(*)>1) AS duplicate`;
        if(duplicates.length!==1||typeof duplicates[0].duplicate!=="boolean")throw new MeasurementError("unavailable");
        if(duplicates[0].duplicate)throw new MeasurementError("invalid_input");
        if(existing){
          const saved=record(existing);
          if(saved.unit!==data.unit||JSON.stringify(ordered(saved.entries))!==JSON.stringify(ordered(data.entries)))throw new MeasurementError("conflict");
          return {version:saved};
        }
        const {_max}=await tx.measurementVersion.aggregate({where:scope,_max:{versionNumber:true}});
        const maximum=_max.versionNumber??0;
        if(!Number.isInteger(maximum)||maximum<0||maximum>=2147483647)throw new MeasurementError("unavailable");
        // MAX+1 under the Client lock uses no nontransactional sequence: a rollback
        // consumes no version number. The unique key is a final integrity backstop.
        await tx.measurementVersion.create({data:{id:data.id,...scope,versionNumber:maximum+1,unit:data.unit},select:{id:true}});
        try{
          const inserted=await tx.measurementEntry.createMany({data:data.entries.map(e=>({measurementVersionId:data.id,name:e.name,value:new Prisma.Decimal(e.value)}))});
          if(inserted.count!==data.entries.length)throw new MeasurementError("unavailable");
        }catch(error){
          if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")throw new MeasurementError("invalid_input");
          throw error;
        }
        const saved=await tx.measurementVersion.findFirst({where,select});
        if(!saved)throw new MeasurementError("unavailable");return {version:record(saved)};
      });
    }catch(error){
      if(error instanceof MeasurementError)throw error;
      // A global UUID collision is never authority to read the other record.
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")throw new MeasurementError("conflict");
      // No automatic mutation retry after timeout, rollback or an uncertain COMMIT.
      // Reconcile with get using the same client/version UUID; retain that UUID on retry.
      throw new MeasurementError("unavailable");
    }
  }};
}
