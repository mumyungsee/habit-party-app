const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Only Google service boundaries are replaced; all production backend functions run unchanged.
module.exports = function backendFixture() {
  const state = { now: '2026-09-07T12:00:00+09:00' };
  const tables = {
    members: [['id','name','team','role','mission','emoji','pin'], ...Array.from({length:14}, (_,i) => [`qa${i+1}`,`테스트${i+1}`, i<7?'파티 1':'파티 2','참가자','학습 기록','🐱',i===0?'':'0123'])],
    checkins: [['memberId','name','day','date','done','memo','updatedAt']],
  };
  const sheet = name => ({
    getDataRange: () => ({getValues: () => tables[name].map(r=>r.slice())}),
    getRange: (row,col) => ({
      setValue(value) { tables[name][row-1][col-1] = typeof value==='string' ? value.replace(/^'/,'') : value; },
      setValues(values) { values.forEach((r,i)=>r.forEach((v,j)=>{tables[name][row-1+i] ||= []; tables[name][row-1+i][col-1+j]=v;})); },
    }),
    appendRow: row => tables[name].push(row.slice()),
  });
  class Clock extends Date { constructor(...args) { super(...(args.length?args:[state.now])); } static now(){return new Date(state.now).getTime();} }
  const context = vm.createContext({
    Date: Clock,
    SpreadsheetApp: {getActiveSpreadsheet:()=>({getId:()=> 'synthetic-only'}),openById:id=>{if(id!=='synthetic-only')throw Error('production access blocked');return {getSheetByName:sheet};},flush(){}},
    LockService: {getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    Utilities: {formatDate: (date,_tz,pattern) => {const s=new Date(+date+9*3600000).toISOString();return pattern==='yyyy-MM-dd'?s.slice(0,10):s.slice(0,19).replace('T',' ');}},
    ContentService: {MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8'),context);
  return {state,tables,get:()=>JSON.parse(context.doGet().text),post:body=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text)};
};
