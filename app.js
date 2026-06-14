// ============================================================
//  app.js — 화면 흐름/렌더링 (데이터는 전부 Data.* 통해 접근)
// ============================================================

let me = null;       // 로그인한 멤버 객체
let pinBuffer = "";  // 핀 입력 중 버퍼
let pinTarget = null;// 핀 입력 대상 멤버
let pinMode = "verify"; // "set"(처음) | "verify"(확인)

// ── 아바타(DiceBear Miniavs) ──────────────────
//  seed = 멤버 id(또는 이름) → 사람마다 고정된 캐릭터.
//  나중에 멤버에 m.avatarSeed 저장하면 "다시뽑기"로 교체 가능.
function avatarSeed(m) {
  return (m && (m.avatarSeed || m.id || m.name)) || "guest";
}
function avatarUrl(m) {
  const seed = encodeURIComponent(avatarSeed(m));
  return `https://api.dicebear.com/9.x/miniavs/svg?seed=${seed}&backgroundColor=transparent`;
}
function avatarImg(m, sizeClass) {
  return `<img class="av ${sizeClass}" src="${avatarUrl(m)}" alt="">`;
}
// Lucide 아이콘을 새로 그린 DOM에 적용 (innerHTML 후 호출 필요)
function refreshIcons() {
  if (window.lucide && lucide.createIcons) lucide.createIcons();
}

// 팀 → Lucide 아이콘 이름 매핑 (없으면 users)
const TEAM_ICON = {
  "자발적 학습팀": "sunrise",
  "집단지성 학습팀": "messages-square",
  "아웃풋 학습팀": "pen-line",
  "적극학습(라이브)": "mic",
  "적극학습(채팅)": "keyboard",
};
function teamIcon(team) {
  return `<i data-lucide="${TEAM_ICON[team] || "users"}"></i>`;
}

// ── ⓪ 입장: 이름 목록 (시트에 이름 적은 사람만) ──
function renderPickList() {
  const box = document.getElementById("pickList");
  box.innerHTML = "";
  const teams = Data.teams();
  // 이름 있는 사람만 팀별로 묶어 표시
  const byTeam = {};
  Data.filledMembers().forEach(m => { (byTeam[m.team] = byTeam[m.team] || []).push(m); });

  const teamNames = Object.keys(byTeam);
  if (teamNames.length === 0) {
    box.innerHTML = `<div class="enter-foot" style="margin-top:0;">아직 명단에 이름이 없어요.<br/>스터디 시트 <b>members</b> 탭에서 자기 역할 줄에 이름을 적어주세요.</div>`;
    return;
  }
  teamNames.forEach(team => {
    const head = document.createElement("div");
    head.className = "team-head";
    head.innerHTML = `<i data-lucide="users"></i> ${team}`;
    box.appendChild(head);
    byTeam[team].forEach(m => {
      const el = document.createElement("div");
      el.className = "pick";
      el.onclick = () => choosePerson(m.id);
      el.innerHTML = `
        ${avatarImg(m, "av-md")}
        <div class="info"><div class="nm">${m.name}</div><div class="rl">${m.role}</div></div>
        <span class="arrow"><i data-lucide="chevron-right"></i></span>`;
      box.appendChild(el);
    });
  });
  refreshIcons();
}

// ── 핀 단계 ──────────────────────────────────
function choosePerson(id) {
  pinTarget = Data.member(id);
  pinMode = Data.hasPin(pinTarget) ? "verify" : "set";
  pinBuffer = "";
  document.getElementById("pinAva").innerHTML = avatarImg(pinTarget, "av-xl");
  document.getElementById("pinName").textContent = pinTarget.name;
  document.getElementById("pinRole").innerHTML = teamIcon(pinTarget.team) + " " + pinTarget.team + " · " + pinTarget.role;
  document.getElementById("pinPrompt").textContent =
    pinMode === "set" ? "처음이시네요! 쓸 비밀번호 4자리를 정해요" : "비밀번호 4자리를 입력하세요";
  document.getElementById("pinErr").textContent = "";
  renderPinPad(); renderPinDots();
  document.getElementById("step-pick").style.display = "none";
  document.getElementById("step-pin").style.display = "block";
}

function backToPick() {
  document.getElementById("step-pin").style.display = "none";
  document.getElementById("step-pick").style.display = "block";
}

function renderPinPad() {
  const pad = document.getElementById("pinPad");
  pad.innerHTML = "";
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  keys.forEach(k => {
    const b = document.createElement("button");
    if (k === "") { b.className = "pin-key empty"; pad.appendChild(b); return; }
    b.className = "pin-key";
    b.textContent = k;
    b.onclick = () => pinPress(k);
    pad.appendChild(b);
  });
}

function renderPinDots() {
  const d = document.getElementById("pinDots");
  d.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement("div");
    dot.className = "dot" + (i < pinBuffer.length ? " on" : "");
    d.appendChild(dot);
  }
}

function pinPress(k) {
  if (k === "⌫") { pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); return; }
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  renderPinDots();
  if (pinBuffer.length === 4) setTimeout(submitPin, 150);
}

async function submitPin() {
  const promptEl = document.getElementById("pinPrompt");
  const errEl = document.getElementById("pinErr");
  const entered = pinBuffer;
  promptEl.textContent = "확인 중...";
  try {
    if (pinMode === "set") {
      const r = await Data.setPin(pinTarget.id, entered);
      if (r.ok) { enter(pinTarget.id); }
      else { errEl.textContent = "설정 실패: " + (r.error || ""); pinBuffer = ""; renderPinDots(); promptEl.textContent = "비밀번호 4자리를 정해요"; }
    } else {
      const ok = await Data.verifyPin(pinTarget.id, entered);
      if (ok) { enter(pinTarget.id); }
      else {
        errEl.textContent = "비밀번호가 달라요. 다시 입력해주세요.";
        pinBuffer = ""; renderPinDots();
        promptEl.textContent = "비밀번호 4자리를 입력하세요";
      }
    }
  } catch (e) {
    errEl.textContent = "네트워크 오류. 잠시 후 다시 시도해요.";
    pinBuffer = ""; renderPinDots();
    promptEl.textContent = "비밀번호 4자리를 입력하세요";
  }
}

// ── 입장 완료 ────────────────────────────────
function enter(id) {
  me = Data.member(id);
  Data.setMe(id);
  document.getElementById("meAva").innerHTML = avatarImg(me, "av-lg");
  document.getElementById("meName").textContent = me.name;
  document.getElementById("meRole").innerHTML = teamIcon(me.team) + " " + me.team + " · " + me.role;
  document.getElementById("todayDay").textContent = Data.challenge().today;
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("ko-KR", {weekday:"long", month:"long", day:"numeric"});
  renderMissions(); renderGrid();
  go("s-today");
  refreshIcons();
}

function logout() {
  Data.clearMe(); me = null;
  backToPick();
  go("s-enter");
}

// 테스트용 — 저장된 모든 것(핀/체크/로그인/팡파레) 삭제하고 처음 상태로
function resetAll() {
  if (!confirm("저장된 핀·체크·로그인 기록을 전부 지우고 처음 상태로 돌아갈까요?\n(테스트용)")) return;
  localStorage.clear();
  sessionStorage.clear();
  location.reload();
}

// ── ① 오늘 인증 ─────────────────────────────
function renderMissions(justOnId) {
  const list = document.getElementById("missionList");
  list.innerHTML = "";
  const m = Data.missionFor(me);
  const day = Data.challenge().today;
  const isDone = Data.myCheckRaw(me, day) === true;
  const el = document.createElement("div");
  el.className = "mission" + (isDone ? " done" : "");
  el.innerHTML = `
    <div class="top">
      <div class="check" onclick="toggleMission()">${isDone ? '<i data-lucide="check"></i>' : ""}</div>
      <div class="body">
        <div class="mtitle">${m.title}${isDone ? ' <span class="done-tag">오늘 인증 완료</span>' : ''}</div>
        <div class="mteam">${teamIcon(m.team)} ${m.team} · ${m.role}</div>
      </div>
    </div>`;
  list.appendChild(el);
  renderTodayParty(justOnId);
  refreshIcons();
}

// 인증 화면 "오늘 우리 파티" 가로 스트립
//  justOnId: 방금 켜진 사람 id (점등 애니메이션 줄 대상)
function renderTodayParty(justOnId) {
  const ch = Data.challenge();
  const mates = teamMates();
  const strip = document.getElementById("partyStrip");
  strip.innerHTML = "";
  let done = 0;
  mates.forEach(p => {
    const on = Data.isChecked(p, ch.today);
    if (on) done++;
    const isMe = p.id === me.id;
    const chip = document.createElement("div");
    chip.className = "pchip" + (on ? " on" : "") + (isMe ? " me" : "") + (on && p.id === justOnId ? " just-on" : "");
    const lead = p.role === "서포터즈";   // 팀 리더 표시
    chip.innerHTML = `
      <div class="pbadge"><i data-lucide="check"></i></div>
      ${lead ? '<div class="pcrown"><i data-lucide="crown"></i></div>' : ''}
      <div class="pava">${avatarImg(p, "av-md")}</div>
      <div class="pnm">${isMe ? "나" : p.name}</div>`;
    strip.appendChild(chip);
  });

  const left = mates.length - done;
  const msg = document.getElementById("partyMsg");
  msg.classList.remove("win");
  if (done === mates.length) { msg.classList.add("win"); msg.innerHTML = "우리 파티 <b>전원 완주!</b>"; }
  else if (left === 1 && Data.myCheckRaw(me, ch.today) !== true)
    msg.innerHTML = "<b>나 하나 남았어요!</b> 내가 채우면 파티 완성";
  else msg.innerHTML = `${done}/${mates.length}명 완료 · ${left}명 남음`;
}

// 내 팀에서 이름 있는(실제 앉은) 사람들
function teamMates() {
  return Data.filledMembers().filter(p => p.team === me.team);
}

async function toggleMission() {
  const day = Data.challenge().today;
  const cur = Data.myCheckRaw(me, day) === true;
  const mates = teamMates();

  Data.setMyCheck(me, day, !cur, ""); // 서버 저장(비동기, 내부에서 캐시 먼저 갱신)
  // 내 칩 점등 애니메이션 (방금 켰을 때만)
  renderMissions(!cur ? me.id : null);
  renderGrid();

  if (!cur) {
    // 내가 방금 인증함
    const everyoneNow = mates.every(p => Data.isChecked(p, day));
    if (everyoneNow && mates.length > 1) {
      // 내가 마지막 한 명 → 큰 폭발
      showToast("우리 파티 전원 완주! 🎉🎉");
      fireConfetti("big");
    } else {
      // 개인 인증 → 작은 팡파레
      fireConfetti("small");
    }
  }
}

// ── 30일 그리드 (오늘 화면 하단) ─────────────
function renderGrid() {
  const ch = Data.challenge();
  const mates = teamMates();
  const t = document.getElementById("grid");
  let html = "<tr><th class='row-label'></th>";
  for (let d = 1; d <= ch.totalDays; d++) html += `<th class="col-day ${d===ch.today?"today":""}">${d}</th>`;
  html += "</tr>";
  // 날짜별 "팀 전원 인증 완료" 여부 미리 계산 (전원완주 날 = 보석)
  const allDone = {};
  for (let d = 1; d <= ch.today; d++) {
    allDone[d] = mates.length > 0 && mates.every(p => Data.isChecked(p, d));
  }
  mates.forEach(p => {
    html += `<tr><td class="row-label">${avatarImg(p, "av-xs")} ${p.name}</td>`;
    for (let d = 1; d <= ch.totalDays; d++) {
      let cls = "miss";
      let on = false;
      if (d <= ch.today) { on = Data.isChecked(p, d); cls = on ? "done" : "miss"; }
      if (d === ch.today) cls += " today";
      const fire = on && allDone[d];          // 본인 인증 + 그날 팀 전원완주
      if (fire) cls += " fire";
      const inner = fire ? '<i data-lucide="flame"></i>'
                  : on   ? '<i data-lucide="check"></i>'
                         : '<span class="miss-dot"></span>';
      html += `<td class="cell ${cls}">${inner}</td>`;
    }
    html += "</tr>";
  });
  t.innerHTML = html;
  refreshIcons();
}

// ── 공통 ─────────────────────────────────────
function go(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
  window.scrollTo(0, 0);
}

// ── 팡파레(꽃가루) 효과 ──────────────────────
//  size: "small"(개인 인증, 소소) | "big"(팀 전원 완주, 대형)
function fireConfetti(size) {
  const big = size === "big";
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth*dpr; canvas.height = innerHeight*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  canvas.classList.add("on");

  // 축하 파티클: 네이비 베이스에 화사한 포인트(금·코랄·민트). 전원완주는 더 화려하게.
  const colors = big
    ? ["#2d3a5e","#e8b54a","#ff8a5c","#43c6ac","#f7d774","#a98bd6","#ffffff"] // 전원완주 — 파티
    : ["#2d3a5e","#3d4d77","#e8b54a","#ff8a5c","#f7d774"];                     // 개인 — 절제된 축하
  const N = big ? 220 : 110;
  const maxFrame = big ? 200 : 130;
  const parts = [];

  if (big) {
    // 화면 양쪽 아래에서 가운데 위로 쏘는 대형 폭죽 2발 + 중앙 분수
    const origins = [
      { x: innerWidth*0.5, y: innerHeight*0.5, spread: 14, up: 16 },
      { x: innerWidth*0.15, y: innerHeight*0.85, spread: 11, up: 19 },
      { x: innerWidth*0.85, y: innerHeight*0.85, spread: 11, up: 19 },
    ];
    origins.forEach(o => {
      for (let i = 0; i < N/3; i++) parts.push(mk(o.x, o.y, o.spread, o.up, 7, 11));
    });
  } else {
    // 화면 아래쪽(미션 근처)에서 위로 시원하게 솟구치는 분수 한 발
    for (let i = 0; i < N; i++) parts.push(mk(innerWidth/2, innerHeight*0.7, 13, 19, 7, 11));
  }

  function mk(x, y, spread, up, smin, smax) {
    return {
      x: x + (Math.random()-0.5)*40, y,
      vx: (Math.random()-0.5)*spread,
      vy: Math.random()*-up - 4,
      g: 0.32 + Math.random()*0.12,
      size: smin + Math.random()*(smax-smin),
      color: colors[(Math.random()*colors.length)|0],
      rot: Math.random()*6.28, vr: (Math.random()-0.5)*0.4,
      shape: Math.random() < 0.5 ? "rect" : "circ",
    };
  }

  let frame = 0;
  function tick() {
    ctx.clearRect(0,0,innerWidth,innerHeight);
    let alive = false;
    parts.forEach(p => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
      if (p.y < innerHeight + 30) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - frame/(maxFrame*0.95));
      ctx.fillStyle = p.color;
      if (p.shape === "rect") ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      else { ctx.beginPath(); ctx.arc(0,0,p.size/2,0,6.28); ctx.fill(); }
      ctx.restore();
    });
    frame++;
    if (alive && frame < maxFrame) requestAnimationFrame(tick);
    else { canvas.classList.remove("on"); ctx.clearRect(0,0,innerWidth,innerHeight); }
  }
  tick();
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg || "완료!";
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

// ── 시작 ─────────────────────────────────────
async function init() {
  const pickBox = document.getElementById("pickList");
  pickBox.innerHTML = `<div class="enter-foot" style="margin-top:0;">불러오는 중...</div>`;
  try {
    await Data.load();
  } catch (e) {
    pickBox.innerHTML = `<div class="enter-foot" style="margin-top:0;">데이터를 불러오지 못했어요.<br/>인터넷 연결을 확인하고 새로고침해주세요.</div>`;
    console.error(e);
    return;
  }
  renderPickList();
  refreshIcons();
  // 이 기기에 기억된 로그인이 있으면 바로 입장 (서버에 그 멤버가 있어야)
  const saved = Data.savedMe();
  if (saved && Data.member(saved)) enter(saved);
}
init();
