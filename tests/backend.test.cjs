const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackend(nowIso) {
  const written = [];
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [nowIso]));
    }
    static now() { return new NativeDate(nowIso).getTime(); }
  }
  const context = vm.createContext({
    Date: nowIso ? FixedDate : NativeDate,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getId: () => "sheet-id" }),
      openById: () => ({
        getSheetByName: () => ({
          getRange: () => ({ setValue: (value) => written.push(value) }),
        }),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    Utilities: {},
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() { return this; },
      }),
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
  vm.runInContext(source, context);
  return { context, written };
}

test("PIN이 아직 없으면 빈 PIN도 인증하지 않는다", () => {
  const { context } = loadBackend();
  context._findMemberRow = () => ({ row: 2, pinCol: 7, pin: "" });

  const result = context._verifyPin("m01", "");
  assert.equal(result.ok, false);
});

test("서버에서도 숫자 네 자리 PIN만 설정한다", () => {
  const { context, written } = loadBackend();
  context._findMemberRow = () => ({ row: 2, pinCol: 7, pin: "" });

  const result = context._setPin("m01", "12");
  assert.equal(result.ok, false);
  assert.equal(written.length, 0);
});

test("앞이 0인 숫자 네 자리 PIN을 그대로 저장하고 확인한다", () => {
  const { context, written } = loadBackend();
  context._findMemberRow = () => ({ row: 2, pinCol: 7, pin: "" });

  const setResult = context._setPin("m01", "0123");
  assert.equal(setResult.ok, true);
  assert.deepEqual(written, ["'0123"]);

  context._findMemberRow = () => ({ row: 2, pinCol: 7, pin: "'0123" });
  assert.equal(context._verifyPin("m01", "0123").ok, true);
  assert.equal(context._verifyPin("m01", "1234").ok, false);
});

test("체크인 완료값은 참·거짓만 받는다", () => {
  const { context } = loadBackend();
  const result = context._checkin("m01", "0123", "TRUE", "");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "invalid done" });
});

test("서울 시간 기준 9월 7일은 1일 차이고 인증 기간은 17일이다", () => {
  const before = loadBackend("2026-09-06T12:00:00+09:00").context;
  const start = loadBackend("2026-09-07T12:00:00+09:00").context;
  const end = loadBackend("2026-09-23T12:00:00+09:00").context;
  const after = loadBackend("2026-09-24T12:00:00+09:00").context;

  assert.equal(before._challengeState().canCheckIn, false);
  assert.equal(before._todayDay(), 1);
  assert.equal(start._todayDay(), 1);
  assert.equal(start._challengeState().canCheckIn, true);
  assert.equal(end._todayDay(), 17);
  assert.equal(end._challengeState().canCheckIn, true);
  assert.equal(after._todayDay(), 17);
  assert.equal(after._challengeState().canCheckIn, false);
});

test("시작 전에는 PIN이 맞아도 체크인을 저장하지 않는다", () => {
  const { context } = loadBackend("2026-09-06T12:00:00+09:00");
  context._verifyPin = () => ({ ok: true });

  const result = context._checkin("m01", "0123", true, "");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "checkin closed" });
});

test("깨진 JSON 요청도 JSON 오류 응답으로 돌려준다", () => {
  const { context } = loadBackend();
  const output = context.doPost({ postData: { contents: "{" } });
  assert.deepEqual(JSON.parse(output.text), { ok: false, error: "bad request" });
});
