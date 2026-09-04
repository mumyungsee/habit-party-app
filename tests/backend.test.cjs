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
    ContentService: {},
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

test("서울 시간 기준 시작일은 1일 차이고 마지막 날 이후에는 19일로 고정한다", () => {
  const start = loadBackend("2026-09-05T12:00:00+09:00").context;
  const end = loadBackend("2026-09-23T12:00:00+09:00").context;
  const after = loadBackend("2026-09-24T12:00:00+09:00").context;

  assert.equal(start._todayDay(), 1);
  assert.equal(end._todayDay(), 19);
  assert.equal(after._todayDay(), 19);
});
