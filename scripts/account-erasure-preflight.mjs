// Owner-only, inert on import. No execution mode or historical receipt access.
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import {productMigrationConfig,productCleanupConfig} from "../prisma/product/targets.ts";
import {withErasureConnection} from "./account-erasure.mjs";
export async function authorizeAccountErasurePreflight(args,env){
 const cleanup=args.length===3&&args[2]==="--cleanup-role";
 if(process.platform!=="linux"||process.env.NODE_ENV==="production"||(args.length!==2&&!cleanup)||args[0]!=="--owner-preflight"||args[1]!=="--dry-run"||
  env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||env.PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_ENABLED!=="true"||
  env.PRODUCT_ACCOUNT_ERASURE_PREFLIGHT_CONFIRMED!=="true"||env.PRODUCT_ERASURE_DISPOSABLE_TEST_ACCOUNT_CONFIRMED!=="true"||
  env.PRODUCT_EMAIL_WORKER_ENABLED==="true"||["NODE_OPTIONS","NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(key=>env[key]))throw new Error();
 const target=cleanup?productCleanupConfig(env):productMigrationConfig(env);if(target.mode!=="test"||!cleanup&&target.user!=="stitchtrack_product_test_migrator")throw new Error();
 await import("./register-server-only.mjs");
 const {validateErasureTestAccountApproval}=await import("../lib/product-auth/account-erasure.server.ts");
 const approval=validateErasureTestAccountApproval({userId:env.PRODUCT_ERASURE_TARGET_USER_ID,
  expectedDeletionRequestedAt:env.PRODUCT_ERASURE_EXPECTED_REQUESTED_AT,disposableTestAccount:true});
 return {target,approval,cleanup};
}
async function main(){
 const scope=await authorizeAccountErasurePreflight(process.argv.slice(2),process.env);
 const {runTestAccountErasureDryRun,runCleanupTestAccountErasure}=await import("../lib/product-auth/account-erasure.server.ts");
 const run=randomUUID(),result=await withErasureConnection(scope.target,db=>scope.cleanup?runCleanupTestAccountErasure(db,scope.approval,"dry-run",true):runTestAccountErasureDryRun(db,scope.approval));
 console.log(JSON.stringify({job:"account-erasure-test-preflight",run,mode:"dry-run",...result,connectionCleanup:true}));
 if(result.status==="failed"||result.status==="blocked")process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main();}catch{
 console.error(JSON.stringify({job:"account-erasure-test-preflight",status:"failed",reason:"authorization_configuration_or_connection",wouldAffect:null}));process.exitCode=1;
}}
