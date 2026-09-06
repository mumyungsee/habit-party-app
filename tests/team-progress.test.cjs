const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadProgressHelpers() {
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => {},
    innerWidth: 390,
    innerHeight: 844,
    localStorage: {},
    window: { addEventListener: () => {}, scrollTo: () => {} },
    document: {
      visibilityState: "visible",
      addEventListener: () => {},
      getElementById: () => ({ innerHTML: "" }),
      querySelectorAll: () => [],
    },
    Data: { load: () => new Promise(() => {}) },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(
    source + "\n;globalThis.__progress = { teamProgress, partyColumns };",
    context,
  );
  return context.__progress;
}

test("6명 팀은 3명부터 불꽃, 4명부터 빨간 불꽃, 6명은 전원 불꽃이다", () => {
  const { teamProgress } = loadProgressHelpers();
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map(done => teamProgress(done, 6).stage),
    ["empty", "lit", "lit", "warm", "hot", "hot", "blaze"],
  );
});

test("7명 팀은 4명부터 불꽃, 5명부터 빨간 불꽃, 7명은 전원 불꽃이다", () => {
  const { teamProgress } = loadProgressHelpers();
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map(done => teamProgress(done, 7).stage),
    ["empty", "lit", "lit", "lit", "warm", "hot", "hot", "blaze"],
  );
});

test("6명과 7명 파티는 모두 두 줄 안에 배치한다", () => {
  const { partyColumns } = loadProgressHelpers();
  assert.equal(partyColumns(6), 3);
  assert.equal(partyColumns(7), 4);
});
