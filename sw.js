// 습관파티 서비스워커 — PWA 설치 요건 + 앱 껍데기 오프라인 캐싱
//
// ★ 캐시 버전 걱정 안 해도 됨 (2026-07-08 자동화):
//   - HTML은 절대 캐시에서 주지 않음(항상 네트워크) → 새 코드 배포하면 바로 반영.
//   - JS/CSS 등 나머지는 "네트워크 우선" — 온라인이면 언제나 최신, 오프라인일 때만 캐시.
//   - 그래서 코드 바꿔도 아래 CACHE 숫자를 손으로 안 올려도 사용자는 최신을 봄.
//     (버전은 그냥 "오래된 캐시 청소" 용도. 대청소가 필요할 때만 올리면 됨.)
const CACHE = "habitparty-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  // 새 코드 껍데기를 미리 받아둠. 오프라인 폴백용.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  // Wait for old controlled tabs to close. They may still have unsafe reload handlers.
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => /^habitparty-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()) // 열려있는 탭도 새 SW가 즉시 제어
  );
});

// Deliberately ignore legacy SKIP_WAITING messages: never interrupt another tab's write.

function isHTML(req) {
  return req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 구글시트 API(데이터)는 항상 네트워크 — 캐시 안 함
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // A root service worker must not handle the separately scoped QA application.
  if (url.pathname.slice(new URL(self.registration.scope).pathname.length).startsWith("qa/")) return;

  // ★ HTML(페이지 뼈대)은 항상 네트워크에서 새로. 옛 화면이 박히는 걸 원천 차단.
  //   오프라인일 때만 캐시된 index.html로 폴백.
  if (isHTML(req)) {
    e.respondWith(
      fetch(req).catch(() => caches.open(CACHE).then(async c => (await c.match("./index.html")) || c.match("./")))
    );
    return;
  }

  // 그 외(JS/CSS/이미지): 네트워크 우선, 성공하면 캐시 갱신, 실패 시 캐시
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (req.method === "GET" && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.open(CACHE).then(c => c.match(req)))
  );
});
