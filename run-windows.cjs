const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = __dirname;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rotifer-qa-'));
const home = path.join(temp, 'home');
fs.mkdirSync(home);
const userConfig = path.join(temp, 'user.npmrc');
const globalConfig = path.join(temp, 'global.npmrc');
fs.writeFileSync(userConfig, '');
fs.writeFileSync(globalConfig, '');
const env = {...process.env, HOME: home, USERPROFILE: home,
  npm_config_cache: path.join(temp, 'cache'), npm_config_userconfig: userConfig,
  npm_config_globalconfig: globalConfig, npm_config_registry: 'https://registry.npmjs.org',
  ROTIFER_AUTO_PUBLISH: '0', ROTIFER_TELEMETRY: '0', DO_NOT_TRACK: '1',
  ROTIFER_NO_UPDATE_CHECK: '1', FORCE_COLOR: '0',
  NODE_OPTIONS: '--require=' + JSON.stringify(path.join(root, 'readonly-network.cjs'))};
// Do not pass developer or service credentials into the package under test.
for (const name of Object.keys(env)) {
  if (/(?:TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE|DATABASE_URL|SUPABASE|ROTIFER_CLOUD)/i.test(name)) delete env[name];
}
env.ROTIFER_QA_NETWORK_LOG = path.join(temp, 'network.jsonl');
const report = {package: '@rotifer/playground@0.30.0', platform: process.platform,
  arch: process.arch, node: process.version, scope: 'Fresh npm install and basic CLI/native journey; no remote protocol writes',
  started_at_utc: new Date().toISOString(), checks: [], commands: []};
function check(name, passed, details = null) {
  report.checks.push({name, passed: Boolean(passed), details});
  console.log(JSON.stringify({check: name, passed: Boolean(passed), details}));
}
function run(label, args, cwd = temp, timeout = 120000) {
  const start = performance.now();
  const r = cp.spawnSync(process.execPath, args, {cwd, env, encoding: 'utf8', timeout, maxBuffer: 8*1024*1024});
  const output = (r.stdout || '') + (r.stderr || '');
  report.commands.push({label, args, exit_code: r.status, signal: r.signal,
    harness_error: r.error?.code || null, elapsed_ms: performance.now() - start, output});
  console.log('\nCOMMAND ' + label + '\n' + output);
  return {...r, output};
}
function objectOutput(text, agent = false) {
  const marker = agent ? 'Final output:' : 'Output:';
  const at = text.lastIndexOf(marker);
  if (at < 0) return null;
  const rest = text.slice(at + marker.length);
  const start = rest.indexOf('{');
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i=start; i<rest.length; i++) {
    const c=rest[i];
    if (quoted) {if (escaped) escaped=false; else if (c==='\\') escaped=true; else if (c==='"') quoted=false;}
    else if (c==='"') quoted=true;
    else if (c==='{') depth++;
    else if (c==='}' && --depth===0) {try {return JSON.parse(rest.slice(start,i+1));} catch {return null;}}
  }
  return null;
}
try {
  check('Windows x64 Node 22.19.0', process.platform==='win32' && process.arch==='x64' && process.version==='v22.19.0');
  for (const f of require('./fixtures/manifest.json').files) {
    check('fixture digest ' + f.path, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex')===f.sha256);
  }
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const tools = path.join(temp, 'tools');
  const install = run('fresh official npm install', [npm,'install','--prefix',tools,'@rotifer/playground@0.30.0','--no-audit','--no-fund'], temp, 240000);
  check('official npm install', install.status===0);
  if (install.status!==0) throw new Error('Official package installation failed; subsequent journey cannot run');
  const pkg = path.join(tools,'node_modules/@rotifer/playground');
  const cli = path.join(pkg,'dist/index.js');
  const invoke = (label,args,cwd=temp) => run(label,[cli,...args],cwd);
  const version=invoke('version',['--version']);
  check('CLI version 0.30.0',version.status===0 && version.output.includes('0.30.0'));
  const addonDir=path.join(tools,'node_modules/@rotifer/playground-win32-x64-msvc');
  check('matching Windows addon installed',fs.existsSync(path.join(addonDir,'package.json')) && JSON.parse(fs.readFileSync(path.join(addonDir,'package.json'))).version==='0.30.0');
  const binding=require(path.join(pkg,'dist/utils/binding.js')).tryLoadBinding();
  check('actual native binding loads',Boolean(binding) && typeof binding.executeGene==='function');
  const init=invoke('default init',['init','workspace']);
  const ws=path.join(temp,'workspace');
  check('default workspace initializes',init.status===0 && fs.existsSync(path.join(ws,'rotifer.json')));
  for (const n of ['qa-add','qa-double']) fs.cpSync(path.join(root,'fixtures',n),path.join(ws,'genes',n),{recursive:true});
  const runNative=(label,agent=false) => {
    const r=invoke(label,agent?['agent','run','qa-single','--input','{"value":2}','--verbose']:['run','qa-add','--input','{"value":2}','--verbose'],ws);
    check(label,r.status===0 && objectOutput(r.output,agent)?.value===3 && /WASM sandbox/.test(r.output) && !/WASM sandbox unavailable|Running via Node\.js/.test(r.output));
    return r;
  };
  runNative('single Gene actual WASM');
  check('create single Agent',invoke('create single Agent',['agent','create','qa-single','--genes','qa-add'],ws).status===0);
  runNative('single Agent actual WASM',true);
  check('create Seq Agent',invoke('create Seq Agent',['agent','create','qa-seq','--genes','qa-add','qa-double','--composition','Seq'],ws).status===0);
  const seq=invoke('Seq actual WASM',['agent','run','qa-seq','--input','{"value":2}','--verbose'],ws);
  check('Seq arithmetic output and WASM',seq.status===0 && objectOutput(seq.output,true)?.value===6 && /WASM sandbox/.test(seq.output) && !/Running via Node\.js/.test(seq.output));
  const exported=invoke('Genome export',['genome','export','qa-single','-o','qa-single.rgenome'],ws);
  const genomePath=path.join(ws,'qa-single.rgenome');
  check('Genome exports through official CLI',exported.status===0 && fs.existsSync(genomePath));
  if (fs.existsSync(genomePath)) report.exported_genome=JSON.parse(fs.readFileSync(genomePath,'utf8'));
  const quality=invoke('known #453 recommended template',['hello','--template','quality-advisor'],ws);
  check('known #453 reproduced or explicitly changed',quality.status===1 && /gene-health-scanner/.test(quality.output),{known_issue:453});
  const security=invoke('known #454 fallback result',['hello','--template','code-security'],ws);
  check('known #454 reproduced or explicitly changed',security.status===0 && /EISDIR/.test(security.output) && /Execution complete/.test(security.output),{known_issue:454});
  const config=path.join(ws,'rotifer.json'),saved=fs.readFileSync(config);
  fs.writeFileSync(config,'{broken');
  const malformed=invoke('known #456 malformed config',['list'],ws);
  check('known #456 reproduced or explicitly changed',malformed.status!==0 && /SyntaxError/.test(malformed.output),{known_issue:456});
  fs.writeFileSync(config,saved);
  runNative('normal execution after config restoration');
  report.compile_scope='No Windows Javy toolchain was supplied. This verifies execution of portable real Javy WASM, not Windows compilation or the full source suite.';
} catch (error) {check('journey completed without harness exception',false,String(error));}
finally {
  report.finished_at_utc=new Date().toISOString();
  report.network=fs.existsSync(env.ROTIFER_QA_NETWORK_LOG)?fs.readFileSync(env.ROTIFER_QA_NETWORK_LOG,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
  report.passed=report.checks.every(x=>x.passed);
  fs.mkdirSync(path.join(root,'results'),{recursive:true});
  fs.writeFileSync(path.join(root,'results/windows.json'),JSON.stringify(report,null,2));
  console.log('ROTIFER_QA_RESULT_BEGIN\n'+JSON.stringify(report)+'\nROTIFER_QA_RESULT_END');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '# Rotifer 0.30.0 independent Windows QA\n\n'+report.checks.map(x=>'- '+(x.passed?'PASS':'FAIL')+' '+x.name).join('\n')+'\n\n'+(report.compile_scope||'')+'\n');
  if (!report.passed) process.exitCode=1;
}
