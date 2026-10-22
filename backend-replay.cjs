const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rotifer-schema-qa-'));
const home=path.join(temp,'home');fs.mkdirSync(home);
const user=path.join(temp,'user.npmrc'),global=path.join(temp,'global.npmrc');fs.writeFileSync(user,'');fs.writeFileSync(global,'');
const env={...process.env,HOME:home,npm_config_userconfig:user,npm_config_globalconfig:global,npm_config_cache:path.join(temp,'cache'),DO_NOT_TRACK:'1',SUPABASE_TELEMETRY_DISABLED:'1'};
for(const k of Object.keys(env)) if(/TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE|DATABASE_URL|ROTIFER_CLOUD|SUPABASE_ACCESS/i.test(k)) delete env[k];
const result={source:'rotifer-protocol/rotifer-playground',commit:'e21eaac1aa3557bac1d0501457acfe8ec22dae34',cli_version:'2.121.0',scope:'Fresh local Supabase migration replay only; no cloud login, project link, remote database or product edits',commands:[],checks:[],migration_files:[]};
function scrub(s){return s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[local JWT omitted]').replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g,'[local key omitted]').replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[local connection string omitted]').replace(/^(.*(?:anon key|service.role key|secret key|publishable key|JWT secret|Secret|Publishable).*?)[│: ]+[A-Za-z0-9_\-.]{20,}.*$/gim,'[local key field omitted]');}
function run(label,cmd,args,cwd=temp,timeout=240000){const at=performance.now();const r=cp.spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:24*1024*1024});const output=scrub((r.stdout||'')+(r.stderr||''));result.commands.push({label,exit_code:r.status,error:r.error?.code||null,elapsed_ms:performance.now()-at,output});console.log('\nCOMMAND '+label+'\n'+output);return {...r,output};}
function check(name,passed,detail=null){result.checks.push({name,passed:Boolean(passed),detail});console.log(JSON.stringify({check:name,passed:Boolean(passed),detail}));}
let sb=null,work=null,network=false;
try{
 const upstream=path.join(temp,'upstream');
 let r=run('clone public source','git',['clone','--no-checkout','--filter=blob:none','https://github.com/rotifer-protocol/rotifer-playground.git',upstream]);if(r.status!==0)throw Error('Public source checkout prerequisite failed');
 r=run('pin tested source','git',['checkout','--detach',result.commit],upstream);if(r.status!==0)throw Error('Pinned public source unavailable');
 const files=fs.readdirSync(path.join(upstream,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
 for(const f of files){const data=fs.readFileSync(path.join(upstream,'supabase/migrations',f));result.migration_files.push({name:f,sha256:crypto.createHash('sha256').update(data).digest('hex')});}
 check('89 unchanged active migration files',files.length===89);
 const npm=path.join(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
 const tools=path.join(temp,'tools');
 r=run('install fixed official Supabase CLI',process.execPath,[npm,'install','--prefix',tools,'supabase@2.121.0','--no-audit','--no-fund']);if(r.status!==0)throw Error('CLI installation prerequisite failed');
 sb=path.join(tools,'node_modules/.bin/supabase');
 work=path.join(temp,'fresh-backend');fs.mkdirSync(work);
 r=run('generate fresh local config',sb,['init'],work);if(r.status!==0)throw Error('Fresh local configuration prerequisite failed');
 fs.cpSync(path.join(upstream,'supabase/migrations'),path.join(work,'supabase/migrations'),{recursive:true});
 const config=fs.readFileSync(path.join(work,'supabase/config.toml'),'utf8');
 check('original production project configuration not copied',/project_id\s*=\s*"fresh-backend"/.test(config) && !fs.existsSync(path.join(work,'supabase/.temp/project-ref')));
 r=run('create isolated Docker network','docker',['network','create','--internal','rotifer-qa-isolated']);network=r.status===0;if(!network)throw Error('Cannot enforce database egress isolation');
 // The DB, scheduled functions and their hooks cannot connect to production services.
 r=run('replay on fresh local Supabase stack',sb,['start','--network-id','rotifer-qa-isolated','--exclude','studio,logflare,vector,imgproxy,edge-runtime,realtime,supavisor,mailpit'],work,600000);
 result.replay_exit=r.status;result.last_migration=[...r.output.matchAll(/Applying migration (\S+\.sql)/g)].at(-1)?.[1]||null;
 check('fresh Supabase migration replay succeeds',r.status===0,{last_migration:result.last_migration});
 const containers=run('discover local database container','docker',['ps','-a','--format','{{.Names}}']);
 const db=containers.output.split('\n').find(x=>x.startsWith('supabase_db_'));
 if(db){
  const inspect=run('verify database network','docker',['inspect','--format','{{json .NetworkSettings.Networks}}',db]);
  check('database attached only to isolated network',inspect.status===0 && Object.keys(JSON.parse(inspect.output)).every(x=>x==='rotifer-qa-isolated'));
  const schema=run('inspect public replay objects','docker',['exec',db,'psql','-U','postgres','-d','postgres','-At','-c',"select 'auth_users='||(to_regclass('auth.users') is not null)::text; select 'genes='||(to_regclass('public.genes') is not null)::text; select 'profiles='||(to_regclass('public.profiles') is not null)::text; select 'seasons='||(to_regclass('public.seasons') is not null)::text; select count(*) from supabase_migrations.schema_migrations;"]);
  result.schema_probe=schema.output;
 }
}catch(e){check('replay setup completed',false,String(e));}
finally{
 if(sb&&work)run('stop disposable local stack',sb,['stop','--no-backup'],work,120000);
 if(network)run('remove disposable network','docker',['network','rm','rotifer-qa-isolated']);
 result.finished_at_utc=new Date().toISOString();result.passed=result.checks.length>0&&result.checks.every(x=>x.passed);
 console.log('ROTIFER_SCHEMA_QA_RESULT_BEGIN\n'+JSON.stringify(result)+'\nROTIFER_SCHEMA_QA_RESULT_END');
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'# Isolated backend replay\n\n'+result.checks.map(x=>'- '+(x.passed?'PASS':'FAIL')+' '+x.name).join('\n')+'\n\nNo remote database or product source was modified.\n');
 if(!result.passed)process.exitCode=1;
}
