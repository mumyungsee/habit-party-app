const test = require("node:test");
const assert = require("node:assert/strict");
const { summarize } = require("../qa/report.js");

function payload(today, checkins) {
  return {
    ok: true,
    challenge: { startDate: "2026-09-07", totalDays: 17, today, canCheckIn: true },
    members: [
      { id: "m1", name: "테스트1", team: "파티 1" },
      { id: "m2", name: "테스트2", team: "파티 1" },
      { id: "m3", name: "테스트3", team: "파티 2" },
      { id: "empty", name: "", team: "파티 2" },
    ],
    checkins,
  };
}

test("빈 자리는 참가자와 파티 인원에서 제외한다", () => {
  const report = summarize(payload(1, []));
  assert.equal(report.totalMembers, 3);
  assert.deepEqual(report.teams.map(team => [team.name, team.total]), [["파티 1", 2], ["파티 2", 1]]);
});

test("같은 날 중복 행은 참가자 누적 일수에서 한 번만 센다", () => {
  const report = summarize(payload(2, [
    { memberId: "m1", day: 1, done: true },
    { memberId: "m1", day: 1, done: true },
    { memberId: "m1", day: 2, done: true },
  ]));
  assert.equal(report.people.find(person => person.id === "m1").totalDone, 2);
});

test("1일 차에는 미인증 경고를 표시하지 않는다", () => {
  const report = summarize(payload(1, []));
  assert.equal(report.people.every(person => person.needsAttention === false), true);
});

test("이틀 연속 미인증만 확인 대상으로 표시한다", () => {
  const report = summarize(payload(3, [
    { memberId: "m1", day: 1, done: true },
    { memberId: "m2", day: 2, done: true },
  ]));
  assert.equal(report.people.find(person => person.id === "m1").needsAttention, true);
  assert.equal(report.people.find(person => person.id === "m2").needsAttention, false);
});
