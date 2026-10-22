// Dedicated-node QA only. Never reads a personal Rotifer HOME or credential file.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const role=process.argv[2],bootstrap=process.argv[3]||'';
const harness=process.argv.includes('--loopback-harness');
if(!['A','B'].includes(role)){console.error('Usage: node p2p-node.cjs A | node p2p-node.cjs B <A-public-multiaddr>');process.exit(2);}
const major=Number(process.versions.node.split('.')[0]),minor=Number(process.versions.node.split('.')[1]);
if(major<22||(major===22&&minor<18))throw Error('Node >=22.18 is required; use an existing supported runtime.');
function publicIPv4(ip){const p=ip.split('.').map(Number);return p.length===4&&p.every(x=>Number.isInteger(x)&&x>=0&&x<=255)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&p[1]===168)&&!(p[0]===100&&p[1]>=64&&p[1]<=127);}
if(role==='B'){
 const m=bootstrap.match(/^\/ip4\/([0-9.]+)\/tcp\/(\d+)\/p2p\/([A-Za-z0-9]+)$/);
 if(!m||(!harness&&!publicIPv4(m[1]))||Number(m[2])<1024||Number(m[2])>65535)throw Error('B requires the exact public IPv4 multiaddr printed by controlled node A.');
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rotifer-public-qa-'+role+'-'));
const home=path.join(temp,'home');fs.mkdirSync(home);
const u=path.join(temp,'user.npmrc'),g=path.join(temp,'global.npmrc');fs.writeFileSync(u,'');fs.writeFileSync(g,'');
const env={...process.env,HOME:home,USERPROFILE:home,npm_config_userconfig:u,npm_config_globalconfig:g,npm_config_cache:path.join(temp,'cache'),ROTIFER_AUTO_PUBLISH:'0',ROTIFER_TELEMETRY:'0',DO_NOT_TRACK:'1',ROTIFER_NO_UPDATE_CHECK:'1',FORCE_COLOR:'0'};
for(const k of Object.keys(env))if(/TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE|DATABASE_URL|SUPABASE|ROTIFER_CLOUD/i.test(k))delete env[k];
delete env.NODE_OPTIONS;
const port=Number(process.env.ROTIFER_QA_P2P_PORT||41111);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Test port must be 1024..65535');
const report={role,scope:harness?'loopback harness validation only':'two user-controlled public nodes',package:'@rotifer/playground@0.30.0',platform:process.platform,arch:process.arch,node:process.version,started_at_utc:new Date().toISOString(),checks:[],samples:[],commands:[]};
report.interrupted=false;
let cli=null,ws=null,stopped=false;
function run(label,args,cwd=temp){const at=performance.now();const r=cp.spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});report.commands.push({label,exit_code:r.status,error:r.error?.code||null,elapsed_ms:performance.now()-at,output:(r.stdout||'')+(r.stderr||'')});if(r.status!==0)console.error(label+' failed; see the test report.');return r;}
function invoke(label,args){return run(label,[cli,...args],ws);}
function check(name,passed,detail=null){report.checks.push({name,passed:Boolean(passed),detail});console.log(JSON.stringify({check:name,passed:Boolean(passed),detail}));}
function state(){return JSON.parse(fs.readFileSync(path.join(home,'.rotifer/daemon.json'),'utf8'));}
async function control(route){const s=state();const r=await fetch('http://127.0.0.1:'+s.port+route,{headers:{'x-rotifer-token':s.token},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Owned daemon control returned '+r.status);return r.json();}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function stop(){if(stopped)return;stopped=true;if(cli&&ws)invoke('stop owned daemon',['network','stop']);}
process.on('SIGINT',()=>{report.interrupted=true;stop();process.exitCode=130;});
process.on('SIGTERM',()=>{report.interrupted=true;stop();process.exitCode=143;});
(async()=>{
 try{
  if(role==='B'){
   const m=bootstrap.match(/^\/ip4\/([0-9.]+)\/tcp\/(\d+)/);
   const reachable=await new Promise(resolve=>{const s=require('node:net').connect({host:m[1],port:Number(m[2])});let done=false;const end=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.setTimeout(5000,()=>end(false));s.once('connect',()=>end(true));s.once('error',()=>end(false));});
   check('controlled A TCP port reachable',reachable);if(!reachable)throw Error('Routing/firewall prerequisite failed; no protocol-level conclusion.');
  }
  if(harness&&process.env.ROTIFER_QA_EXISTING_CLI){cli=process.env.ROTIFER_QA_EXISTING_CLI;report.reused_official_cli_for_harness=true;}
  else{
   const npm=path.join(path.dirname(process.execPath),process.platform==='win32'?'node_modules/npm/bin/npm-cli.js':'../lib/node_modules/npm/bin/npm-cli.js');
   const tools=path.join(temp,'tools');const r=run('fresh official npm install',[npm,'install','--prefix',tools,'@rotifer/playground@0.30.0','--no-audit','--no-fund']);if(r.status!==0)throw Error('npm installation prerequisite failed');cli=path.join(tools,'node_modules/@rotifer/playground/dist/index.js');
  }
  const init=run('isolated workspace init',[cli,'init','workspace','--no-genesis']);if(init.status!==0)throw Error('Workspace init failed');ws=path.join(temp,'workspace');
  const base='https://raw.githubusercontent.com/xiaoba-dev/rotifer-protocol-qa-20261022/803bb6247d4ec907774fb963b53681f717c9df83/fixtures/';
  const mf=await fetch(base+'manifest.json',{signal:AbortSignal.timeout(20000)});if(!mf.ok)throw Error('Fixture manifest download failed');const manifest=await mf.json();
  const dest=path.join(ws,'genes/qa-add');fs.mkdirSync(dest,{recursive:true});
  for(const name of ['index.ts','phenotype.json','gene.ir.wasm']){
   const expected=manifest.files.find(x=>x.path==='fixtures/qa-add/'+name);if(!expected)throw Error('Missing fixture digest');
   const r=await fetch(base+'qa-add/'+name,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Fixture download failed');const data=Buffer.from(await r.arrayBuffer());if(crypto.createHash('sha256').update(data).digest('hex')!==expected.sha256)throw Error('Fixture checksum mismatch');fs.writeFileSync(path.join(dest,name),data);
  }
  const args=['network','start','--host',harness?'127.0.0.1':'0.0.0.0','--port',String(port)];if(role==='B')args.push('--bootstrap',bootstrap);
  const started=invoke('start controlled node',args);if(started.status!==0)throw Error('Native P2P daemon could not start');
  let status=await control('/status');const peer=status.peerId;check('real P2P daemon started',Boolean(peer));
  let ip='127.0.0.1';
  if(!harness){ip=process.env.ROTIFER_QA_PUBLIC_IP||'';if(!ip){const r=await fetch('https://api.ipify.org',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Public IP lookup failed');ip=(await r.text()).trim();}if(!publicIPv4(ip))throw Error('No valid public IPv4 detected; set ROTIFER_QA_PUBLIC_IP on this controlled node.');}
  report.public_multiaddr='/ip4/'+ip+'/tcp/'+port+'/p2p/'+peer;
  console.log('NODE_'+role+'_ADDRESS='+report.public_multiaddr);
  console.log(role==='A'?'Keep this terminal open; start B with the A address above.':'Only the supplied controlled A peer is bootstrapped.');
  const lifetime=harness?(role==='A'?90000:60000):(role==='A'?600000:150000),at=Date.now();let restarted=false,lastAnnounce=0,restartedAt=null,recoveryAt=null;
  while(!stopped&&Date.now()-at<lifetime){
   status=await control('/status');const received=await control('/received');report.samples.push({at_ms:Date.now()-at,peerId:status.peerId,peers:status.peers,received_count:(received.announcements||[]).length});
   if(status.peers>0&&Date.now()-lastAnnounce>(harness?3000:15000)){invoke('announce synthetic Gene',['network','announce','qa-add']);lastAnnounce=Date.now();}
   if(role==='B'&&!restarted&&Date.now()-at>(harness?12000:60000)){
    const old=state();invoke('stop B before reconnect',['network','stop']);
    const deadline=Date.now()+5000;let alive=true;
    while(Date.now()<deadline){try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH'){alive=false;break;}throw e;}await sleep(100);}
    check('previous owned daemon terminates before restart',!alive);if(alive)throw Error('Old daemon is still live; refusing to start another');
    const cfg=path.join(home,'.rotifer/network.json');const saved=JSON.parse(fs.readFileSync(cfg,'utf8'));saved.bootstrap_peers=[];fs.writeFileSync(cfg,JSON.stringify(saved),{mode:0o600});
    const r=invoke('restart B using own peerstore',['network','start','--host',harness?'127.0.0.1':'0.0.0.0','--port',String(port)]);check('B restarted',r.status===0);const again=await control('/status');check('identity preserved across restart',again.peerId===peer);restarted=true;restartedAt=Date.now()-at;
   }
   if(role==='B'&&restarted&&!recoveryAt&&Date.now()-at>(harness?40000:120000)){
    const actual=report.samples.some(x=>x.at_ms>restartedAt&&x.received_count>0);check('peerstore restart exchanges a fresh announcement',actual);
    if(!actual){invoke('stop B for explicit-bootstrap control',['network','stop']);await sleep(500);const r=invoke('explicit-bootstrap recovery control',['network','start','--host',harness?'127.0.0.1':'0.0.0.0','--port',String(port),'--bootstrap',bootstrap]);check('explicit-bootstrap recovery started',r.status===0);}
    recoveryAt=Date.now()-at;
   }
   await sleep(harness?1000:3000);
  }
  check('completed observation window',!report.interrupted&&!stopped&&Date.now()-at>=lifetime);
  check('peer connection observed',report.samples.some(x=>x.peers>0));check('received peer Gene announcement',report.samples.some(x=>x.received_count>0));
  if(role==='B'&&recoveryAt)check('post-restart data exchange observed',report.samples.some(x=>x.at_ms>recoveryAt&&x.received_count>0));
  const search=invoke('record current search capability',['network','search','qa-add']);report.search_capability=/not yet available/.test((search.stdout||'')+(search.stderr||''))?'Explicitly unavailable in published CLI; no search-correctness claim':'Inspect recorded actual output';
 }catch(e){check('node journey completed',false,String(e));}
 finally{
  stop();report.finished_at_utc=new Date().toISOString();report.passed=report.checks.length>0&&report.checks.every(x=>x.passed);
  const out=path.resolve('rotifer-p2p-'+role+'-report.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log('REPORT='+out);console.log('SUMMARY='+JSON.stringify({role,scope:report.scope,passed:report.passed,checks:report.checks}));
  if(!report.passed)process.exitCode=1;
 }
})();
