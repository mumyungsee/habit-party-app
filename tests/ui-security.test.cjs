const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("참가자 입력값을 HTML이 아닌 글자로 표시한다", () => {
  const pickList = { innerHTML: "" };
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
      getElementById: (id) => id === "pickList" ? pickList : { innerHTML: "" },
      querySelectorAll: () => [],
    },
    Data: { load: () => new Promise(() => {}) },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(source + "\n;globalThis.__escapeHtml = escapeHtml;", context);

  assert.equal(
    context.__escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
  );
});

test("서버에서 PIN이 초기화된 저장 로그인은 자동 입장하지 않고 지운다", async () => {
  let cleared = false;
  const pickList = { innerHTML: "" };
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
      getElementById: (id) => id === "pickList" ? pickList : { innerHTML: "" },
      querySelectorAll: () => [],
    },
    Data: {
      load: () => new Promise(() => {}),
      savedMe: () => "m01",
      savedPin: () => "0123",
      member: () => ({ id: "m01" }),
      verifyPin: async () => false,
      clearMe: () => { cleared = true; },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(source + "\n;globalThis.__verifiedSavedMemberId = verifiedSavedMemberId;", context);

  assert.equal(await context.__verifiedSavedMemberId(), null);
  assert.equal(cleared, true);
});
