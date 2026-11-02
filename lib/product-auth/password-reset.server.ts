import "server-only";
import {randomUUID} from "node:crypto";
import {betterAuth} from "better-auth";
import {prismaAdapter} from "@better-auth/prisma-adapter";
import {emailOTP} from "better-auth/plugins/email-otp";
import type {Prisma,PrismaClient} from "../../prisma/product/generated/client.ts";
import {resetRequestSchema,resetCodeSchema,resetCompleteSchema,RESET_TEMPLATE,RESET_MAC_CONTEXT} from "../auth/password-reset-contract.ts";
import {hashPassword,verifyPassword} from "../auth/password.server.ts";
import {createSecretTools,ProductAuthError,type KeyRing} from "./secrets.server.ts";
import {accountAccessEnabled,lockAccountAccess,withAccountAccessTransaction} from "./account-access.server.ts";
export const RESET_STAGES=["verification","issuance","outbox","credential","sessions","consumption"] as const;
type Config={authSecret:string;verifierKeys:KeyRing;outboxKeys:KeyRing;
 checkPassword:(password:string)=>Promise<"not_found"|"breached"|"unavailable">;
 clock?:()=>Date;testFault?:typeof RESET_STAGES[number];testObserver?:(stage:typeof RESET_STAGES[number])=>void|Promise<void>};
// Root product-test client only. No connection, generic handler, SMTP or callback dispatch.
export function createPasswordResetService(client:PrismaClient,config:Config){
 if(process.env.NODE_ENV==="production"||!config||config.authSecret.length<32||typeof config.checkPassword!=="function"||
   (config.clock||config.testFault||config.testObserver)&&process.env.NODE_ENV!=="test")throw new ProductAuthError("configuration_unavailable");
 const secrets=createSecretTools(config.verifierKeys,config.outboxKeys);
 const now=()=>{const d=(config.clock??(()=>new Date()))();if(!Number.isFinite(d.getTime()))throw new ProductAuthError();return d;};
 const fault=async(stage:typeof RESET_STAGES[number])=>{await config.testObserver?.(stage);if(config.testFault===stage)throw new ProductAuthError();};
 async function eligible(tx:Prisma.TransactionClient,email:string){
  const state=await lockAccountAccess(tx,{email});
  if(!accountAccessEnabled(state)||!state?.emailVerified)return null;
  const account=await tx.account.findFirst({where:{userId:state.id,accountId:state.id,providerId:"credential"}});
  return account?.password?{id:state.id,email,accountId:account.id}:null;
 }
 type Identity=NonNullable<Awaited<ReturnType<typeof eligible>>>;
 function authFor(tx:Prisma.TransactionClient,user:Identity,issuanceId:string,keyId:string,prehashed?:{password:string;hash:string}){
  let verification:{id:string;expiresAt:Date}|undefined;
  const wrapped=new Proxy(tx,{get(target,property){
   if(property==="$transaction")return undefined; // A real transaction client cannot start another transaction.
   const delegate=Reflect.get(target,property);
   if(!["user","account","session","verification"].includes(String(property)))return typeof delegate==="function"?delegate.bind(target):delegate;
   return new Proxy(delegate,{get(model,method){
    const original=Reflect.get(model,method);
    if((property==="user"&&["create","update","updateMany"].includes(String(method)))||
      (["account","session"].includes(String(property))&&method==="create"))return ()=>{throw new ProductAuthError();};
    if(property==="account"&&["update","updateMany"].includes(String(method)))return async(args:Prisma.AccountUpdateManyArgs)=>{
     if(method!=="updateMany"||!prehashed||JSON.stringify(args.where)!==JSON.stringify({AND:[{userId:{equals:user.id}},{providerId:{equals:"credential"}},{accountId:{equals:user.id}}]})||
       args.data.password!==prehashed.hash||Object.keys(args.data).some(k=>!["password","updatedAt"].includes(k)))throw new ProductAuthError();
     const result=await tx.account.updateMany({where:{id:user.accountId,userId:user.id,accountId:user.id,providerId:"credential"},data:args.data});
     if(result.count!==1)throw new ProductAuthError();await fault("credential");return result;
    };
    if(property==="session"&&method==="deleteMany")return async(args:Prisma.SessionDeleteManyArgs)=>{
     if(JSON.stringify(args.where)!==JSON.stringify({userId:{equals:user.id}}))throw new ProductAuthError();
     const result=await tx.session.deleteMany(args);await fault("sessions");return result;
    };
    if(property==="verification"&&method==="create")return async(args:Prisma.VerificationCreateArgs)=>{
     if(prehashed)throw new ProductAuthError();const row=await tx.verification.create(args);verification={id:row.id,expiresAt:row.expiresAt};await fault("verification");return row;
    };
    return typeof original==="function"?original.bind(model):original;
   }});
  }});
  const auth=betterAuth({baseURL:"http://127.0.0.1:3999",secret:config.authSecret,
   database:prismaAdapter(wrapped,{provider:"postgresql",transaction:false,debugLogs:false}),logger:{disabled:true},telemetry:{enabled:false},verification:{disableCleanup:true},
   emailAndPassword:{enabled:true,disableSignUp:true,autoSignIn:false,requireEmailVerification:true,revokeSessionsOnPasswordReset:true,
    minPasswordLength:12,maxPasswordLength:Number.POSITIVE_INFINITY,password:{verify:verifyPassword,hash:async value=>{
     if(!prehashed||value!==prehashed.password)throw new ProductAuthError();return prehashed.hash;
    }}},emailVerification:{sendOnSignUp:false,sendOnSignIn:false,autoSignInAfterVerification:false},
   plugins:[emailOTP({otpLength:6,expiresIn:300,allowedAttempts:3,disableSignUp:true,sendVerificationOnSignUp:false,
    storeOTP:{hash:async otp=>secrets.mac(RESET_MAC_CONTEXT+issuanceId,user.email,otp,keyId).toString("hex")},
    sendVerificationOTP:async()=>{throw new ProductAuthError();}})]});
  return {auth,created:()=>verification};
 }
 const cancel=(tx:Prisma.TransactionClient,id:string)=>tx.emailOutbox.updateMany({where:{issuanceId:id,status:"pending"},data:{status:"cancelled"}});
 async function challenge(tx:Prisma.TransactionClient,user:Identity,otp:string){
  const issue=await tx.emailVerificationIssuance.findFirst({where:{userId:user.id,purpose:"password-reset",consumedAt:null,supersededAt:null},orderBy:{createdAt:"desc"}});
  if(!issue||issue.emailCanonical!==user.email||!issue.verificationId||issue.failedAttempts>=3)return null;
  if(issue.expiresAt<=now()){await cancel(tx,issue.id);return null;}
  if(!secrets.matches(issue.verifier,RESET_MAC_CONTEXT+issue.id,user.email,otp,issue.verifierKeyId)){
   const failures=issue.failedAttempts+1;await tx.emailVerificationIssuance.update({where:{id:issue.id},data:{failedAttempts:failures}});
   if(failures===3)await cancel(tx,issue.id);return null; // Return, not throw: persist wrong-attempt budget.
  }
  return issue;
 }
 return {
  async request(input:unknown):Promise<void>{
   const parsed=resetRequestSchema.safeParse(input);if(!parsed.success)throw new ProductAuthError("invalid_input");
   try{await withAccountAccessTransaction(client,"test",async tx=>{
    const user=await eligible(tx,parsed.data.email);if(!user)return;
    const time=now(),old=await tx.emailVerificationIssuance.findFirst({where:{userId:user.id,purpose:"password-reset"},orderBy:{createdAt:"desc"}});
    if(old&&time.getTime()-old.createdAt.getTime()<60000)return;
    for(const previous of await tx.emailVerificationIssuance.findMany({where:{userId:user.id,purpose:"password-reset",consumedAt:null,supersededAt:null}})){
     await tx.emailVerificationIssuance.update({where:{id:previous.id},data:{supersededAt:time}});await cancel(tx,previous.id);
     if(previous.verificationId)await tx.verification.deleteMany({where:{id:previous.verificationId}});
    }
    const id=randomUUID(),scoped=authFor(tx,user,id,secrets.verifierKeyId);
    const otp=await scoped.auth.api.createVerificationOTP({body:{email:user.email,type:"forget-password"}}),record=scoped.created();
    if(!record||!/^\d{6}$/u.test(otp))throw new ProductAuthError();
    const expiresAt=new Date(Math.min(time.getTime()+300000,record.expiresAt.getTime()));
    await tx.emailVerificationIssuance.create({data:{id,userId:user.id,emailCanonical:user.email,purpose:"password-reset",createdAt:time,expiresAt,
     verificationId:record.id,verifier:new Uint8Array(secrets.mac(RESET_MAC_CONTEXT+id,user.email,otp)),verifierKeyId:secrets.verifierKeyId}});await fault("issuance");
    const context={id:randomUUID(),issuanceId:id,templateVersion:RESET_TEMPLATE};
    await tx.emailOutbox.create({data:{...context,...secrets.seal(context,{email:user.email,otp}),createdAt:time,availableAt:time}});await fault("outbox");
   });}catch{throw new ProductAuthError("reset_unavailable");}
  },
  async check(input:unknown):Promise<boolean>{
   const parsed=resetCodeSchema.safeParse(input);if(!parsed.success)return false;
   try{return await withAccountAccessTransaction(client,"test",async tx=>{
    const user=await eligible(tx,parsed.data.email);if(!user)return false;
    const issue=await challenge(tx,user,parsed.data.otp);if(!issue)return false;
    await authFor(tx,user,issue.id,issue.verifierKeyId).auth.api.checkVerificationOTP({body:{...parsed.data,type:"forget-password"}});return true;
   });}catch{throw new ProductAuthError("reset_unavailable");}
  },
  async complete(input:unknown):Promise<boolean>{
   const parsed=resetCompleteSchema.safeParse(input);if(!parsed.success)throw new ProductAuthError("invalid_input");
   // Network and expensive Argon2id run BEFORE the User lock/transaction. Never normalize.
   let verdict="unavailable";try{verdict=await config.checkPassword(parsed.data.password);}catch{}
   if(verdict!=="not_found")throw new ProductAuthError(verdict==="breached"?"password_rejected":"reset_unavailable");
   let hash:string;try{hash=await hashPassword(parsed.data.password);}catch{throw new ProductAuthError("reset_unavailable");}
   try{return await withAccountAccessTransaction(client,"test",async tx=>{
    const user=await eligible(tx,parsed.data.email);if(!user)return false;
    const issue=await challenge(tx,user,parsed.data.otp);if(!issue)return false;
    await authFor(tx,user,issue.id,issue.verifierKeyId,{password:parsed.data.password,hash}).auth.api.resetPasswordEmailOTP({body:parsed.data});
    const time=now();if(time>=issue.expiresAt||await tx.verification.count({where:{id:issue.verificationId!}})||await tx.session.count({where:{userId:user.id}}))throw new ProductAuthError();
    const account=await tx.account.findUnique({where:{id:user.accountId}});if(account?.password!==hash)throw new ProductAuthError();
    await tx.emailVerificationIssuance.update({where:{id:issue.id},data:{consumedAt:time}});await fault("consumption");await cancel(tx,issue.id);
    return true;
   });}catch{throw new ProductAuthError("reset_unavailable");}
  },
 };
}
