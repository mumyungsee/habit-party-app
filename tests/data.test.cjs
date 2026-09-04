const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadData(response) {
  const values = new Map();
  const context = vm.createContext({
    console,
    fetch: async () => ({ json: async () => response }),
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
  vm.runInContext(source + "\n;globalThis.__test = { Data, Store };", context);
  return { ...context.__test, values };
}

test("서버가 체크인을 거절하면 로컬 화면 상태도 바꾸지 않는다", async () => {
  const { Data, Store } = loadData({ ok: false, error: "unauthorized" });
  const member = { id: "m01" };
  Store.members = [member];

  await assert.rejects(() => Data.setMyCheck(member, 1, true, ""), /unauthorized/);
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

  await assert.rejects(() => Data.setMyCheck(member, 1, true, "새 메모"), /unauthorized/);
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
