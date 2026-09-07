const frame=document.getElementById('app'),results=document.getElementById('results');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(value,message)=>{if(!value)throw Error(message);};
let key;
const control=body=>fetch('/control?case='+key,{method:'POST',body:JSON.stringify(body||{})}).then(r=>r.json());
const doc=()=>frame.contentDocument;
async function until(fn,timeout=8000){for(let i=0;i<timeout/50;i++){if(fn())return;await pause(50);}throw Error('화면 대기 시간 초과');}
async function fresh(options={}){
 localStorage.removeItem('habitparty_me');localStorage.removeItem('habitparty_pin');
 key='case'+Date.now()+Math.random();await control(options);
 const loaded=new Promise(r=>frame.onload=r);frame.src='/?case='+key;await loaded;
 await until(()=>doc().querySelectorAll('.pick').length===14||doc().getElementById('pickList').textContent.includes('HP-'));
 // Isolate per-case credentials, including a previous automatic login.
 await pause(150);frame.contentWindow.logout();
}
async function pin(name='테스트2',digits='0123'){
 [...doc().querySelectorAll('.pick')].find(e=>e.textContent.includes(name+'참가자')||e.querySelector('.nm').textContent===name).click();
 digits.split('').forEach(n=>[...doc().querySelectorAll('.pin-key')].find(b=>b.textContent===n).click());
}
const entered=()=>doc().getElementById('s-today').classList.contains('active');
const done=()=>!!doc().querySelector('.done-tag');
document.getElementById('run').onclick=async()=>{
 document.getElementById('run').disabled=true;results.textContent='';let passed=0,failed=0;
 async function test(name,fn){try{await fn();passed++;results.textContent+='PASS '+name+'\n';}catch(e){failed++;results.textContent+='FAIL '+name+': '+e.message+'\n';}}
 await test('정확한 PIN 로그인 후 날짜 DOM 유지·7명 파티·17일 표',async()=>{await fresh();await pin();await until(entered);check(doc().getElementById('todayDate').textContent,'날짜 없음');check(doc().querySelectorAll('.pchip').length===7,'파티 인원');check(doc().querySelectorAll('#grid th').length===18,'일차 표');});
 await test('앞이 0인 신규 PIN 설정과 새로고침 자동 로그인',async()=>{await fresh();await pin('테스트1');await until(entered);check((await control()).data.members[0].hasPin,'PIN 미저장');const loaded=new Promise(r=>frame.onload=r);frame.contentWindow.location.reload();await loaded;await until(entered);});
 await test('잘못된 PIN은 네트워크 오류가 아닌 불일치',async()=>{await fresh();await pin('테스트2','9999');await until(()=>doc().getElementById('pinErr').textContent.includes('달라요'));check(!entered(),'잘못된 입장');});
 await test('연속 입력·사람 변경을 막아 PIN 요청은 한 번',async()=>{await fresh({fault:'slow-pin'});await pin();frame.contentWindow.pinPress('⌫');frame.contentWindow.pinPress('5');frame.contentWindow.choosePerson('qa3');await until(entered);check(doc().getElementById('meName').textContent==='테스트2','대상 혼선');check((await control()).calls.filter(x=>x==='verifyPin').length===1,'중복 요청');});
 await test('브라우저 저장 차단 상태에서도 로그인·인증',async()=>{await fresh();Object.defineProperty(frame.contentWindow,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}});await pin();await until(entered);doc().querySelector('.check').click();await until(done);});
 await test('PIN 저장 후 응답 유실 자동 확인·입장',async()=>{await fresh({fault:'pin-lost'});await pin('테스트1');await until(entered);check((await control()).calls.filter(x=>x==='setPin').length===1,'PIN 재설정');});
 await test('인증 연타 중복 방지·재접속 유지·취소',async()=>{await fresh();await pin();await until(entered);doc().querySelector('.check').click();doc().querySelector('.check').click();await until(done);check((await control()).data.checkins.length===1,'중복 행');await pause(100);doc().querySelector('.check').click();await until(()=>!done());check((await control()).data.checkins[0].done===false,'취소 미저장');});
 await test('인증 저장 응답 유실 시 재조회·중복 쓰기 없음',async()=>{await fresh();await pin();await until(entered);await control({fault:'check-lost'});doc().querySelector('.check').click();await until(done);check((await control()).calls.filter(x=>x==='checkin').length===1,'쓰기 재시도');});
 await test('자정 전날 완료 뒤 다음날 인증은 2일차 완료',async()=>{await fresh();await pin();await until(entered);doc().querySelector('.check').click();await until(done);await pause(100);await control({now:'2026-09-08T00:00:01+09:00'});doc().querySelector('.check').click();await until(()=>doc().querySelector('.big').textContent.includes('2일째')&&done());check((await control()).data.checkins.filter(x=>x.done).length===2,'다음날 인증 누락');});
 await test('종료 후 시작 안내 대신 종료 표시·과거 인증 유지',async()=>{await fresh({now:'2026-09-23T12:00:00+09:00'});await pin();await until(entered);doc().querySelector('.check').click();await until(done);await pause(100);await control({now:'2026-09-24T00:00:00+09:00'});doc().querySelector('.check').click();await until(()=>doc().querySelector('.big').textContent.includes('끝났어요'));check(doc().querySelectorAll('#grid td.done').length===1,'완료 기록 사라짐');check((await control()).calls.filter(x=>x==='checkin').length===1,'종료 후 쓰기');});
 await test('GET 장애에 오류 코드와 다시 불러오기 버튼',async()=>{await fresh({fault:'get-fail'});check(doc().getElementById('pickList').textContent.includes('HP-SERVER-01'),'오류 코드');check(!!doc().querySelector('#pickList button'),'재시도 없음');});
 await test('PIN 통신 실패와 화면 오류를 다른 코드로 구분',async()=>{await fresh({fault:'pin-fail'});await pin();await until(()=>doc().getElementById('pinErr').textContent.includes('HP-SERVER-01'));await fresh();doc().getElementById('todayDate').remove();await pin();await until(()=>doc().getElementById('pinErr').textContent.includes('HP-UI-01'));});
 await test('다른 기기에서 완료했어도 이전 화면의 완료 클릭은 취소하지 않는다',async()=>{await fresh();await pin();await until(entered);await control({complete:true});doc().querySelector('.check').click();await until(done);check((await control()).data.checkins[0].done===true,'타 기기 인증 취소');});
 await test('실제 15초 시간 초과 뒤 PIN 버튼 복구·재입장',async()=>{await fresh({fault:'timeout-pin'});await pin();await until(()=>doc().getElementById('pinErr').textContent.includes('HP-TIMEOUT-01'),20000);check(!doc().querySelector('.pin-key').disabled,'입력 잠김');await control({fault:''});'0123'.split('').forEach(n=>[...doc().querySelectorAll('.pin-key')].find(b=>b.textContent===n).click());await until(entered);});
 await test('모바일 390px·데스크톱 1100px에서 본문 가로 넘침 없음',async()=>{await fresh();await pin();await until(entered);for(const width of [390,1100]){frame.style.width=width+'px';await pause(100);check(doc().documentElement.scrollWidth<=width,'화면 넘침 '+width);}frame.style.width='390px';});
 results.textContent+=`RESULT ${passed} passed, ${failed} failed\n`;document.getElementById('run').disabled=false;
};
