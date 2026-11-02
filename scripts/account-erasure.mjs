// Owner-only assessment process. Importing this file never opens a connection.
import {pathToFileURL} from "node:url";
import {isAbsolute,join,resolve} from "node:path";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {productMigrationConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from "../prisma/product/targets.ts";
export function erasureEnvironment(env){
 if(process.platform!=="linux"||env.NODE_ENV!=="test"||env.PRODUCT_DATABASE_MODE!=="test"||env.PRODUCT_ACCOUNT_ERASURE_ENABLED!=="true"||env.PRODUCT_ACCOUNT_ERASURE_CONFIRMED!=="true"||
  env.PRODUCT_EMAIL_WORKER_ENABLED==="true"||["NODE_OPTIONS","NODE_DEBUG","DEBUG","RUST_LOG","PRISMA_LOG_LEVEL","PGOPTIONS","PGSERVICE","PGSERVICEFILE"].some(k=>env[k]))throw new Error();
 const target=productMigrationConfig(env);if(target.mode!=="test"||target.user!=="stitchtrack_product_test_migrator")throw new Error();
 const directory=env.PRODUCT_ERASURE_PROOF_DIRECTORY;if(!directory||!isAbsolute(directory)||resolve(directory)!==directory||!directory.startsWith("/tmp/stitchtrack-erasure-")||realpathSync(directory)!==directory)throw new Error();
 const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid())throw new Error();
 return {target,directory};
}
export function readErasureReceipt(directory){
 const file=join(directory,"proof.json"),stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o600||stat.size>10000)throw new Error();
 const data=JSON.parse(readFileSync(file,"utf8"));
 if(data.format!==1||data.created!==true||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u.test(data.run)||Object.keys(data).sort().join()!=="baseline,created,format,retainedDigest,run")throw new Error();
 if(!/^[0-9a-f]{64}$/u.test(data.retainedDigest))throw new Error();
 const tables=["Account","AuthRateBucket","EmailOutbox","EmailVerificationIssuance","Session","TermsAcceptance","TermsVersion","User","Verification"].sort();
 if(Object.keys(data.baseline??{}).sort().join()!==tables.join()||Object.values(data.baseline).some(v=>Object.keys(v).sort().join()!=="count,digest"||!Number.isSafeInteger(v.count)||v.count<0||!/^[0-9a-f]{64}$/u.test(v.digest)))throw new Error();
 return data;
}
export async function withErasureConnection(target,operation){
 const {Client}=await import("pg");let closing=false,lost=false;
 const client=new Client({connectionString:target.url,options:PRODUCT_PRISMA_CONNECTION_OPTIONS,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:5000,application_name:"stitchtrack-owner-erasure-proof"});
 client.on("error",()=>{lost=true;});client.on("end",()=>{if(!closing)lost=true;});
 const watchdog=setTimeout(()=>{console.error(JSON.stringify({outcome:"unconfirmed",counts:null,reason:"deadline_or_connection_loss"}));process.exit(1);},30000);
 try{await client.connect();const result=await operation(client);if(lost)throw new Error();return result;}
 finally{closing=true;try{await client.end();}finally{clearTimeout(watchdog);}}
}
export function authorizeErasure(args,env){
 if(args.length!==2||args[0]!=="--owner-run"||!["--dry-run","--execute"].includes(args[1]))throw new Error();
 const scope=erasureEnvironment(env),receipt=readErasureReceipt(scope.directory);return {...scope,receipt,mode:args[1]==="--dry-run"?"dry-run":"execute"};
}
async function main(){
 const scope=authorizeErasure(process.argv.slice(2),process.env);
 await import("./register-server-only.mjs");const {runControlledErasure}=await import("../lib/product-auth/account-erasure.server.ts");
 const result=await withErasureConnection(scope.target,db=>runControlledErasure(db,scope.receipt,scope.mode));
 console.log(JSON.stringify({job:"account-erasure-proof",format:1,run:scope.receipt.run,mode:scope.mode,finishedAt:new Date().toISOString(),...result,connectionCleanup:true}));
 if(!["erased","noop","dry_run"].includes(result.outcome))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await main();}catch{console.error(JSON.stringify({job:"account-erasure-proof",outcome:"unconfirmed_or_refused",counts:null,reason:"authorization_configuration_or_connection",connectionCleanup:"unconfirmed"}));process.exitCode=1;}}
