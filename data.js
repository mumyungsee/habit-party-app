// ============================================================
//  data.js — 데이터 레이어 (구글시트 Apps Script 연동)
//
//  GET  : 전체 상태(challenge/members/checkins) 로드
//  POST : setPin / verifyPin / checkin
//
//  로드한 데이터는 Store 에 캐시. 화면(app.js)은 Data.* 로 동기 접근.
//  체크인/핀 변경 시 서버로 보내고, 로컬 캐시도 즉시 갱신(낙관적 업데이트).
// ============================================================

const API_URL = "https://script.google.com/macros/s/AKfycbz87IJ4vn_IMX5PWEJooPf4Fu4j8f2msyOZS7RH6aOxm-2ct-FE_wkttHurBhvhOH3omw/exec";

const LS_ME = "habitparty_me";
const LS_PIN = "habitparty_pin";

// Storage restrictions must not prevent participation during the current visit.
const sessionValues = new Map();
let storageAvailable = true;
function savedValue(key) {
  if (sessionValues.has(key)) return sessionValues.get(key);
  try { return storageAvailable ? localStorage.getItem(key) : null; }
  catch (_) { storageAvailable = false; return null; }
}
function saveValue(key, value) {
  sessionValues.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_) { storageAvailable = false; }
}
function requestError(code) { const error = new Error(code); error.code = code; return error; }
async function requestJson(options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API_URL, { ...options, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw requestError("HP-SERVER-01");
    try { return await response.json(); }
    catch (error) { if (error.name === "AbortError") throw error; throw requestError("HP-SERVER-01"); }
  } catch (error) {
    if (typeof error.code === "string" && error.code.startsWith("HP-")) throw error;
    throw requestError(error.name === "AbortError" ? "HP-TIMEOUT-01" : "HP-NETWORK-01");
  } finally { clearTimeout(timer); }
}

// 서버에서 받아온 현재 상태 캐시
const Store = {
  challenge: { startDate: "2026-09-07", totalDays: 17, today: 1, canCheckIn: false },
  members: [],     // {id,name,team,role,mission,emoji,hasPin}
  checkins: [],    // {memberId,day,done,memo}
  loaded: false,
};

// 팀별 기본 이모지(시트 emoji 없을 때 fallback용 — 지금은 시트에 있음)
const TEAM_EMOJI = {
  "자발적 학습팀": "🌅", "집단지성 학습팀": "💬", "아웃풋 학습팀": "✍️",
  "적극학습(라이브)": "🎙️", "적극학습(채팅)": "⌨️",
};

async function _get() {
  return requestJson({ method: "GET" });
}

// Apps Script 웹앱은 CORS preflight를 막으므로 text/plain 으로 단순요청 전송
async function _post(payload) {
  return requestJson({
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

const Data = {
  // ── 로딩 ──
  async load() {
    const d = await _get();
    if (!d.ok || !d.challenge || !Array.isArray(d.members) || !Array.isArray(d.checkins)) throw requestError("HP-SERVER-01");
    Store.challenge = d.challenge;
    Store.members = d.members;
    Store.checkins = d.checkins;
    Store.loaded = true;
  },
  async reload() { await this.load(); },

  challenge() { return Store.challenge; },
  teams() {
    // 시트 members 에서 팀 목록 + 대표 이모지/임무 뽑기
    const out = {};
    Store.members.forEach(m => {
      if (!out[m.team]) out[m.team] = { mission: m.mission, emoji: m.emoji || TEAM_EMOJI[m.team] || "🐱" };
    });
    return out;
  },

  members() { return Store.members; },
  membersByTeam() {
    const out = {};
    Store.members.forEach(m => { (out[m.team] = out[m.team] || []).push(m); });
    return out;
  },
  member(id) { return Store.members.find(m => m.id === id); },
  // 이름이 있는(=실제 사람이 앉은) 멤버만
  filledMembers() { return Store.members.filter(m => m.name && m.name.trim()); },
  missionFor(member) {
    // title = 실제 인증할 미션 내용(위계 1순위), team/role = 보조 라벨
    return { id: "main", title: member.mission, team: member.team, role: member.role, emoji: member.emoji || TEAM_EMOJI[member.team] || "🐱" };
  },

  // ── 핀 ──
  hasPin(member) { return !!member?.hasPin; },
  async setPin(id, pin) {
    let r;
    try { r = await _post({ action: "setPin", memberId: id, pin }); }
    catch (error) {
      // A write may have completed despite a missing response. Verify; never overwrite the PIN.
      await this.reload();
      if (this.member(id)?.hasPin && await this.verifyPin(id, pin)) return { ok: true };
      throw error;
    }
    if (!r.ok && r.error === "이미 핀이 설정됨") {
      await this.reload();
      return { ok: await this.verifyPin(id, pin) };
    }
    if (!r.ok) throw requestError("HP-SERVER-01");
    if (r.ok) {
      const m = this.member(id);
      if (m) m.hasPin = true;
      saveValue(LS_PIN, pin);
    }
    return r;
  },
  async verifyPin(id, pin) {
    const r = await _post({ action: "verifyPin", memberId: id, pin });
    if (r.ok) saveValue(LS_PIN, pin);
    return r.ok;
  },

  // ── 로그인 상태(이 기기) ──
  savedMe() { return savedValue(LS_ME); },
  savedPin() { return savedValue(LS_PIN); },
  setMe(id) { saveValue(LS_ME, id); },
  clearMe() {
    saveValue(LS_ME, null);
    saveValue(LS_PIN, null);
  },

  // ── 체크인 ──
  isChecked(member, day) {
    const c = Store.checkins.find(x => x.memberId === member.id && x.day === day);
    return c ? c.done : false;
  },
  myCheckRaw(member, day) {
    const c = Store.checkins.find(x => x.memberId === member.id && x.day === day);
    return c ? c.done : undefined;
  },
  async setMyCheck(member, day, val, memo) {
    // 서버 저장이 확인된 뒤에만 화면 캐시를 바꾼다.
    // 네트워크/PIN 오류인데도 인증 성공처럼 보이는 일을 막기 위함.
    const r = await _post({ action: "checkin", memberId: member.id, pin: this.savedPin(), done: val, memo: memo || "" });
    if (!r.ok) throw requestError(r.error === "unauthorized" ? "HP-PIN-01" : r.error === "checkin closed" ? "HP-CLOSED-01" : "HP-SERVER-01");
    const savedDay = Number(r.day);
    if (!Number.isInteger(savedDay) || savedDay < 1 || savedDay > Store.challenge.totalDays) throw requestError("HP-SERVER-01");
    let c = Store.checkins.find(x => x.memberId === member.id && x.day === savedDay);
    Store.challenge.today = savedDay;
    if (c) { c.done = val; c.memo = memo || c.memo || ""; }
    else { Store.checkins.push({ memberId: member.id, day: savedDay, done: val, memo: memo || "" }); }
    return r;
  },

  streak(member) {
    let s = 0;
    for (let d = Store.challenge.today; d >= 1; d--) {
      if (this.isChecked(member, d)) s++; else break;
    }
    return s;
  },
};
