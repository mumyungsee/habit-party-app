const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('테스트 화면 로직은 운영 원본과 동일하다',()=>{
 assert.equal(read('qa/app/app.js'),read('app.js'));
 assert.equal(read('qa/app/style.css'),read('style.css'));
});
test('테스트 데이터·로그인·캐시·설치는 운영과 분리된다',()=>{
 const source=read('data.js'),built=read('qa/app/data.js');
 const prod=source.match(/const API_URL = "([^"]+)"/)[1];
 assert.equal(built.includes(prod),false);
 assert.match(built,/habitparty_qa_me/);assert.match(built,/habitparty_qa_pin/);
 assert.match(built,/d.environment !== "habit-party-qa-2026-09-07"/);
 // Actual cache deletion boundaries are exercised by safety-boundaries.test.cjs.
 assert.match(read('qa/app/sw.js'),/const CACHE = "habitparty-qa-v5"/);
 const manifest=JSON.parse(read('qa/app/manifest.json'));assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
});
test('운영 현황은 GET만 사용하고 자동 점검 계정은 qa02로 고정한다',()=>{
 assert.equal(read('qa/operator.js').includes('method: "POST"'),false);
 const code=read('qa/test.js');assert.match(code,/item.id === 'qa02'/);assert.equal(code.includes('resetTestCheckins'),false);
});
