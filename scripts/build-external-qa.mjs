import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),safety=require('../qa/safety.js');
const production=readFileSync('data.js','utf8').match(/const API_URL = "([^"]+)"/)[1];
const endpoint=safety.assertSafeEndpoint(process.argv[2],production);
const version='app-'+execFileSync('git',['hash-object','app.js'],{encoding:'utf8'}).trim().slice(0,8);
mkdirSync('qa/app',{recursive:true});
for(const file of ['app.js','data.js','index.html','sw.js','style.css','manifest.json']){
 let text=readFileSync(file,'utf8');
 if(file==='data.js')text=text.replace(production,endpoint).replaceAll('"habitparty_me"','"habitparty_qa_me"').replaceAll('"habitparty_pin"','"habitparty_qa_pin"').replace('const d = await _get();','const d = await _get();\n    if (d.environment !== "habit-party-qa-2026-09-07") throw requestError("HP-SERVER-01");');
 if(file==='sw.js')text=text.replaceAll('habitparty-','habitparty-qa-');
 if(file==='index.html')text=text.replace('<title>습관파티</title>','<title>습관파티 · 테스트 전용</title>').replace('<div class="app">',`<aside style="background:#fff2c6;padding:12px;text-align:center">테스트 전용 · 실제 참가자 기록과 분리됨 · 화면 기준 ${version}<br><a href="../">운영 도구로 돌아가기</a></aside><div class="app">`).replaceAll('"pwaInstalled"','"pwaQaInstalled"');
 if(file==='manifest.json'){const m=JSON.parse(text);m.name='습관파티 테스트';m.short_name='파티 테스트';m.id='./';m.start_url='./';m.scope='./';text=JSON.stringify(m,null,2);}
 writeFileSync('qa/app/'+file,text);
}
for(const file of ['icon-192.png','icon-512.png','icon-512-maskable.png'])copyFileSync(file,'qa/app/'+file);
writeFileSync('qa/config.js',`window.HABIT_PARTY_QA_CONFIG = Object.freeze(${JSON.stringify({productionApiUrl:production,stagingApiUrl:endpoint,sourceVersion:version},null,2)});\n`);
console.log('QA generated from '+version+'; production application files unchanged');
