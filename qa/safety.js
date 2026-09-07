(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HabitPartyQaSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function assertSafeEndpoint(stagingApiUrl, productionApiUrl) {
    const staging = String(stagingApiUrl || "").trim();
    const production = String(productionApiUrl || "").trim();
    if (!staging) throw new Error("테스트 API 주소가 아직 설정되지 않았어.");
    if (staging === production) throw new Error("안전 차단: 테스트 API가 운영 API와 같아.");
    const parse = value => {
      const url = new URL(value);
      const match = url.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/);
      if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !match || url.username || url.password || url.search || url.hash) throw new Error('올바른 Apps Script 배포 주소가 아니야.');
      return match[1];
    };
    if (parse(staging) === parse(production)) throw new Error('운영 배포로 연결할 수 없어.');
    return staging;
  }

  return { assertSafeEndpoint };
});
