const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const fixture=require('./backend-fixture.cjs');
test('전날 취소가 자정 뒤 도착해도 다음날 완료를 지우지 않는다',()=>{
 const b=fixture();b.post({action:'checkin',memberId:'qa2',pin:'0123',done:true,expectedDay:1});
 b.state.now='2026-09-08T00:00:01+09:00';
 b.post({action:'checkin',memberId:'qa2',pin:'0123',done:true,expectedDay:2});
 const r=b.post({action:'checkin',memberId:'qa2',pin:'0123',done:false,expectedDay:1});
 assert.equal(r.ok,false);assert.equal(r.error,'day changed');
 assert.equal(b.get().checkins.find(c=>c.day===2).done,true);
});
test('날짜 없는 구버전 취소는 거절하고 구버전 완료는 허용한다',()=>{
 const b=fixture(),p={action:'checkin',memberId:'qa2',pin:'0123'};
 assert.equal(b.post({...p,done:true}).ok,true);
 assert.equal(b.post({...p,done:false}).error,'client update required');
 assert.equal(b.get().checkins[0].done,true);
 assert.equal(b.post({...p,done:false,expectedDay:1}).ok,true);
});
test('날짜가 맞지 않는 완료와 잘못된 일차도 쓰지 않는다',()=>{
 for(const expectedDay of [0,18,'1',null,2]){const b=fixture();assert.equal(b.post({action:'checkin',memberId:'qa2',pin:'0123',done:true,expectedDay}).ok,false);assert.equal(b.get().checkins.length,0);}
});
test('운영과 QA 캐시는 서로 삭제하지 않는다',async()=>{
 for(const [file,current,old,other] of [['sw.js','habitparty-v5','habitparty-v3','habitparty-qa-v5'],['qa/app/sw.js','habitparty-qa-v5','habitparty-qa-v3','habitparty-v5']]){
  const h={},deleted=[];vm.runInNewContext(read(file),{URL,self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/habit-party-app/'},clients:{claim(){}},addEventListener:(n,f)=>h[n]=f},caches:{keys:async()=>[current,old,other,'unrelated'],delete:async k=>deleted.push(k)}});
  let task;h.activate({waitUntil:p=>task=p});await task;assert.deepEqual(deleted,[old]);
 }
});
test('운영 SW는 하위 QA 경로를 처리하지 않는다',()=>{
 const h={};vm.runInNewContext(read('sw.js'),{URL,fetch:async()=>({}),self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/habit-party-app/'},addEventListener:(n,f)=>h[n]=f}});
 h.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test/habit-party-app/qa/test.html'},respondWith:()=>assert.fail('QA intercepted')});
});
function updateHarness(controlled=true){
 const html=read('index.html'),code=html.slice(html.indexOf('if ("serviceWorker" in navigator)'),html.indexOf('const isIOS'));
 const events={},sw={};let safe=false,reloads=0;
 vm.runInNewContext(code,{window:{canApplyAppUpdate:()=>safe,addEventListener:(n,f)=>events[n]=f,location:{reload:()=>reloads++}},navigator:{serviceWorker:{controller:controlled?{}:null,register:async()=>({addEventListener(){}}),addEventListener:(n,f)=>sw[n]=f}},document:{addEventListener(){}}});
 events.load();return {events,sw,allow:()=>safe=true,reloads:()=>reloads};
}
test('SW 갱신은 저장/PIN 처리 종료 신호 뒤 한 번만 새로고침한다',()=>{
 const h=updateHarness();h.sw.controllerchange();assert.equal(h.reloads(),0);
 h.allow();h.events['habitparty:idle']();assert.equal(h.reloads(),1);
 h.events['habitparty:idle']();assert.equal(h.reloads(),1);
});
test('SW 최초 설치는 입력 중 화면을 새로고침하지 않는다',()=>{const h=updateHarness(false);h.allow();h.sw.controllerchange();assert.equal(h.reloads(),0);});

test('새 SW는 설치 때나 구버전 메시지로 기존 탭을 강제 교체하지 않는다',async()=>{
 const h={};let skips=0,task;
 vm.runInNewContext(read('sw.js'),{self:{addEventListener:(n,f)=>h[n]=f,skipWaiting:()=>skips++},caches:{open:async()=>({addAll:async()=>{}})}});
 h.install({waitUntil:p=>task=p});await task;h.message?.({data:'SKIP_WAITING'});assert.equal(skips,0);
});
