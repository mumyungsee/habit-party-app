# 습관파티 MVP (웹앱)

AI 학습스터디 23기 30일 챌린지용 — 팀(파티) 단위로 매일 미션을 인증하고, 같이 보는 대시보드.

## 구조
- `index.html` / `style.css` / `app.js` — 화면·로직
- `data.js` — 데이터 레이어 (구글시트 Apps Script 연동)
- `apps-script/Code.gs` — 백엔드 (구글시트에 붙는 Apps Script, 배포 코드)
- `apps-script/셋업가이드.md` — 시트·배포 셋업 방법

## 데이터
구글시트 = DB. 시트 2탭:
- `members`: id|name|team|role|mission|emoji|pin (사람들이 자기 역할 줄에 이름 적음)
- `checkins`: memberId|name|day|date|done|memo|updatedAt (인증 시 자동 적재)

## 신분
이름 선택 + 핀 4자리 (처음 설정, 시트 저장). 가입·이메일 없음.

## 로컬 테스트
```
python -m http.server 8123
# → http://localhost:8123
```
(file:// 로 열면 CORS로 시트 연동 막힘 → 서버나 호스팅 필요)

## 관련
- 기획·작업 기록: `../../docs/devlog/`
- 프로젝트 맥락: 메모리 `project_habit-party-launch`
