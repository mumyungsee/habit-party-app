// Local-only browser fixture. No requests or writes to the production API.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv.includes('--baseline')
  ? path.resolve(__dirname, '../../habit-party-mvp')
  : path.resolve(__dirname, '..');
const member = { id: 'qa-login', name: '가상 로그인 점검', team: '테스트 파티', role: '참가자', mission: '가상 인증', hasPin: true };
let checkins = [];
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8768');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/__test-api') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify({ ok: true, challenge: { today: 1, totalDays: 17, canCheckIn: true }, members: [member], checkins }));
      const input = JSON.parse(body);
      const ok = input.memberId === member.id && input.pin === '1234';
      if (ok && input.action === 'checkin') checkins = [{ memberId: member.id, day: 1, done: input.done, memo: '' }];
      res.end(JSON.stringify({ ok, day: 1 }));
    });
    return;
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['index.html', 'app.js', 'data.js', 'style.css', 'manifest.json', 'icon-192.png', 'icon-512.png'].includes(name)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(path.join(root, name));
  if (name === 'data.js') body = body.toString().replace(/const API_URL = "[^"]+";/, 'const API_URL = "/__test-api";');
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
  res.end(body);
}).listen(8768, '127.0.0.1', () => console.log('Local synthetic login fixture: http://127.0.0.1:8768 (' + (process.argv.includes('--baseline') ? 'baseline' : 'fixed') + ')'));
