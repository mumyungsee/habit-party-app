// ============================================================
//  data.js — 데이터 레이어 (구글시트 Apps Script 연동)
//
//  GET  : 전체 상태(challenge/members/checkins) 로드
//  POST : setPin / verifyPin / checkin
//
//  로드한 데이터는 Store 에 캐시. 화면(app.js)은 Data.* 로 동기 접근.
//  체크인/핀 변경 시 서버로 보내고, 로컬 캐시도 즉시 갱신(낙관적 업데이트).
// ============================================================

const API_URL = "https://script.google.com/macros/s/AKfycbwa7zN9SlMaQVh5MOjqVNHBJWabbo5qHLUBqc0dWCsroOEDvFe2zNN7-QGMS1CvDGva/exec";

const LS_ME = "habitparty_me";

// 서버에서 받아온 현재 상태 캐시
const Store = {
  challenge: { startDate: "", totalDays: 30, today: 1 },
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
  const res = await fetch(API_URL, { method: "GET" });
  return await res.json();
}

// Apps Script 웹앱은 CORS preflight를 막으므로 text/plain 으로 단순요청 전송
async function _post(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

const Data = {
  // ── 로딩 ──
  async load() {
    const d = await _get();
    if (!d.ok) throw new Error("load failed");
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
    return { id: "main", title: member.team, desc: member.mission, emoji: member.emoji || TEAM_EMOJI[member.team] || "🐱" };
  },

  // ── 핀 ──
  hasPin(member) { return !!member.hasPin; },
  async setPin(id, pin) {
    const r = await _post({ action: "setPin", memberId: id, pin });
    if (r.ok) { const m = this.member(id); if (m) m.hasPin = true; }
    return r;
  },
  async verifyPin(id, pin) {
    const r = await _post({ action: "verifyPin", memberId: id, pin });
    return r.ok;
  },

  // ── 로그인 상태(이 기기) ──
  savedMe() { return localStorage.getItem(LS_ME); },
  setMe(id) { localStorage.setItem(LS_ME, id); },
  clearMe() { localStorage.removeItem(LS_ME); },

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
    // 낙관적 업데이트: 로컬 캐시 먼저 갱신
    let c = Store.checkins.find(x => x.memberId === member.id && x.day === day);
    if (c) { c.done = val; c.memo = memo || c.memo || ""; }
    else { Store.checkins.push({ memberId: member.id, day, done: val, memo: memo || "" }); }
    // 서버 저장 (실패해도 화면은 일단 반영, 콘솔에 경고)
    try { await _post({ action: "checkin", memberId: member.id, done: val, memo: memo || "" }); }
    catch (e) { console.warn("체크인 저장 실패(네트워크):", e); }
  },

  streak(member) {
    let s = 0;
    for (let d = Store.challenge.today; d >= 1; d--) {
      if (this.isChecked(member, d)) s++; else break;
    }
    return s;
  },
};
