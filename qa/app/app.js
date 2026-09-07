// ============================================================
//  app.js — 화면 흐름/렌더링 (데이터는 전부 Data.* 통해 접근)
// ============================================================

let me = null;       // 로그인한 멤버 객체
let pinBuffer = "";  // 핀 입력 중 버퍼
let pinTarget = null;// 핀 입력 대상 멤버
let pinMode = "verify"; // "set"(처음) | "verify"(확인)
let savingMission = false;
let refreshingState = false;
let pinSubmitting = false;
let pendingMission = null;
let missionIssue = null;

// Preview only: committed server data stays unchanged until the write succeeds.
function viewedCheck(member, day) {
  return pendingMission && pendingMission.memberId === member.id && pendingMission.day === day
    ? pendingMission.done : Data.isChecked(member, day);
}

async function confirmMissionState() {
  if (savingMission || !me) return;
  savingMission = true;
  try {
    await Data.reload();
    missionIssue = null;
    enter(me.id);
    showToast('서버의 현재 기록을 확인했어요.');
  } catch (error) {
    missionIssue = '아직 저장 결과를 확인하지 못했어요. 연결이 복구되면 다시 확인해주세요.';
    renderMissions();
  } finally { savingMission = false; }
}

function errorMessage(error) {
  const code = error && error.code || "HP-UI-01";
  const messages = {
    "HP-NETWORK-01": "연결을 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
    "HP-TIMEOUT-01": "응답이 오래 걸려 중단했어요. 다시 시도해주세요.",
    "HP-SERVER-01": "서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
    "HP-PIN-01": "로그인을 다시 확인해야 해요. ‘바꾸기’를 눌러 다시 입장해주세요.",
    "HP-CLOSED-01": "현재는 실행 인증 기간이 아니에요.",
    "HP-UI-01": "화면을 표시하지 못했어요. 새로고침 후에도 같으면 운영자에게 알려주세요.",
  };
  return `${messages[code] || messages["HP-UI-01"]} (${code})`;
}
function closedMessage() {
  return Data.challenge().today >= Data.challenge().totalDays
    ? "실행 인증 기간이 끝났어요" : "실행 인증은 9월 7일부터 시작해요";
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}

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

// 팀 체크율을 다섯 단계로 바꾼다.
// 6명은 3명부터 불꽃·4명부터 빨간 불꽃, 7명은 4명·5명부터 같은 단계가 된다.
function teamProgress(doneCount, totalCount) {
  const total = Math.max(0, Number(totalCount) || 0);
  const done = Math.min(total, Math.max(0, Number(doneCount) || 0));
  const ratio = total > 0 ? done / total : 0;

  if (total > 0 && done === total) return { stage: "blaze", done, total, ratio, flame: true };
  if (ratio >= 2 / 3) return { stage: "hot", done, total, ratio, flame: true };
  if (ratio >= 1 / 2) return { stage: "warm", done, total, ratio, flame: true };
  if (done > 0) return { stage: "lit", done, total, ratio, flame: false };
  return { stage: "empty", done, total, ratio, flame: false };
}

// 한 화면에 모두 보이도록 6명은 3×2, 7명은 4+3으로 배치한다.
function partyColumns(totalCount) {
  const total = Math.max(0, Number(totalCount) || 0);
  if (total >= 7) return 4;
  if (total >= 5) return 3;
  return Math.max(1, total);
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
    box.innerHTML = `<div class="enter-foot" style="margin-top:0;">아직 명단에 이름이 없어요.<br/>통합 카톡방에서 운영자에게 알려주세요.</div>`;
    return;
  }
  teamNames.forEach(team => {
    const head = document.createElement("div");
    head.className = "team-head";
    head.innerHTML = `<i data-lucide="users"></i> ${escapeHtml(team)}`;
    box.appendChild(head);
    byTeam[team].forEach(m => {
      const el = document.createElement("div");
      el.className = "pick";
      el.onclick = () => choosePerson(m.id);
      el.innerHTML = `
        ${avatarImg(m, "av-md")}
        <div class="info"><div class="nm">${escapeHtml(m.name)}</div><div class="rl">${escapeHtml(m.role)}</div></div>
        <span class="arrow"><i data-lucide="chevron-right"></i></span>`;
      box.appendChild(el);
    });
  });
  refreshIcons();
}

// ── 핀 단계 ──────────────────────────────────
function choosePerson(id) {
  if (pinSubmitting) return;
  pinTarget = Data.member(id);
  pinMode = Data.hasPin(pinTarget) ? "verify" : "set";
  pinBuffer = "";
  document.getElementById("pinAva").innerHTML = avatarImg(pinTarget, "av-xl");
  document.getElementById("pinName").textContent = pinTarget.name;
  document.getElementById("pinRole").innerHTML = teamIcon(pinTarget.team) + " " + escapeHtml(pinTarget.team) + " · " + escapeHtml(pinTarget.role);
  document.getElementById("pinPrompt").textContent =
    pinMode === "set" ? "처음이시네요! 쓸 비밀번호 4자리를 정해요" : "비밀번호 4자리를 입력하세요";
  document.getElementById("pinErr").textContent = "";
  renderPinPad(); renderPinDots();
  document.getElementById("step-pick").style.display = "none";
  document.getElementById("step-pin").style.display = "block";
}

function backToPick() {
  if (pinSubmitting) return;
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
  if (pinSubmitting) return;
  if (k === "⌫") { pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); return; }
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  renderPinDots();
  if (pinBuffer.length === 4) submitPin();
}

async function submitPin() {
  if (pinSubmitting || pinBuffer.length !== 4 || !pinTarget) return;
  pinSubmitting = true;
  const targetId = pinTarget.id;
  const promptEl = document.getElementById("pinPrompt");
  const errEl = document.getElementById("pinErr");
  const entered = pinBuffer;
  document.querySelectorAll("#step-pin button").forEach(b => b.disabled = true);
  promptEl.textContent = "확인 중...";
  try {
    const ok = pinMode === "set" ? (await Data.setPin(targetId, entered)).ok : await Data.verifyPin(targetId, entered);
    if (ok) { enter(targetId); }
    else {
        errEl.textContent = "비밀번호가 달라요. 다시 입력해주세요.";
        pinBuffer = ""; renderPinDots();
        promptEl.textContent = "비밀번호 4자리를 입력하세요";
    }
  } catch (e) {
    errEl.textContent = errorMessage(e);
    pinBuffer = ""; renderPinDots();
  } finally {
    pinSubmitting = false;
    pinMode = Data.hasPin(Data.member(targetId)) ? "verify" : "set";
    promptEl.textContent = pinMode === "set" ? "비밀번호 4자리를 정해요" : "비밀번호 4자리를 입력하세요";
    document.querySelectorAll("#step-pin button").forEach(b => b.disabled = false);
  }
}

// ── 입장 완료 ────────────────────────────────
function enter(id) {
  me = Data.member(id);
  Data.setMe(id);
  document.getElementById("meAva").innerHTML = avatarImg(me, "av-lg");
  document.getElementById("meName").textContent = me.name;
  document.getElementById("meRole").innerHTML = teamIcon(me.team) + " " + escapeHtml(me.team) + " · " + escapeHtml(me.role);
  const challenge = Data.challenge();
  document.querySelector(".day-hero .big").innerHTML = challenge.canCheckIn
    ? `챌린지 <b id="todayDay">${challenge.today}</b>일째`
    : escapeHtml(closedMessage());
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("ko-KR", {weekday:"long", month:"long", day:"numeric"});
  renderMissions(); renderGrid();
  go("s-today");
  refreshIcons();
}

function logout() {
  if (savingMission || pinSubmitting) return;
  Data.clearMe(); me = null;
  pendingMission = null; missionIssue = null;
  backToPick();
  go("s-enter");
}

// 공용 기기 등에서 이 브라우저의 로그인 흔적만 지우고 처음 화면으로
function resetAll() {
  if (!confirm("이 기기에 저장된 로그인 정보를 지우고 처음 화면으로 돌아갈까요?\n서버의 PIN과 체크인 기록은 유지됩니다.")) return;
  Data.clearMe();
  location.reload();
}

// ── ① 오늘 인증 ─────────────────────────────
function renderMissions(justOnId) {
  const list = document.getElementById("missionList");
  list.innerHTML = "";
  const m = Data.missionFor(me);
  const challenge = Data.challenge();
  const day = challenge.today;
  const isDone = viewedCheck(me, day);
  const pending = pendingMission && pendingMission.memberId === me.id;
  const el = document.createElement("div");
  el.className = "mission" + (isDone ? " done" : "");
  el.innerHTML = `
    <div class="top">
      <div class="check"${challenge.canCheckIn ? ' onclick="toggleMission()"' : ''}>${isDone ? '<i data-lucide="check"></i>' : ""}</div>
      <div class="body">
        <div class="mtitle">${challenge.canCheckIn ? escapeHtml(m.title) : escapeHtml(closedMessage())}${pending ? ' <span class="done-tag" role="status">저장 중…</span>' : isDone ? ' <span class="done-tag">오늘 인증 완료</span>' : ''}</div>
        <div class="mteam">${teamIcon(m.team)} ${escapeHtml(m.team)} · ${escapeHtml(m.role)}</div>
      </div>
    </div>`;
  list.appendChild(el);
  if (missionIssue) {
    const notice = document.createElement('div');
    notice.className = 'save-notice';
    notice.setAttribute('role', 'alert');
    notice.innerHTML = `${escapeHtml(missionIssue)} <button type="button" onclick="confirmMissionState()">저장 결과 다시 확인</button>`;
    list.appendChild(notice);
  }
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
  const done = ch.canCheckIn ? mates.filter(p => viewedCheck(p, ch.today)).length : 0;
  const progress = teamProgress(done, mates.length);
  strip.className = `party-strip cols-${partyColumns(mates.length)} stage-${progress.stage}`;

  mates.forEach(p => {
    const on = viewedCheck(p, ch.today);
    const isMe = p.id === me.id;
    const chip = document.createElement("div");
    chip.className = "pchip" + (on ? " on" : "") + (isMe ? " me" : "") + (on && p.id === justOnId ? " just-on" : "");
    const lead = p.role === "서포터즈";   // 팀 리더 표시
    const badgeIcon = progress.flame ? "flame" : "check";
    chip.innerHTML = `
      <div class="pbadge"><i data-lucide="${badgeIcon}"></i></div>
      ${lead ? '<div class="pcrown"><i data-lucide="crown"></i></div>' : ''}
      <div class="pava">${avatarImg(p, "av-md")}</div>
      <div class="pnm">${isMe ? "나" : escapeHtml(p.name)}</div>`;
    strip.appendChild(chip);
  });

  const left = mates.length - done;
  const msg = document.getElementById("partyMsg");
  msg.className = `party-msg stage-${progress.stage}`;
  if (!ch.canCheckIn) msg.textContent = closedMessage();
  else if (progress.stage === "blaze") msg.innerHTML = "🔥🔥🔥 우리 파티 <b>전원 불꽃!</b>";
  else if (left === 1 && !viewedCheck(me, ch.today))
    msg.innerHTML = "<b>나 하나 남았어요!</b> 내가 채우면 전원 불꽃";
  else if (progress.stage === "hot")
    msg.innerHTML = `🔥 <b>빨간 불꽃!</b> ${done}/${mates.length}명 완료`;
  else if (progress.stage === "warm")
    msg.innerHTML = `🔥 <b>불꽃이 붙었어요!</b> ${done}/${mates.length}명 완료`;
  else if (progress.stage === "lit")
    msg.innerHTML = `${done}/${mates.length}명 완료 · 함께 불씨를 모으는 중`;
  else
    msg.innerHTML = "오늘 첫 불씨를 기다리고 있어요";
}

// 내 팀에서 이름 있는(실제 앉은) 사람들
function teamMates() {
  return Data.filledMembers().filter(p => p.team === me.team);
}

async function toggleMission() {
  if (savingMission || !me) return;
  if (missionIssue) { await confirmMissionState(); return; }
  const stale = Data.isCalendarStale();
  if (!Data.challenge().canCheckIn && !stale) { showToast(closedMessage()); return; }
  savingMission = true;
  const member = me;
  let day = Data.challenge().today;
  const intendedDone = stale || !Data.isChecked(member, day);
  pendingMission = { memberId: member.id, day, done: intendedDone };
  let writing = false;
  try {
    // Immediate reward; the adjacent saving label distinguishes unconfirmed state.
    renderMissions(intendedDone ? member.id : null);
    renderGrid();
    if (intendedDone) {
      const mates = teamMates();
      const allDone = mates.length > 1 && mates.every(p => viewedCheck(p, day));
      try { fireConfetti(allDone ? 'big' : 'small'); } catch (_) {}
    }
    // Only refresh before writing when the local calendar date changed since the last GET.
    if (stale) {
      await Data.reload();
      if (!Data.challenge().canCheckIn) throw requestError('HP-CLOSED-01');
      day = Data.challenge().today;
      pendingMission.day = day;
      renderMissions(); renderGrid();
    }
    writing = true;
    await Data.setMyCheck(member, day, intendedDone, '');
    pendingMission = null;
    enter(member.id);
    // No second fanfare on a late network response.
  } catch (e) {
    pendingMission = null;
    if (writing && ["HP-NETWORK-01", "HP-TIMEOUT-01", "HP-SERVER-01"].includes(e.code)) {
      missionIssue = '저장 결과를 확인하고 있어요…';
      renderMissions(); renderGrid();
      try {
        await Data.reload();
        missionIssue = Data.isChecked(member, Data.challenge().today) === intendedDone
          ? null : '완료 상태를 확인하지 못해 체크를 되돌렸어요.';
      } catch (_) { missionIssue = '저장 결과를 확인하지 못했어요. 연결이 복구되면 다시 확인해주세요.'; }
    } else {
      missionIssue = errorMessage(e);
      if (e.code === 'HP-CLOSED-01') { try { await Data.reload(); } catch (_) {} }
    }
    enter(member.id);
  } finally {
    savingMission = false;
  }
}

// ── 전체 기간 그리드 (오늘 화면 하단) ──────────
function renderGrid() {
  const ch = Data.challenge();
  const visibleToday = ch.canCheckIn || ch.today === ch.totalDays ? ch.today : 0;
  const mates = teamMates();
  const t = document.getElementById("grid");
  let html = "<tr><th class='row-label'></th>";
  for (let d = 1; d <= ch.totalDays; d++) html += `<th class="col-day ${d===visibleToday?"today":""}">${d}</th>`;
  html += "</tr>";
  // 날짜별 체크율 단계. 절반부터 불꽃, 2/3부터 빨간 불꽃, 전원은 큰 불꽃.
  const progressByDay = {};
  for (let d = 1; d <= visibleToday; d++) {
    const done = mates.filter(p => viewedCheck(p, d)).length;
    progressByDay[d] = teamProgress(done, mates.length);
  }
  mates.forEach(p => {
    html += `<tr><td class="row-label">${avatarImg(p, "av-xs")} ${escapeHtml(p.name)}</td>`;
    for (let d = 1; d <= ch.totalDays; d++) {
      let cls = "miss";
      let on = false;
      if (d <= visibleToday) { on = viewedCheck(p, d); cls = on ? "done" : "miss"; }
      if (d === visibleToday) cls += " today";
      const progress = progressByDay[d] || teamProgress(0, mates.length);
      const fire = on && progress.flame;
      if (on) cls += ` stage-${progress.stage}`;
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
  toastTimer = setTimeout(() => t.classList.remove("show"), 6000);
}

// PWA를 다음 날 다시 열거나 백그라운드에서 돌아왔을 때 날짜와 파티 기록을 새로 받는다.
async function refreshWhenVisible() {
  if (document.visibilityState !== "visible" || refreshingState || savingMission || pinSubmitting) return;
  refreshingState = true;
  try {
    const currentId = me && me.id;
    await Data.reload();
    if (savingMission || pinSubmitting || (me && me.id) !== currentId) return;
    if (currentId && Data.member(currentId)) enter(currentId);
    else if (currentId) logout();
    else if (!me) renderPickList();
  } catch (e) {
    console.warn("최신 기록을 불러오지 못했습니다.", e);
  } finally {
    refreshingState = false;
  }
}
document.addEventListener("visibilitychange", refreshWhenVisible);

// ── 시작 ─────────────────────────────────────
async function verifiedSavedMemberId() {
  const saved = Data.savedMe();
  const pin = Data.savedPin();
  if (!saved || !pin || !Data.member(saved)) {
    if (saved || pin) Data.clearMe();
    return null;
  }
  try {
    if (await Data.verifyPin(saved, pin)) return saved;
  } catch (e) {
    // GET은 성공했지만 PIN 확인 요청만 일시 실패한 경우에는 저장값을 지우지 않는다.
    console.warn("저장된 로그인을 확인하지 못했습니다.", e);
    return null;
  }
  Data.clearMe();
  return null;
}

async function init() {
  const pickBox = document.getElementById("pickList");
  pickBox.innerHTML = `<div class="enter-foot" style="margin-top:0;">불러오는 중...</div>`;
  try {
    await Data.load();
  } catch (e) {
    pickBox.innerHTML = `<div class="enter-foot" style="margin-top:0;">${escapeHtml(errorMessage(e))}<br/><button onclick="location.reload()">다시 불러오기</button></div>`;
    console.error(e);
    return;
  }
  // 서버에서도 PIN이 유효한 경우에만 기억된 로그인으로 자동 입장한다.
  const saved = await verifiedSavedMemberId();
  renderPickList();
  refreshIcons();
  if (saved && !pinSubmitting && !pinTarget && !me) {
    try { enter(saved); }
    catch (error) { pickBox.innerHTML = `<div class="enter-foot">${escapeHtml(errorMessage(error))}</div>`; }
  }
}
init();
