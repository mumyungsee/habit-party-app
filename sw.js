// 습관파티 서비스워커 — PWA 설치 요건 + 앱 껍데기 오프라인 캐싱(최소 버전)
// 캐시 버전: 앱 파일 바꾸면 숫자 올려서 갱신
const CACHE = "habitparty-v2";
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // 구글시트 API(데이터)는 항상 네트워크 — 캐시하지 않음
  if (url.hostname.includes("script.google.com")) return;
  // 그 외 앱 껍데기: 네트워크 우선, 실패 시 캐시(오프라인 대비)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (e.request.method === "GET" && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
