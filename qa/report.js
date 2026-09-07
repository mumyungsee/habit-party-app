(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HabitPartyReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function dateForDay(startDate, day) {
    const date = new Date(new Date(startDate + "T00:00:00+09:00").getTime() + (Number(day) - 1) * 86400000);
    return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(date);
  }

  function summarize(payload) {
    if (!payload || payload.ok !== true || !payload.challenge) throw new Error("invalid payload");
    const challenge = payload.challenge;
    const members = (payload.members || []).filter(member => String(member.name || "").trim());
    const completed = (payload.checkins || []).filter(checkin => checkin.done === true);
    const doneKey = new Set(completed.map(checkin => `${checkin.memberId}:${Number(checkin.day)}`));
    const today = Number(challenge.today);
    const teams = new Map();

    members.forEach(member => {
      if (!teams.has(member.team)) teams.set(member.team, { name: member.team, total: 0, todayDone: 0 });
      const team = teams.get(member.team);
      team.total += 1;
      if (doneKey.has(`${member.id}:${today}`)) team.todayDone += 1;
    });

    const people = members.map(member => {
      const mine = completed.filter(checkin => String(checkin.memberId) === String(member.id));
      const completedDays = [...new Set(mine.map(checkin => Number(checkin.day)))].sort((a, b) => a - b);
      const lastDay = completedDays.length ? completedDays[completedDays.length - 1] : null;
      let consecutiveMissed = 0;
      if (challenge.canCheckIn) {
        for (let day = today; day >= 1; day -= 1) {
          if (doneKey.has(`${member.id}:${day}`)) break;
          consecutiveMissed += 1;
        }
      }
      return {
        id: String(member.id),
        name: String(member.name),
        team: String(member.team),
        completedDays,
        totalDone: completedDays.length,
        todayDone: doneKey.has(`${member.id}:${today}`),
        lastDay,
        lastDate: lastDay ? dateForDay(challenge.startDate, lastDay) : "-",
        consecutiveMissed,
        needsAttention: today > 1 && consecutiveMissed >= 2,
      };
    });

    return {
      challenge,
      totalMembers: members.length,
      todayDone: people.filter(person => person.todayDone).length,
      totalCheckins: people.reduce((total, person) => total + person.totalDone, 0),
      teams: [...teams.values()],
      people,
    };
  }

  return { dateForDay, summarize };
});
