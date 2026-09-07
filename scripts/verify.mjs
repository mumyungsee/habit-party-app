import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
function run(args){const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}
// Sequential, no browser/server/deployment side effects. Every test file is included.
for(const file of ['app.js','data.js','sw.js','qa/app/app.js','qa/app/data.js','qa/app/sw.js','qa/test.js'])run(['--check',file]);
run(['--test','--test-concurrency=1',...readdirSync(new URL('../tests/',import.meta.url)).filter(f=>f.endsWith('.test.cjs')).sort().map(f=>'tests/'+f)]);
console.log('Local checks passed. Browser/real Google/physical-device checks and deployment are NOT performed by this command.');
