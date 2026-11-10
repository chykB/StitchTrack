// Filesystem-only preparation/inspection. No child processes, PostgreSQL client, Docker API or database operations.
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,symlinkSync} from "node:fs";
import {resolve,dirname,isAbsolute,sep,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {PRODUCT_MIGRATIONS,assertProductMigrationFiles} from "../prisma/product/migration-files.ts";
const repo=resolve(fileURLToPath(new URL("../",import.meta.url))),ninth="20261108_measurement_label_unicode";
const hash=b=>createHash("sha256").update(b).digest("hex");
const copyFiles=["prisma/product/schema.prisma","prisma/product/targets.ts","prisma/product/migration-files.ts","prisma/product/prisma.config.ts",
 "prisma/product/setup/measurement-test-permissions.sql","prisma/product/setup/unicode-disposable-provision.sql","prisma/product/setup/unicode-disposable-fixtures.sql",
 "tests/product-auth/measurement-constraints.integration.mjs","tests/product-auth/measurement-unicode.integration.mjs"];
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
function requirePrivateDirectory(dir){const st=lstatSync(dir);if(realpathSync(dir)!==dir||!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)!==0)throw Error();}
function privateRoot(env,existing){
 const raw=env.PRODUCT_UNICODE_DISPOSABLE_ROOT;if(typeof raw!=="string"||!isAbsolute(raw))throw Error();const root=resolve(raw);
 if(/[\r\n,\0]/u.test(root)||root===repo||root.startsWith(repo+sep))throw Error();requirePrivateDirectory(existing?root:dirname(root));return root;
}
function write(path,data){mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,data,{flag:"wx",mode:0o600});}
function readPrivate(path){const st=lstatSync(path);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077)!==0||st.size>1048576)throw Error();return readFileSync(path,"utf8");}
function contextSource(root,purpose,runId,folder){return `// Generated private disposable context; no database access.\nimport {readFileSync} from "node:fs";\nimport {realpathSync} from "node:fs";\nconst expected=${JSON.stringify({version:1,root,purpose,runId})};\nconst marker=JSON.parse(readFileSync("/run/stitchtrack-unicode-context.json","utf8"));\nif(JSON.stringify(marker)!==JSON.stringify(expected)||process.env.PRODUCT_UNICODE_DISPOSABLE_CONFIRMED!=="true"||process.env.PRODUCT_UNICODE_DISPOSABLE_RUN_ID!==expected.runId||process.env.PRODUCT_UNICODE_DISPOSABLE_PURPOSE!==expected.purpose||realpathSync(process.cwd())!==${JSON.stringify(join(root,folder))})throw new Error("Bound disposable companion context required.");\n`;}
const baselineConfig=`import "./disposable-context.ts";
import {defineConfig} from "prisma/config";
import {assertProductMigrationFiles,PRODUCT_MIGRATIONS} from "./migration-files.ts";
import {productMigrationConfig,productPrismaCommand} from "./targets.ts";
const command=productPrismaCommand(process.argv.slice(2));
const offline=command==="validate"||command==="generate";
assertProductMigrationFiles();
if(Object.keys(PRODUCT_MIGRATIONS).length!==8||Object.hasOwn(PRODUCT_MIGRATIONS,"20261108_measurement_label_unicode"))throw new Error("Exact eight-file bootstrap bundle required.");
const target=offline?undefined:productMigrationConfig();
if(target){
 if(process.env.NODE_ENV!=="test"||target.mode!=="test"||process.env.PRODUCT_UNICODE_EIGHT_BASELINE_CONFIRMED!=="true"||process.env.PRODUCT_MEASUREMENT_UNICODE_MIGRATION_CONFIRMED!==undefined)throw new Error("Separate eight-only bootstrap confirmation required; ninth activation forbidden.");
 for(const key of ["PRODUCT_PASSWORD_RESET_MIGRATION_CONFIRMED","PRODUCT_ADMIN_MIGRATION_CONFIRMED","PRODUCT_BUSINESS_MIGRATION_CONFIRMED","PRODUCT_CLIENT_MIGRATION_CONFIRMED","PRODUCT_MEASUREMENT_MIGRATION_CONFIRMED"])if(process.env[key]!=="true")throw new Error("Prior migration owner confirmations required.");
}
export default defineConfig({schema:"./schema.prisma",migrations:{path:"./migrations"},...(target?{datasource:{url:target.url}}:{})});
`;
export async function prepareUnicodeDisposable(env,options={}){
 if(env.PRODUCT_UNICODE_DISPOSABLE_CONFIRMED!=="true"||!["collision","success"].includes(env.PRODUCT_UNICODE_DISPOSABLE_PURPOSE))throw Error();
 const purpose=env.PRODUCT_UNICODE_DISPOSABLE_PURPOSE,root=privateRoot(env,false),pg=env.PRODUCT_UNICODE_POSTGRES_IMAGE,node=env.PRODUCT_UNICODE_NODE_IMAGE;
 if(!/^postgres:16(?:[.][0-9]+)?-bookworm@sha256:[0-9a-f]{64}$/u.test(pg??"")||!/^node:24-bookworm@sha256:[0-9a-f]{64}$/u.test(node??""))throw Error();
 assertProductMigrationFiles();const names=Object.keys(PRODUCT_MIGRATIONS);if(names.length!==9||names.at(-1)!==ninth)throw Error();
 const modules=realpathSync(join(repo,"node_modules")),runId=(options.uuid??randomUUID)(),secret=options.secret??(()=>randomBytes(32).toString("hex"));
 const passwords=[secret(),secret(),secret()];if(passwords.some(p=>!/^[0-9a-f]{64}$/u.test(p))||new Set(passwords).size!==3)throw Error();
 const fixtureIds=Array.from({length:9},()=> (options.uuid??randomUUID)());
 if(new Set([runId,...fixtureIds]).size!==10||[runId,...fixtureIds].some(v=>! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v)))throw Error();
 let fixtureHash;
 if(options.hashPassword)fixtureHash=await options.hashPassword(secret());
 else{await import("./register-server-only.mjs");const {hashPassword}=await import("../lib/auth/password.server.ts");fixtureHash=await hashPassword(secret());}
 if(!/^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22,}\$[A-Za-z0-9+/]{43,}$/u.test(fixtureHash))throw Error();
 mkdirSync(root,{mode:0o700});
 const checksums={},registry=readFileSync(join(repo,"prisma/product/migration-files.ts"),"utf8"),ninthLine='  "'+ninth+'": "'+PRODUCT_MIGRATIONS[ninth]+'",\n';
 if(registry.split(ninthLine).length!==2)throw Error();
 for(const folder of ["reviewed","baseline"]){
  mkdirSync(join(root,folder),{mode:0o700});
  for(const f of copyFiles){
   if(folder==="baseline"&&!["prisma/product/schema.prisma","prisma/product/targets.ts"].includes(f))continue;
   const bytes=readFileSync(join(repo,f));checksums[f]=hash(bytes);write(join(root,folder,f),bytes);
  }
  for(const n of names.filter(n=>folder==="reviewed"||n!==ninth)){
   const f="prisma/product/migrations/"+n+"/migration.sql",bytes=readFileSync(join(repo,f));if(hash(bytes)!==PRODUCT_MIGRATIONS[n])throw Error();write(join(root,folder,f),bytes);
  }
  for(const n of [".gitkeep","migration_lock.toml"])write(join(root,folder,"prisma/product/migrations",n),readFileSync(join(repo,"prisma/product/migrations",n)));
  write(join(root,folder,"prisma/product/disposable-context.ts"),contextSource(root,purpose,runId,folder));
  if(folder==="baseline"){
   write(join(root,folder,"prisma/product/migration-files.ts"),registry.replace(ninthLine,""));write(join(root,folder,"prisma/product/prisma.config.ts"),baselineConfig);
  }else{
   const config=join(root,folder,"prisma/product/prisma.config.ts");writeFileSync(config,'import "./disposable-context.ts";\n'+readFileSync(config,"utf8"),{mode:0o600});
  }
  symlinkSync(modules,join(root,folder,"node_modules"),"dir");
 }
 const [userA,userB,accountA,accountB,businessA,businessB,clientA,clientB,collisionVersion]=fixtureIds;
 const context={version:1,root,purpose,runId};write(join(root,"context.json"),JSON.stringify(context)+"\n");
 const plan={...context,postgresImage:pg,nodeImage:node,modules,containerName:"stitchtrack-unicode-"+purpose+"-"+runId,checksums,baselineMigrations:Object.fromEntries(names.filter(n=>n!==ninth).map(n=>[n,PRODUCT_MIGRATIONS[n]]))};
 write(join(root,"plan.json"),JSON.stringify(plan)+"\n");
 write(join(root,"plan.env"),Object.entries({UNICODE_ROOT:root,UNICODE_PURPOSE:purpose,UNICODE_RUN_ID:runId,UNICODE_CONTAINER_NAME:plan.containerName,UNICODE_POSTGRES_IMAGE:pg,UNICODE_NODE_IMAGE:node,UNICODE_MODULES:modules}).map(([k,v])=>k+"="+quote(v)).join("\n")+"\n");
 const url=new URL("postgresql://127.0.0.1:5432/stitchtrack_product_test?schema=product");url.username="stitchtrack_product_test_migrator";url.password=passwords[1];
 const common={NODE_ENV:"test",PRODUCT_DATABASE_MODE:"test",PRODUCT_DATABASE_CONFIRMED:"true",PRODUCT_MIGRATION_CONFIRMED:"true",PRODUCT_TEST_MIGRATION_DATABASE_URL:url.href,
  PRODUCT_UNICODE_DISPOSABLE_CONFIRMED:"true",PRODUCT_UNICODE_DISPOSABLE_RUN_ID:runId,PRODUCT_UNICODE_DISPOSABLE_PURPOSE:purpose,
  PRODUCT_PASSWORD_RESET_MIGRATION_CONFIRMED:"true",PRODUCT_ADMIN_MIGRATION_CONFIRMED:"true",PRODUCT_BUSINESS_MIGRATION_CONFIRMED:"true",PRODUCT_CLIENT_MIGRATION_CONFIRMED:"true",PRODUCT_MEASUREMENT_MIGRATION_CONFIRMED:"true"};
 const encode=o=>Object.entries(o).map(([k,v])=>k+"="+v).join("\n")+"\n";
 write(join(root,"baseline.env"),encode({...common,PRODUCT_UNICODE_EIGHT_BASELINE_CONFIRMED:"true"}));
 write(join(root,"proof.env"),encode({...common,PRODUCT_MEASUREMENT_UNICODE_PROOF_CONFIRMED:"true",PRODUCT_MEASUREMENT_CONSTRAINT_FIXTURES_CONFIRMED:"true",
  PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_A_ID:businessA,PRODUCT_MEASUREMENT_CONSTRAINT_BUSINESS_B_ID:businessB,PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_A_ID:clientA,PRODUCT_MEASUREMENT_CONSTRAINT_CLIENT_B_ID:clientB,
  PRODUCT_MEASUREMENT_UNICODE_RECEIPT_PATH:join(root,"proof-receipt.json"),...(purpose==="collision"?{PRODUCT_UNICODE_COLLISION_DISPOSABLE_INSTANCE_CONFIRMED:"true",PRODUCT_UNICODE_COLLISION_VERSION_ID:collisionVersion}:{})}));
 write(join(root,"fixtures.env"),encode({PRODUCT_UNICODE_DISPOSABLE_RUN_ID:runId,PRODUCT_UNICODE_DISPOSABLE_PURPOSE:purpose,
  PRODUCT_UNICODE_FIXTURE_USER_A:userA,PRODUCT_UNICODE_FIXTURE_USER_B:userB,PRODUCT_UNICODE_FIXTURE_ACCOUNT_A:accountA,PRODUCT_UNICODE_FIXTURE_ACCOUNT_B:accountB,
  PRODUCT_UNICODE_FIXTURE_BUSINESS_A:businessA,PRODUCT_UNICODE_FIXTURE_BUSINESS_B:businessB,PRODUCT_UNICODE_FIXTURE_CLIENT_A:clientA,PRODUCT_UNICODE_FIXTURE_CLIENT_B:clientB,
  PRODUCT_UNICODE_FIXTURE_HASH:fixtureHash,PRODUCT_UNICODE_COLLISION_VERSION_ID:collisionVersion}));
 for(const [file,pw]of [["admin-password",passwords[0]],["migrator-password",passwords[1]],["app-password",passwords[2]]])write(join(root,file),pw+"\n");
 write(join(root,"pgpass"),[["stitchtrack_unicode_bootstrap_admin",passwords[0]],["stitchtrack_product_test_migrator",passwords[1]],["stitchtrack_product_test_app",passwords[2]]].map(([role,pw])=>"127.0.0.1:5432:*:"+role+":"+pw).join("\n")+"\n");
 return {status:"prepared_not_executed",purpose,migrationCount:8,ninthAbsentFromBaseline:true,noDatabaseOperations:true};
}
export function checkUnicodeContainer(env){
 const root=privateRoot(env,true),plan=JSON.parse(readPrivate(join(root,"plan.json"))),id=readPrivate(join(root,"container.id")).trim();
 if(plan.root!==root||!["collision","success"].includes(plan.purpose)||! /^[0-9a-f]{64}$/u.test(id))throw Error();
 const inspectPath=resolve(env.PRODUCT_UNICODE_DISPOSABLE_INSPECT_PATH??"");if(!inspectPath.startsWith(root+sep))throw Error();
 const items=JSON.parse(readPrivate(inspectPath));if(!Array.isArray(items)||items.length!==1)throw Error();const x=items[0];
 const expect=(v,b)=>{if(JSON.stringify(v)!==JSON.stringify(b))throw Error();};
 expect(x.Id,id);expect(x.Config.Image,plan.postgresImage);expect(x.Name,"/"+plan.containerName);expect(x.Config.Labels?.["com.stitchtrack.unicode-disposable"],plan.runId+":"+plan.purpose);
 expect(x.State.Running,true);expect(x.HostConfig.NetworkMode,"none");expect(x.HostConfig.PublishAllPorts,false);expect(x.HostConfig.Privileged,false);expect(x.HostConfig.RestartPolicy.Name,"no");
 if(Object.keys(x.HostConfig.PortBindings??{}).length||x.HostConfig.PidMode||x.HostConfig.IpcMode!=="private")throw Error();
 const envs=Object.fromEntries(x.Config.Env.map(s=>[s.slice(0,s.indexOf("=")),s.slice(s.indexOf("=")+1)]));
 expect(envs.PGDATA,"/var/lib/postgresql/data");expect(envs.PG_MAJOR,"16");expect(envs.POSTGRES_INITDB_ARGS,"--encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256");
 expect(x.Config.Entrypoint,["docker-entrypoint.sh"]);expect(envs.POSTGRES_USER,"stitchtrack_unicode_bootstrap_admin");expect(envs.POSTGRES_DB,"postgres");expect(envs.POSTGRES_PASSWORD_FILE,"/run/stitchtrack-unicode/admin-password");
 if(envs.POSTGRES_PASSWORD||envs.POSTGRES_HOST_AUTH_METHOD==="trust")throw Error();
 expect(x.Config.Cmd,["postgres","-c","listen_addresses=127.0.0.1","-c","port=5432"]);
 const mounts=x.Mounts;if(!Array.isArray(mounts)||mounts.length!==2)throw Error();
 const data=mounts.find(m=>m.Destination==="/var/lib/postgresql/data"),privateMount=mounts.find(m=>m.Destination==="/run/stitchtrack-unicode");
 if(!data||data.Type!=="tmpfs"||!data.RW||!privateMount||privateMount.Type!=="bind"||privateMount.Source!==root||privateMount.RW)throw Error();
 return {status:"container_binding_verified",purpose:plan.purpose,noDatabaseOperations:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{let result;if(process.argv.length===3&&process.argv[2]==="--owner-prepare-unicode-disposable")result=await prepareUnicodeDisposable(process.env);
  else if(process.argv.length===3&&process.argv[2]==="--owner-check-unicode-container")result=checkUnicodeContainer(process.env);else throw Error();
  console.log(JSON.stringify(result));
 }catch{console.error('{"status":"refused","noAutomaticRetry":true,"noDatabaseOperations":true}');process.exitCode=1;}
}
