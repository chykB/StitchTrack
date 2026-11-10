// Owner-only exact test-account execution. Inert on import; never retries.
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import {authorizeAccountErasurePreflight} from "./account-erasure-preflight.mjs";
import {withErasureConnection} from "./account-erasure.mjs";
export async function authorizeAccountErasureExecute(args,env){
 const cleanup=args.length===3&&args[2]==="--cleanup-role";
 if((args.length!==2&&!cleanup)||args[0]!=="--owner-execute"||args[1]!=="--execute"||
  env.PRODUCT_ACCOUNT_ERASURE_EXECUTION_ENABLED!=="true"||env.PRODUCT_ACCOUNT_ERASURE_EXECUTION_CONFIRMED!=="true")throw new Error();
 return authorizeAccountErasurePreflight(["--owner-preflight","--dry-run",...(cleanup?["--cleanup-role"]:[])],env);
}
async function main(){
 let scope;
 try{scope=await authorizeAccountErasureExecute(process.argv.slice(2),process.env);}
 catch{console.error(JSON.stringify({job:"account-erasure-test-execute",phase:"refused",outcome:"blocked",reason:"exact_execution_authorization_required",counts:null}));process.exitCode=1;return;}
 const {runTestAccountErasureExecute,runCleanupTestAccountErasure}=await import("../lib/product-auth/account-erasure.server.ts"),run=randomUUID();
 console.log(JSON.stringify({job:"account-erasure-test-execute",phase:"start",run,startedAt:new Date().toISOString()}));
 const interrupted=()=>console.error(JSON.stringify({job:"account-erasure-test-execute",phase:"finish",run,finishedAt:new Date().toISOString(),outcome:"unconfirmed",reason:"process_exit_before_confirmation",counts:null}));
 process.once("exit",interrupted);
 try{
  const result=await withErasureConnection(scope.target,db=>scope.cleanup?runCleanupTestAccountErasure(db,scope.approval,"execute",true):runTestAccountErasureExecute(db,scope.approval,true));
  console.log(JSON.stringify({job:"account-erasure-test-execute",phase:"finish",run,finishedAt:new Date().toISOString(),...result,connectionCleanup:true}));
  if(!["erased","noop"].includes(result.outcome))process.exitCode=1;
 }catch{
  console.error(JSON.stringify({job:"account-erasure-test-execute",phase:"finish",run,finishedAt:new Date().toISOString(),outcome:"unconfirmed",reason:"connection_or_cleanup_unconfirmed",counts:null}));process.exitCode=1;
 }finally{process.removeListener("exit",interrupted);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main();}catch{
 console.error(JSON.stringify({job:"account-erasure-test-execute",outcome:"unconfirmed",reason:"initialization_or_output_failure",counts:null}));process.exitCode=1;
}}
