/** Private v2 receiver. doPost mutates only after complete validation; doGet is health-only. */
var RECEIVER = {
  STUDY_ID: 'human_real_stealth_v2', VERSION: '2.0.0-pilot', MAX_BODY: 256 * 1024,
  TABS: {
    invitations: ['invite_sha256','annotator_id','block_id','item_order_json','enabled'],
    responses: ['invite_sha256','annotator_id','session_id','block_id','item_id','task','edited','noticed','audio_clarity','visual_readability','conspicuousness','naturalness','stealth_display','confidence','comment','technical_issue','rt_ms','replay_count','answers_json','stored_at'],
    sessions: ['invite_sha256','annotator_id','session_id','block_id','assigned_count','response_count','completed','updated_at']
  }
};

function json_(value, code) {
  var out = ContentService.createTextOutput(JSON.stringify(value));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script does not expose a portable status setter; callers must inspect ok/error.
  return out;
}
function doGet() { return json_({ok:true,service:'human_real_stealth_v2',version:RECEIVER.VERSION}); }
function fail_(message, code) { var e = new Error(message); e.code = code || 'INVALID_REQUEST'; throw e; }
function prop_(name) { return PropertiesService.getScriptProperties().getProperty(name) || ''; }
function requireConfig_() {
  if (prop_('STUDY_SHEET_ID') !== '') return;
  fail_('receiver_not_configured','NOT_CONFIGURED');
}
function hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(function(x){var h=(x<0?x+256:x).toString(16);return h.length===1?'0'+h:h;}).join(''); }
function parse_(event) {
  var raw = event && event.postData && event.postData.contents || '';
  if (!raw || raw.length > RECEIVER.MAX_BODY) fail_('invalid_body','INVALID_BODY');
  var body; try { body=JSON.parse(raw); } catch(e) { fail_('invalid_json','INVALID_JSON'); }
  if (!body || body.op !== 'sync' || body.study_id !== RECEIVER.STUDY_ID || body.version !== RECEIVER.VERSION) fail_('study_or_version_mismatch','WRONG_STUDY_VERSION');
  if (!/^[0-9a-f]{32}$/.test(String(body.invite_token || ''))) fail_('invalid_invite_token','INVALID_INVITE');
  if (!body.bundle || typeof body.bundle !== 'object') fail_('missing_bundle','INVALID_BUNDLE');
  if (!Array.isArray(body.bundle.responses)) fail_('responses_must_be_array','INVALID_BUNDLE');
  return body;
}
function sheet_() { return SpreadsheetApp.openById(prop_('STUDY_SHEET_ID')); }
function rows_(tab) { var v=tab.getDataRange().getValues(); return v.length>1?v.slice(1):[]; }
function col_(headers,name) { var i=headers.indexOf(name); if(i<0) fail_('missing_sheet_column_'+name,'SHEET_SCHEMA'); return i; }
function invitation_(ss, tokenHash) {
  var tab=ss.getSheetByName('invitations'); if(!tab) fail_('missing_invitations_tab','SHEET_SCHEMA');
  var h=tab.getRange(1,1,1,tab.getLastColumn()).getValues()[0], rows=rows_(tab), ih=col_(h,'invite_sha256');
  var found=null; rows.forEach(function(r){if(String(r[ih])===tokenHash) found={row:r,headers:h};});
  if(!found || !(found.row[col_(found.headers,'enabled')]===true || String(found.row[col_(found.headers,'enabled')]).toLowerCase()==='true')) fail_('invitation_not_allowed','INVITATION_DENIED');
  var order; try { order=JSON.parse(String(found.row[col_(found.headers,'item_order_json')])); } catch(e){fail_('invalid_invitation_order','SHEET_SCHEMA');}
  if(!Array.isArray(order)) fail_('invalid_invitation_order','SHEET_SCHEMA');
  var rated={}; order.forEach(function(x){var id=typeof x==='string'?x:x.item_id; var practice=typeof x==='object' && !!x.practice; if(id && !practice) rated[String(id)]=true;});
  return {row:found.row,headers:found.headers,hash:tokenHash,annotator:String(found.row[col_(found.headers,'annotator_id')]),block:String(found.row[col_(found.headers,'block_id')]),rated:rated,assigned:Object.keys(rated)};
}
function sessionId_(s) { return String((s&& (s.session_id || s.id || s.sessionId)) || ''); }
function blockId_(s) { return String((s&& (s.block_id || s.blockId)) || ''); }
function str_(x) { return x === undefined || x === null ? '' : String(x); }
function formulaSafe_(x) { var s=str_(x); return /^[=+\-@]/.test(s)?"'"+s:s; }
function cell_(x) { if (x===null || x===undefined) return ''; if (typeof x==='number' || typeof x==='boolean') return x; return formulaSafe_(Array.isArray(x)?JSON.stringify(x):x); }
function int_(x,lo,hi,name,allowNull) { if(allowNull && (x===null || x===undefined || x==='')) return null; if(!Number.isInteger(x)||x<lo||x>hi) fail_('invalid_'+name,'INVALID_RATING'); return x; }
function noticed_(x) {
  if (x===null || x===undefined || x==='') return null;
  if (!Array.isArray(x)) fail_('noticed_must_be_array','INVALID_RATING');
  var vals=x, allowed={on_screen_text:true,added_speech:true,other:true};
  if (!vals.length) return [];
  if (vals.some(function(v){return !Object.prototype.hasOwnProperty.call(allowed,String(v));})) fail_('invalid_noticed','INVALID_RATING');
  var unique={}; vals.forEach(function(v){unique[String(v)]=true;});
  return Object.keys(unique);
}
function validateResponse_(r, invite, sid) {
  if(!r || typeof r!=='object') fail_('invalid_response','INVALID_RESPONSE');
  ['session_id','item_id','task','answers','rt_ms','replay_count'].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(r,k)) fail_('missing_response_field_'+k,'INVALID_RESPONSE');});
  if(String(r.session_id)!==sid) fail_('response_session_mismatch','SESSION_DENIED');
  var a=r.answers; if(!a || typeof a!=='object' || Array.isArray(a)) fail_('answers_must_be_object','INVALID_RESPONSE');
  ['edited','noticed','audio_clarity','visual_readability','conspicuousness','naturalness','confidence','comment','technical_issue'].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(a,k)) fail_('missing_answer_field_'+k,'INVALID_RESPONSE');});
  var id=str_(r.item_id); if(!Object.prototype.hasOwnProperty.call(invite.rated,id)) fail_('item_not_assigned','ITEM_NOT_ASSIGNED');
  if(str_(r.task)!=='edit') fail_('task_must_be_edit','INVALID_TASK');
  var issue=str_(a.technical_issue); if(issue.toLowerCase()==='none') issue='';
  if(issue.length>500) fail_('technical_issue_too_long','INVALID_TEXT');
  var noticed=noticed_(a.noticed), comment=str_(a.comment); if(comment.length>500) fail_('comment_too_long','INVALID_TEXT');
  var edited=a.edited;
  if(issue) {
    if(edited!==null || (noticed!==null && noticed.length!==0) || a.audio_clarity!==null || a.visual_readability!==null || a.conspicuousness!==null || a.naturalness!==null || a.confidence!==null) fail_('technical_issue_requires_null_ratings','INVALID_TECHNICAL_ISSUE');
  } else {
    if(edited!=='yes' && edited!=='no') fail_('invalid_edited','INVALID_RATING');
    ['audio_clarity','visual_readability'].forEach(function(k){int_(a[k],0,5,k,false);});
    ['conspicuousness','naturalness'].forEach(function(k){int_(a[k],1,5,k,false);}); int_(a.confidence,1,3,'confidence',false);
  }
  if(!Number.isFinite(r.rt_ms) || r.rt_ms<0 || !Number.isInteger(r.replay_count) || r.replay_count<0) fail_('invalid_timing_fields','INVALID_RESPONSE');
  return {item_id:id,session_id:sid,task:'edit',edited:edited,noticed:noticed,audio_clarity:a.audio_clarity,visual_readability:a.visual_readability,conspicuousness:a.conspicuousness,naturalness:a.naturalness,stealth_display:a.conspicuousness===null?null:6-a.conspicuousness,confidence:a.confidence,comment:comment,technical_issue:issue,rt_ms:r.rt_ms,replay_count:r.replay_count};
}
function answerKey_(r) { return JSON.stringify(r); }
function doPost(event) {
  try {
    requireConfig_(); var body=parse_(event), tokenHash=hash_(body.invite_token), ss=sheet_(), invite=invitation_(ss,tokenHash), session=body.bundle.session||{}, sid=sessionId_(session), bid=blockId_(session);
    if(String(session.study_id||'')!==RECEIVER.STUDY_ID || String(session.version||'')!==RECEIVER.VERSION) fail_('session_study_or_version_mismatch','SESSION_DENIED');
    if(!sid || bid!==invite.block) fail_('session_or_block_mismatch','SESSION_DENIED');
    var rs=body.bundle.responses; if(rs.length>Math.min(12,invite.assigned.length)) fail_('too_many_responses','TOO_MANY_RESPONSES');
    var clean=rs.map(function(r){return validateResponse_(r,invite,sid);}), seen={}; clean.forEach(function(r){if(seen[r.item_id]) fail_('duplicate_item','DUPLICATE_ITEM'); seen[r.item_id]=true;});
    var rt=ss.getSheetByName('responses'), st=ss.getSheetByName('sessions'); if(!rt||!st) fail_('missing_storage_tabs','SHEET_SCHEMA');
    RECEIVER.TABS.responses.forEach(function(h){col_(rt.getRange(1,1,1,rt.getLastColumn()).getValues()[0],h);});
    RECEIVER.TABS.sessions.forEach(function(h){col_(st.getRange(1,1,1,st.getLastColumn()).getValues()[0],h);});
    var rh=rt.getRange(1,1,1,rt.getLastColumn()).getValues()[0], old=rows_(rt), ih=col_(rh,'invite_sha256'), sh=col_(rh,'session_id'), it=col_(rh,'item_id'), aj=col_(rh,'answers_json');
    var existing={}; old.forEach(function(row){if(String(row[ih])===tokenHash){if(String(row[sh])!==sid) fail_('invitation_already_bound','SESSION_CONFLICT'); existing[String(row[it])]=String(row[aj]);}});
    var toWrite=[]; clean.forEach(function(r){var k=r.item_id, a=answerKey_(r); if(existing[k]!==undefined){if(existing[k]!==a) fail_('conflicting_retry','CONFLICTING_ANSWER');} else toWrite.push(r);});
    var lock=LockService.getScriptLock(); if(!lock.tryLock(10000)) fail_('busy_retry','LOCK_BUSY');
    try {
      var sessionHeaders=st.getDataRange().getValues()[0];
      rows_(st).forEach(function(row){
        if(String(row[col_(sessionHeaders,'invite_sha256')])===tokenHash && String(row[col_(sessionHeaders,'session_id')])!==sid) fail_('invitation_already_bound','SESSION_CONFLICT');
      });
      // Re-read under lock so two browser submissions cannot race the deduplication check.
      old=rows_(rt); existing={}; old.forEach(function(row){if(String(row[ih])===tokenHash){if(String(row[sh])!==sid) fail_('invitation_already_bound','SESSION_CONFLICT'); existing[String(row[it])]=String(row[aj]);}});
      toWrite=[]; clean.forEach(function(r){var a=answerKey_(r); if(existing[r.item_id]!==undefined){if(existing[r.item_id]!==a) fail_('conflicting_retry','CONFLICTING_ANSWER');} else toWrite.push(r);});
      var responseRows=toWrite.map(function(r){var out=[]; rh.forEach(function(h){var v={invite_sha256:tokenHash,annotator_id:invite.annotator,session_id:sid,block_id:invite.block,item_id:r.item_id,task:r.task,edited:r.edited,noticed:r.noticed,audio_clarity:r.audio_clarity,visual_readability:r.visual_readability,conspicuousness:r.conspicuousness,naturalness:r.naturalness,stealth_display:r.stealth_display,confidence:r.confidence,comment:r.comment,technical_issue:r.technical_issue,rt_ms:r.rt_ms,replay_count:r.replay_count,answers_json:answerKey_(r),stored_at:new Date().toISOString()}[h]; out.push(cell_(v));}); return out;});
      if(responseRows.length) rt.getRange(rt.getLastRow()+1,1,responseRows.length,rh.length).setValues(responseRows);
      var completedCount=Object.keys(existing).length+toWrite.length, sts=st.getDataRange().getValues(), shh=sts[0], srows=sts.slice(1), found=-1; srows.forEach(function(row,i){if(String(row[col_(shh,'invite_sha256')])===tokenHash) found=i+2;}); var vals={invite_sha256:tokenHash,annotator_id:invite.annotator,session_id:sid,block_id:invite.block,assigned_count:invite.assigned.length,response_count:completedCount,completed:completedCount===invite.assigned.length,updated_at:new Date().toISOString()}; var sline=shh.map(function(h){return formulaSafe_(vals[h]);}); if(found>0) st.getRange(found,1,1,sline.length).setValues([sline]); else st.appendRow(sline);
    } finally { lock.releaseLock(); }
    return json_({ok:true,ack_response_count:clean.length});
  } catch(e) { return json_({ok:false,error_code:e.code||'SERVER_ERROR',error:String(e.message||e)}); }
}
function initializeTabs() {
  requireConfig_(); var ss=sheet_(); Object.keys(RECEIVER.TABS).forEach(function(name){var tab=ss.getSheetByName(name)||ss.insertSheet(name); if(tab.getLastRow()===0) tab.getRange(1,1,1,RECEIVER.TABS[name].length).setValues([RECEIVER.TABS[name]]);});
}
