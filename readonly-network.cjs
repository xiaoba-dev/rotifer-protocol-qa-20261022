const fs=require('node:fs');
function allow(method,url) {
  method=(method||'GET').toUpperCase();
  const ok=['GET','HEAD','OPTIONS'].includes(method);
  const u=new URL(url);
  if(process.env.ROTIFER_QA_NETWORK_LOG) fs.appendFileSync(process.env.ROTIFER_QA_NETWORK_LOG,JSON.stringify({method,host:u.host,path:u.pathname,decision:ok?'allowed-read':'blocked-write'})+'\n');
  if(!ok) throw new Error('QA network guard blocked non-read request');
}
const original=global.fetch;
if(original) global.fetch=function(input,init) {allow(init?.method||input?.method,typeof input==='string'||input instanceof URL?String(input):input.url);return original.call(this,input,init);};
for(const name of ['node:http','node:https']) {
 const mod=require(name),saved=mod.request;
 mod.request=function(...args) {
  const a=args[0],b=args[1];
  const opts=typeof a==='string'||a instanceof URL?(b&&typeof b==='object'?b:{}):a;
  const url=typeof a==='string'||a instanceof URL?String(a):(name==='node:https'?'https:':'http:')+'//'+(opts.hostname||opts.host||'localhost')+(opts.port?':'+opts.port:'')+(opts.path||'/');
  allow(opts.method,url);return saved.apply(this,args);
 };
 const get=mod.get;
 mod.get=function(...args){const r=mod.request(...args);r.end();return r;};
}
