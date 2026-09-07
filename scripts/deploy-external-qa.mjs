import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const scriptId='16oezSZuo6Wf6WmHC7Iv4RQedJ7eUKrkNuKkol7fXuQTuROF1kcz7vdkE';
const sheetId='13GUN2g9A2W5qradrxRm4q6cKbEklxO7JQkS_j6nWXJo';
const entry=resolve(process.env.APPDATA,'npm/node_modules/@googleworkspace/cli/run-gws.js');
function gws(args,body){const r=spawnSync(process.execPath,[entry,...args,...(body?[ '--json',JSON.stringify(body)]:[])],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout||r.stderr);const o=JSON.parse(r.stdout);if(o.error)throw Error(JSON.stringify(o.error));return o;}
const params=['--params',JSON.stringify({scriptId})];
// Exact, previously created test project only. Production script and spreadsheet are never targets.
const current=gws(['script','projects','getContent',...params]);
if(!current.files.some(f=>f.name==='Code'))throw Error('Unexpected project');
if(!process.argv.includes('--publish')){console.log(JSON.stringify({scriptId,sheetId,files:current.files.map(f=>f.name)}));process.exit(0);}
let code=readFileSync('apps-script/Code.gs','utf8');
const needle='const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();';
if(!code.includes(needle))throw Error('Backend source changed');
code=code.replace(needle,`const SHEET_ID = "${sheetId}";`);
code=code.replace('function _json(obj) {','function _json(obj) {\n  obj.environment = "habit-party-qa-2026-09-07";');
const files=[{name:'Code',type:'SERVER_JS',source:code},{name:'appsscript',type:'JSON',source:JSON.stringify({timeZone:'Asia/Seoul',runtimeVersion:'V8',exceptionLogging:'STACKDRIVER',webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}})}];
gws(['script','projects','updateContent',...params],{files});
const readback=gws(['script','projects','getContent',...params]);
if(readback.files.find(f=>f.name==='Code').source.replace(/\r\n/g,'\n')!==code.replace(/\r\n/g,'\n'))throw Error('Readback mismatch');
const version=gws(['script','projects','versions','create',...params],{description:'External device QA - synthetic data only'});
const deploy=gws(['script','projects','deployments','create',...params],{versionNumber:version.versionNumber,manifestFileName:'appsscript',description:'External device QA - synthetic data only'});
console.log(JSON.stringify({scriptId,sheetId,version:version.versionNumber,deployment:deploy},null,2));
