(function () {
  const config = window.HABIT_PARTY_QA_CONFIG;
  const safety = window.HabitPartyQaSafety;
  const runButton = document.getElementById("runButton");
  const status = document.getElementById("testStatus");
  const rows = document.getElementById("testRows");
  const testPin = "2468";

  async function request(url, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, payload ? {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      } : { method: "GET", signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.environment !== 'habit-party-qa-2026-09-07') throw new Error('테스트 환경 확인 실패. 저장 점검을 중단했어.');
      if (!result.ok) throw new Error(result.error || "서버 거절");
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  function addResult(step, ok, detail) {
    const row = document.createElement("tr");
    [step, ok ? "통과" : "실패", detail].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 1) cell.className = ok ? "done" : "attention";
      row.appendChild(cell);
    });
    rows.appendChild(row);
  }

  async function run() {
    rows.replaceChildren();
    runButton.disabled = true;
    status.className = "status";
    status.textContent = "점검 중…";
    try {
      const api = safety.assertSafeEndpoint(config.stagingApiUrl, config.productionApiUrl);
      const testUrl = `${api}?_=${Date.now()}`;
      let state = await request(testUrl);
      addResult("1. 테스트 GET", true, `테스트 계정 ${state.members.length}개`);
      const member = state.members.find(item => item.id === 'qa02');
      if (!member) throw new Error("테스트 계정이 없어.");

      if (!member.hasPin) {
        await request(api, { action: "setPin", memberId: member.id, pin: testPin });
        addResult("2. 테스트 PIN 설정", true, "테스트 계정에만 저장");
      } else addResult("2. 테스트 PIN 설정", true, "이미 설정됨");

      const verified = await request(api, { action: "verifyPin", memberId: member.id, pin: testPin });
      if (!verified.ok) throw new Error("테스트 PIN 확인 실패");
      addResult("3. 테스트 PIN 확인", true, "POST 연결 정상");

      await request(api, { action: "checkin", memberId: member.id, pin: testPin, done: true, memo: "QA 자동 점검" });
      addResult("4. 테스트 인증 저장", true, "별도 테스트 시트의 자동 점검 계정에만 저장");

      state = await request(`${api}?_=${Date.now()}`);
      const saved = state.checkins.some(item => item.memberId === member.id && item.day === state.challenge.today && item.done === true);
      if (!saved) throw new Error("새로 조회했지만 테스트 인증이 없어.");
      addResult("5. 저장 재조회", true, `${state.challenge.today}일차 저장 확인`);

      await request(api, { action: "checkin", memberId: member.id, pin: testPin, done: false, memo: "QA 자동 점검 완료" });
      state = await request(`${api}?_=${Date.now()}`);
      if (state.checkins.some(item => item.memberId === member.id && item.day === state.challenge.today && item.done)) throw new Error("자동 점검 계정의 인증 취소 실패");
      addResult("6. 자동 점검 인증 취소", true, "테스트02만 미완료로 복귀 · 테스트01 기록 유지");

      status.className = "status ok";
      status.textContent = "전체 점검 통과 · 운영 참가자 데이터는 사용하지 않았어.";
    } catch (error) {
      addResult("중단", false, error && error.name === "AbortError" ? "응답 시간 초과 (HP-TIMEOUT-01)" : String(error.message || error));
      status.className = "status error";
      status.textContent = "점검이 중단됐어. 실패 단계부터 확인해 줘.";
    } finally {
      runButton.disabled = false;
    }
  }

  runButton.addEventListener("click", run);
})();
