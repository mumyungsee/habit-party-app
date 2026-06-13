/**
 * 습관파티 MVP — Google Apps Script 백엔드
 * 구글시트를 DB로, 이 스크립트를 API로 사용.
 *
 * ▶ 시트 구조 (탭 2개, 첫 행은 헤더):
 *   [members]  : id | name | team | role | mission | emoji | pin
 *   [checkins] : memberId | name | day | date | done | memo | updatedAt
 *
 * ▶ 배포: 확장프로그램 > Apps Script > 이 코드 붙여넣기 >
 *         배포 > 새 배포 > 유형 "웹 앱" >
 *         실행 계정: 나, 액세스: "모든 사용자" > 배포 > URL 복사
 */

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const TZ = "Asia/Seoul";

// 챌린지 시작일 (여기만 바꾸면 '며칠째'가 자동 계산됨)
const CHALLENGE_START = "2026-07-27"; // YYYY-MM-DD
const CHALLENGE_DAYS = 30;

function _sheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

// 시트 → 객체 배열 (헤더 기준)
function _rows(name) {
  const sh = _sheet(name);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const head = data[0].map(String);
  return data.slice(1)
    .filter(r => r.join("") !== "")
    .map(r => {
      const o = {};
      head.forEach((h, i) => o[h] = r[i]);
      return o;
    });
}

// 오늘이 챌린지 며칠째인지
function _todayDay() {
  const start = new Date(CHALLENGE_START + "T00:00:00+09:00");
  const now = new Date();
  const days = Math.floor((now - start) / 86400000) + 1;
  return Math.max(1, Math.min(CHALLENGE_DAYS, days));
}

// id 없으면 name 기반으로 생성 (한글이면 row 번호로)
function _ensureMemberIds() {
  const sh = _sheet("members");
  const data = sh.getDataRange().getValues();
  const head = data[0].map(String);
  const idCol = head.indexOf("id");
  let changed = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i].join("") === "") continue;
    if (!data[i][idCol]) {
      sh.getRange(i + 1, idCol + 1).setValue("m" + (i)); // m1, m2...
      changed = true;
    }
  }
  if (changed) SpreadsheetApp.flush();
}

// ── GET: 전체 상태 읽기 ──────────────────────
function doGet(e) {
  _ensureMemberIds();
  // name 이 비어있는 줄(아직 아무도 안 앉은 자리)도 포함 — 앱이 "빈 자리"로 보여줌
  const members = _rows("members").map(m => ({
    id: String(m.id),
    name: String(m.name || ""),
    team: String(m.team),
    role: String(m.role),
    mission: String(m.mission || ""),
    emoji: String(m.emoji || "🐱"),
    hasPin: !!String(m.pin || ""),   // 핀 설정 여부만 (핀 값은 안 보냄)
  }));
  const checkins = _rows("checkins").map(c => ({
    memberId: String(c.memberId),
    name: String(c.name || ""),
    day: Number(c.day),
    done: c.done === true || String(c.done).toLowerCase() === "true",
    memo: String(c.memo || ""),
  }));
  return _json({
    ok: true,
    challenge: { startDate: CHALLENGE_START, totalDays: CHALLENGE_DAYS, today: _todayDay() },
    members, checkins,
  });
}

// ── POST: 핀 설정/확인, 체크인 저장 ──────────
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  if (action === "setPin")   return _json(_setPin(body.memberId, body.pin));
  if (action === "verifyPin") return _json(_verifyPin(body.memberId, body.pin));
  if (action === "checkin")  return _json(_checkin(body.memberId, body.done, body.memo));
  return _json({ ok: false, error: "unknown action" });
}

function _findMemberRow(memberId) {
  const sh = _sheet("members");
  const data = sh.getDataRange().getValues();
  const head = data[0].map(String);
  const idCol = head.indexOf("id"), pinCol = head.indexOf("pin");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(memberId)) return { row: i + 1, pinCol: pinCol + 1, pin: String(data[i][pinCol] || "") };
  }
  return null;
}

function _setPin(memberId, pin) {
  const m = _findMemberRow(memberId);
  if (!m) return { ok: false, error: "member not found" };
  if (m.pin) return { ok: false, error: "이미 핀이 설정됨" };
  _sheet("members").getRange(m.row, m.pinCol).setValue("'" + pin); // 앞 0 보존
  return { ok: true };
}

function _verifyPin(memberId, pin) {
  const m = _findMemberRow(memberId);
  if (!m) return { ok: false, error: "member not found" };
  return { ok: m.pin.replace(/^'/, "") === String(pin) };
}

// memberId → 이름 (members 탭에서 조회)
function _memberName(memberId) {
  const data = _sheet("members").getDataRange().getValues();
  const head = data[0].map(String);
  const idCol = head.indexOf("id"), nameCol = head.indexOf("name");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(memberId)) return String(data[i][nameCol] || "");
  }
  return "";
}

function _checkin(memberId, done, memo) {
  const day = _todayDay();
  const name = _memberName(memberId);
  const sh = _sheet("checkins");
  const data = sh.getDataRange().getValues();
  const head = data[0].map(String);
  const cId = head.indexOf("memberId"), cDay = head.indexOf("day");
  const now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const rowVals = [memberId, name, day, today, done, memo || "", now]; // 7열: memberId|name|day|date|done|memo|updatedAt

  // 기존 (오늘+이 사람) 행 있으면 덮어쓰기
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cId]) === String(memberId) && Number(data[i][cDay]) === day) {
      sh.getRange(i + 1, 1, 1, 7).setValues([rowVals]);
      SpreadsheetApp.flush();
      return { ok: true, day };
    }
  }
  sh.appendRow(rowVals);
  return { ok: true, day };
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
