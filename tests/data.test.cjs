const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadData(response, overrides = {}) {
  const values = new Map();
  const context = vm.createContext({
    console,
    AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => response }),
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    ...overrides,
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
  vm.runInContext(source + "\n;globalThis.__test = { Data, Store };", context);
  return { ...context.__test, values };
}

test("서버가 체크인을 거절하면 로컬 화면 상태도 바꾸지 않는다", async () => {
  const { Data, Store } = loadData({ ok: false, error: "unauthorized" });
  const member = { id: "m01" };
  Store.members = [member];

  await assert.rejects(() => Data.setMyCheck(member, 1, true, ""), /HP-PIN-01/);
  assert.equal(Store.checkins.length, 0);
});

test("서버 저장 성공 뒤에만 로컬 체크인 상태를 반영한다", async () => {
  const { Data, Store } = loadData({ ok: true, day: 1 });
  const member = { id: "m01" };
  Store.members = [member];

  await Data.setMyCheck(member, 1, true, "");
  assert.deepEqual(JSON.parse(JSON.stringify(Store.checkins)), [
    { memberId: "m01", day: 1, done: true, memo: "" },
  ]);
});

test("기존 체크인 변경이 거절되면 이전 상태를 유지한다", async () => {
  const { Data, Store } = loadData({ ok: false, error: "unauthorized" });
  const member = { id: "m01" };
  Store.members = [member];
  Store.checkins = [{ memberId: "m01", day: 1, done: false, memo: "기존" }];

  await assert.rejects(() => Data.setMyCheck(member, 1, true, "새 메모"), /HP-PIN-01/);
  assert.deepEqual(JSON.parse(JSON.stringify(Store.checkins)), [
    { memberId: "m01", day: 1, done: false, memo: "기존" },
  ]);
});

test("로그인 초기화가 같은 사이트의 다른 저장값은 지우지 않는다", () => {
  const { Data, values } = loadData({ ok: true });
  values.set("habitparty_me", "m01");
  values.set("habitparty_pin", "1234");
  values.set("pwaInstalled", "1");

  Data.clearMe();

  assert.equal(values.has("habitparty_me"), false);
  assert.equal(values.has("habitparty_pin"), false);
  assert.equal(values.get("pwaInstalled"), "1");
});

test("자정을 넘긴 저장 응답은 서버 일차에만 반영한다", async () => {
  const {Data,Store}=loadData({ok:true,day:2});
  await Data.setMyCheck({id:'m01'},1,true,'');
  assert.equal(Store.checkins[0].day,2); assert.equal(Store.challenge.today,2);
});
test("기기 저장소 차단은 로그인 성공을 실패로 바꾸지 않는다", async () => {
  const blocked=()=>{throw new Error('storage blocked');};
  const {Data}=loadData({ok:true},{localStorage:{getItem:blocked,setItem:blocked,removeItem:blocked}});
  assert.equal(await Data.verifyPin('m01','0123'),true);
  Data.setMe('m01'); assert.equal(Data.savedMe(),'m01');assert.equal(Data.savedPin(),'0123');
  Data.clearMe();assert.equal(Data.savedMe(),null);
});
test("HTTP 오류·깨진 JSON·통신 실패·시간 초과는 구분한다", async () => {
  for (const [fetchImpl,code] of [
    [async()=>({ok:false}), 'HP-SERVER-01'],
    [async()=>({ok:true,json:async()=>{throw new SyntaxError('bad json');}}),'HP-SERVER-01'],
    [async()=>{throw new TypeError('fetch failed');},'HP-NETWORK-01'],
    [async(_u,o)=>new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))),'HP-TIMEOUT-01'],
  ]) {
    const {Data}=loadData(null,{fetch:fetchImpl,setTimeout:fn=>setTimeout(fn,5)});
    await assert.rejects(()=>Data.load(),e=>e.code===code);
  }
});
test("PIN 저장 응답 유실 뒤 원래 PIN을 검증하고 쓰기를 반복하지 않는다",async()=>{
 const backend=require('./backend-fixture.cjs')();let writes=0;
 const {Data}=loadData(null,{fetch:async(_u,o)=>{
  if(o.method==='GET')return {ok:true,json:async()=>backend.get()};
  const p=JSON.parse(o.body),result=backend.post(p);
  if(p.action==='setPin'){writes++;throw new TypeError('lost response');}
  return {ok:true,json:async()=>result};
 }});
 await Data.load();assert.equal((await Data.setPin('qa1','0123')).ok,true);assert.equal(writes,1);
});

test('저장 전에 시작한 늦은 GET이 방금 저장한 인증을 덮어쓰지 않는다',async()=>{
 let finishGet;
 const {Data,Store}=loadData(null,{fetch:async(_url,options)=>options.method==='GET'
   ? new Promise(resolve=>finishGet=()=>resolve({ok:true,json:async()=>({ok:true,challenge:{today:1,totalDays:17},members:[],checkins:[]})}))
   : {ok:true,json:async()=>({ok:true,day:1})}});
 const loading=Data.load();await Data.setMyCheck({id:'qa1'},1,true,'');finishGet();await loading;
 assert.equal(Store.checkins.length,1);assert.equal(Store.checkins[0].done,true);
});
