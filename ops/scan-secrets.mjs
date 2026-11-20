import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const root=process.cwd();const hits=[];const skipDirs=new Set(['.git','node_modules','backups','report-storage']);
const binaryExt=new Set(['.png','.jpg','.jpeg','.gif','.webp','.pdf','.zip','.gz','.tgz','.woff','.woff2','.ttf','.ico']);
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(skipDirs.has(ent.name))continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else scan(p);}}
function scan(file){if(binaryExt.has(path.extname(file).toLowerCase()))return;let st;try{st=fs.statSync(file)}catch{return}if(st.size>2_000_000)return;let text;try{text=fs.readFileSync(file,'utf8')}catch{return}
  const rel=path.relative(root,file);const patterns=[
    ['openai_key',/sk-(?:svcacct-|proj-)?[A-Za-z0-9_-]{20,}/g],
    ['private_key_block',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['aws_access_key',/AKIA[0-9A-Z]{16}/g]
  ];
  for(const [kind,re] of patterns){for(const m of text.matchAll(re))hits.push({file:rel,kind,preview:String(m[0]).slice(0,18)+'…'});}
  if(!/\.example$/.test(rel)&&!/\.example\./.test(rel)){
    for(const name of ['OPENAI_API_KEY','RESEND_API_KEY','QPAY_CLIENT_SECRET','ACCESS_TOKEN_SECRET','PASSWORD_PEPPER','AUDIT_HASH_SALT','METRICS_TOKEN']){
      const re=new RegExp(`^${name}=([^\\r\\n]*)$`,'gm');for(const m of text.matchAll(re)){const v=m[1].trim().replace(/^['"]|['"]$/g,'');if(v&&!v.includes('$')&&!/^\.{3}$/.test(v)&&!/replace|change[-_ ]?me|example|development/i.test(v))hits.push({file:rel,kind:`literal_${name}`,preview:`${name}=…`});}
    }
  }
}
// File-backed stdout avoids captured-pipe incompatibilities in restricted runtimes.
// Git selection and every scan rule remain identical; nonzero/error results fail closed.
function gitVisibleFiles(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'businessmri-secret-list-'));
  const file=path.join(dir,'files');const fd=fs.openSync(file,'w',0o600);
  try{
    const result=spawnSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,stdio:['ignore',fd,'inherit']});
    if(result.error||result.status!==0)throw new Error('Unable to obtain complete Git file list');
    if(fs.statSync(file).size>64*1024*1024)throw new Error('Git file list exceeds scan bound');
    return fs.readFileSync(file,'utf8');
  }finally{fs.closeSync(fd);fs.rmSync(dir,{recursive:true,force:true});}
}
// --files-from accepts the exact NUL-delimited output of git ls-files for reproducible offline scans.
// Default: scan only what Git would push (tracked + untracked-but-not-ignored). `--all` also walks ignored local files (.env, logs).
if(process.argv.includes('--all'))walk(root);
else{const filesFrom=process.argv.indexOf('--files-from');const out=filesFrom>=0?fs.readFileSync(process.argv[filesFrom+1],'utf8'):gitVisibleFiles();for(const rel of out.split('\0')){if(rel&&fs.existsSync(path.join(root,rel)))scan(path.join(root,rel));}}
console.log(JSON.stringify({status:hits.length?'FAIL':'PASS',hits},null,2));if(hits.length)process.exit(1);
