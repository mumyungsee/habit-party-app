const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const createBackend=require('./backend-fixture.cjs');
const root=path.resolve(__dirname,'..'),cases=new Map();
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:8769'); const key=u.searchParams.get('case')||'default';
 if(!cases.has(key))cases.set(key,{backend:createBackend(),fault:'',calls:[]}); const c=cases.get(key);
 res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/control'||u.pathname==='/api'){
  let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{
   res.setHeader('Content-Type','application/json'); const body=raw?JSON.parse(raw):{};
   if(u.pathname==='/control'){
    if(body.now)c.backend.state.now=body.now;
    if(body.fault!==undefined)c.fault=body.fault;
    if(body.complete)c.backend.post({action:'checkin',memberId:'qa2',pin:'0123',done:true});
    return res.end(JSON.stringify({data:c.backend.get(),calls:c.calls}));
   }
   c.calls.push(req.method==='GET'?'GET':body.action);
   const fault=c.fault;
   if(fault==='midnight-check'&&body.action==='checkin'){c.backend.state.now='2026-09-08T00:00:01+09:00';c.fault='';}
   if(fault==='get-fail'&&req.method==='GET'){res.writeHead(503);return res.end('{}');}
   if(fault==='pin-fail'&&body.action==='verifyPin'){res.writeHead(503);return res.end('{}');}
   if(fault==='check-fail'&&body.action==='checkin'){c.fault='get-fail';res.writeHead(503);return res.end('{}');}
   const out=req.method==='GET'?c.backend.get():c.backend.post(body);
   if((fault==='pin-lost'&&body.action==='setPin')||(fault==='check-lost'&&body.action==='checkin')){c.fault='';res.writeHead(503);return res.end('{}');}
   const send=()=>res.end(JSON.stringify(out));
   if(fault==='slow-check'&&body.action==='checkin')return setTimeout(send,3000);
   if(fault==='timeout-pin'&&body.action==='verifyPin')return setTimeout(send,20000);
   if(fault==='slow-pin'&&body.action==='verifyPin')return setTimeout(send,500);
   send();
  });return;
 }
 if(u.pathname==='/runner'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><meta charset="utf-8"><h1>가상 참가자 브라우저 검수</h1><button id="run">검수 실행</button><pre id="results"></pre><iframe id="app" style="width:390px;height:844px"></iframe><script src="/browser-suite.js"></script>');}
 if(u.pathname==='/browser-suite.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(__dirname,'browser-suite.js')));}
 const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(!['index.html','app.js','data.js','style.css','icon-192.png','icon-512.png','manifest.json'].includes(name)){res.writeHead(404);return res.end();}
 let body=fs.readFileSync(path.join(root,name));
 if(name==='index.html')body=body.toString().replace(/(src="(?:app|data)\.js)[^"]*/g,`$1?case=${encodeURIComponent(key)}`);
 if(name==='data.js')body=body.toString().replace(/const API_URL = "[^"]+";/,`const API_URL = "/api?case=${encodeURIComponent(key)}";`);
 res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(body);
}).listen(8769,'127.0.0.1',()=>console.log('Synthetic full-backend browser suite: http://127.0.0.1:8769/runner'));
