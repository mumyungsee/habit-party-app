const test=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('./backend-fixture.cjs');
test('실제 서버 코드: 새 PIN → 확인 → 인증 → 재조회 → 중복 방지 → 취소',()=>{
 const b=fixture();
 assert.equal(b.get().members.length,14);
 assert.equal(b.post({action:'setPin',memberId:'qa1',pin:'0123'}).ok,true);
 assert.equal(b.post({action:'verifyPin',memberId:'qa1',pin:'0123'}).ok,true);
 assert.equal(b.post({action:'verifyPin',memberId:'qa1',pin:'123'}).ok,false);
 const input={action:'checkin',memberId:'qa1',pin:'0123',done:true,expectedDay:1};
 assert.equal(b.post(input).ok,true); assert.equal(b.post(input).ok,true);
 assert.equal(b.get().checkins.length,1); assert.equal(b.get().checkins[0].done,true);
 assert.equal(b.post({...input,pin:'9999',done:false}).ok,false);
 assert.equal(b.get().checkins[0].done,true);
 assert.equal(b.post({...input,done:false}).ok,true); assert.equal(b.get().checkins[0].done,false);
});
test('실제 서버 코드: 서울 자정·최종일·종료 후 쓰기 금지',()=>{
 const b=fixture(); const input={action:'checkin',memberId:'qa2',pin:'0123',done:true};
 b.state.now='2026-09-06T23:59:59+09:00'; assert.equal(b.post(input).ok,false);
 b.state.now='2026-09-07T00:00:00+09:00'; assert.equal(b.post(input).day,1);
 b.state.now='2026-09-08T00:00:00+09:00'; assert.equal(b.post(input).day,2);
 b.state.now='2026-09-23T23:59:59+09:00'; assert.equal(b.post(input).day,17);
 b.state.now='2026-09-24T00:00:00+09:00'; assert.equal(b.post(input).ok,false);
 assert.deepEqual(b.get().checkins.map(c=>c.day),[1,2,17]);
});
