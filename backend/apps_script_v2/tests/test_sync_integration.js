/* In-memory server integration. No Google request or real invitation is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
let locked = false;
class Tab {
  constructor(headers) { this.values = [Array.from(headers)]; }
  getLastColumn() { return this.values[0].length; }
  getLastRow() { return this.values.length; }
  getDataRange() { return {getValues: () => this.values.map(r => [...r])}; }
  getRange(row, col, n, m) {
    return {
      getValues: () => Array.from({length:n}, (_,i) => Array.from({length:m},(_,j) => this.values[row+i-1]?.[col+j-1] ?? '')),
      setValues: data => {
        assert.equal(locked,true,'writes must hold lock');
        data.forEach((r,i) => { this.values[row+i-1] ??= []; r.forEach((x,j) => {this.values[row+i-1][col+j-1]=x;}); });
      },
    };
  }
  appendRow(row) { assert.equal(locked,true); this.values.push([...row]); }
}
const tabs = {};
const ctx = {
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='STUDY_SHEET_ID'?'mock':''})},
  SpreadsheetApp:{openById:()=>({getSheetByName:name=>tabs[name]})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_a,text)=>Array.from(crypto.createHash('sha256').update(text).digest())},
  LockService:{getScriptLock:()=>({tryLock(){assert.equal(locked,false);locked=true;return true;},releaseLock(){locked=false;}})},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../Code.gs'),'utf8'),ctx);
for(const [name,headers] of Object.entries(ctx.RECEIVER.TABS)) tabs[name]=new Tab(headers);
// Deliberately generated dummy data, never a real invitation or credential.
const token=['01234567','89abcdef'].join('').repeat(2);
const digest=crypto.createHash('sha256').update(token).digest('hex');
tabs.invitations.values.push([digest,'TEST_ONLY','block_1',JSON.stringify(['clip_1','clip_2']),true]);
const base={op:'sync',study_id:'human_real_stealth_v2',version:'2.0.0-pilot',invite_token:token,bundle:{session:{study_id:'human_real_stealth_v2',version:'2.0.0-pilot',session_id:'s_test',block_id:'block_1'},events:[],responses:[]}};
const row={session_id:'s_test',item_id:'clip_1',task:'edit',answers:{edited:'yes',noticed:['added_speech'],audio_clarity:3,visual_readability:0,conspicuousness:2,naturalness:4,confidence:2,comment:'=IMPORTRANGE("test")',technical_issue:null},rt_ms:1400,replay_count:1};
function post(body){return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text);}
function clone(x){return JSON.parse(JSON.stringify(x));}
assert.deepEqual(post(base),{ok:true,ack_response_count:0});
let request=clone(base); request.bundle.responses=[clone(row)];
assert.deepEqual(post(request),{ok:true,ack_response_count:1});
assert.equal(tabs.responses.getLastRow(),2);
assert.equal(tabs.responses.values[1][8],3,'numeric score must remain numeric');
assert.equal(tabs.responses.values[1][14].startsWith("'="),true,'formula-like note escaped');
assert.deepEqual(post(request),{ok:true,ack_response_count:1});
assert.equal(tabs.responses.getLastRow(),2,'idempotent retry');
let bad=clone(request); bad.bundle.responses[0].answers.audio_clarity=5;
assert.equal(post(bad).error_code,'CONFLICTING_ANSWER');
assert.equal(tabs.responses.getLastRow(),2);
bad=clone(request); bad.bundle.responses.push({...clone(row),item_id:'clip_2'}); bad.bundle.responses[1].answers.confidence=9;
assert.equal(post(bad).ok,false); assert.equal(tabs.responses.getLastRow(),2,'whole-request validation before write');
bad=clone(base); bad.bundle.session.session_id='s_other';
assert.equal(post(bad).error_code,'SESSION_CONFLICT');
bad=clone(request); bad.invite_token='f'.repeat(32);
assert.equal(post(bad).error_code,'INVITATION_DENIED');
bad=clone(request); bad.bundle.responses[0].item_id='toString';
assert.equal(post(bad).error_code,'ITEM_NOT_ASSIGNED');
bad=clone(request); bad.bundle.responses[0].answers.noticed=['__proto__'];
assert.equal(post(bad).error_code,'INVALID_RATING');
request.bundle.responses.push({...clone(row),item_id:'clip_2'});
assert.deepEqual(post(request),{ok:true,ack_response_count:2});
assert.equal(tabs.responses.getLastRow(),3);
assert.equal(locked,false);
const before=JSON.stringify(tabs);
ctx.doGet({parameter:{op:'sync'}});
assert.equal(JSON.stringify(tabs),before,'GET cannot mutate or reveal responses');
console.log('PASS full sync: valid writes, locks, numeric cells, retry, conflicts, invitation binding, malformed batch, formula escaping, prototype keys, GET');
