(function () {
  const config = window.HABIT_PARTY_QA_CONFIG;
  const report = window.HabitPartyReport;
  const status = document.getElementById("status");
  const reloadButton = document.getElementById("reloadButton");

  function text(value) {
    return document.createTextNode(String(value));
  }

  function card(label, value) {
    const element = document.createElement("article");
    element.className = "card";
    const labelElement = document.createElement("div");
    labelElement.className = "label";
    labelElement.appendChild(text(label));
    const valueElement = document.createElement("div");
    valueElement.className = "value";
    valueElement.appendChild(text(value));
    element.append(labelElement, valueElement);
    return element;
  }

  async function getJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const separator = url.includes("?") ? "&" : "?";
      const response = await fetch(`${url}${separator}_=${Date.now()}`, { method: "GET", signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function render(summary) {
    const challenge = summary.challenge;
    const summaryBox = document.getElementById("summary");
    summaryBox.replaceChildren(
      card("현재 일차", `${challenge.today} / ${challenge.totalDays}일`),
      card("전체 참가자", `${summary.totalMembers}명`),
      card("오늘 인증", `${summary.todayDone}명`),
      card("누적 인증", `${summary.totalCheckins}건`),
    );
    summaryBox.hidden = false;

    const teamCards = document.getElementById("teamCards");
    teamCards.replaceChildren(...summary.teams.map(team => card(team.name, `${team.todayDone} / ${team.total}명`)));
    document.getElementById("teams").hidden = false;

    const rows = document.getElementById("peopleRows");
    rows.replaceChildren(...summary.people.map(person => {
      const row = document.createElement("tr");
      const values = [
        person.name,
        person.team,
        person.todayDone ? "완료" : "대기",
        `${person.totalDone}일`,
        person.lastDay ? `${person.lastDay}일차 · ${person.lastDate}` : "없음",
        person.needsAttention ? `${person.consecutiveMissed}일 연속 미인증` : "-",
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.appendChild(text(value));
        if (index === 2) cell.className = person.todayDone ? "done" : "wait";
        if (index === 5 && person.needsAttention) cell.className = "attention";
        row.appendChild(cell);
      });
      return row;
    }));
    document.getElementById("people").hidden = false;
  }

  async function load() {
    reloadButton.disabled = true;
    status.className = "status";
    status.textContent = "운영 데이터를 불러오는 중…";
    try {
      const payload = await getJson(config.productionApiUrl, 10000);
      const summary = report.summarize(payload);
      render(summary);
      status.className = "status ok";
      status.textContent = `정상 연결 · 참가자 ${summary.totalMembers}명 · 오늘 인증 ${summary.todayDone}명`;
      document.getElementById("updatedAt").textContent = `마지막 확인 ${new Date().toLocaleString("ko-KR")}`;
    } catch (error) {
      const timeout = error && error.name === "AbortError";
      status.className = "status error";
      status.textContent = timeout
        ? "응답이 너무 오래 걸려 중단했어. 다시 불러와 줘. (HP-TIMEOUT-01)"
        : "운영 데이터를 불러오지 못했어. 인터넷 연결 뒤 다시 불러와 줘. (HP-LOAD-01)";
      console.error(error);
    } finally {
      reloadButton.disabled = false;
    }
  }

  reloadButton.addEventListener("click", load);
  load();
})();
