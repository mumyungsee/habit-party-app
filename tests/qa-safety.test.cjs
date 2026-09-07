const test = require("node:test");
const assert = require("node:assert/strict");
const { assertSafeEndpoint } = require("../qa/safety.js");

test("테스트 API가 비어 있으면 POST 점검을 차단한다", () => {
  assert.throws(() => assertSafeEndpoint("", "https://prod.example/exec"), /아직 설정되지/);
});

test("테스트 API가 운영 API와 같으면 POST 점검을 차단한다", () => {
  assert.throws(
    () => assertSafeEndpoint("https://prod.example/exec", "https://prod.example/exec"),
    /안전 차단/,
  );
});

test("운영과 다른 테스트 API만 허용한다", () => {
  assert.equal(
    assertSafeEndpoint("https://script.google.com/macros/s/test-id/exec", "https://script.google.com/macros/s/prod-id/exec"),
    "https://script.google.com/macros/s/test-id/exec",
  );
});

test('주소 변형이나 임의 서버를 테스트 URL로 쓰지 못한다',()=>{
 for(const url of ['https://evil.example/exec','https://script.google.com/macros/s/prod-id/exec?mode=test','https://script.google.com/macros/s/prod-id/exec#test']) {
   assert.throws(()=>assertSafeEndpoint(url,'https://script.google.com/macros/s/prod-id/exec'));
 }
});
