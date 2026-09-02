/** StealthRate append-only Apps Script adapter. The key spreadsheet is never read. */
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try { return json_(dispatch_(e.parameter.op || '', e.parameter)); }
  catch (err) { return json_({ok: false, error: String(err)}); }
}

function doPost(e) {
  try {
    var body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    return json_(dispatch_(body.op || '', body));
  } catch (err) { return json_({ok: false, error: String(err)}); }
}

function sheet_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('STUDY_SHEET_ID'));
}

function tab_(name) {
  var tab = sheet_().getSheetByName(name);
  if (!tab) throw new Error('missing sheet tab: ' + name);
  return tab;
}

function rows_(name) {
  var tab = tab_(name), values = tab.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values.shift();
  return values.filter(function(row) { return row.some(function(x) { return x !== ''; }); }).map(function(row) {
    var obj = {}; headers.forEach(function(h, i) { obj[h] = row[i]; }); return obj;
  });
}

function append_(name, object, headers) {
  var tab = tab_(name);
  tab.appendRow(headers.map(function(h) { return object[h] === undefined ? '' : object[h]; }));
}

function dispatch_(op, p) {
  if (op === 'assign') return assign_(p);
  if (op === 'event') return appendEvent_(p);
  if (op === 'response') return appendResponse_(p);
  if (op === 'complete') return complete_(p);
  throw new Error('unknown op');
}

function assign_(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var study = p.study || '', pid = p.pid_hash || '';
    if (!study || !pid) throw new Error('study and pid_hash required');
    var properties = PropertiesService.getScriptProperties();
    var cap = Number(properties.getProperty('MAX_SESSIONS') || 10000);
    var sessions = rows_('sessions');
    if (sessions.length >= cap) throw new Error('session cap reached');
    var existing = sessions.filter(function(row) { return row.study === study && row.pid_hash === pid && row.status !== 'abandoned'; });
    if (existing.length) return {ok: true, session_id: existing[0].session_id, block_id: existing[0].block_id, existing: true};
    var blocks = rows_('blocks');
    if (!blocks.length) throw new Error('no blocks configured');
    var now = Date.now();
    var active = sessions.filter(function(row) { return row.study === study && row.status === 'started' && now - new Date(row.started_at).getTime() < 30 * 60 * 1000; });
    var best = blocks.map(function(block) {
      var assigned = active.filter(function(row) { return row.block_id === block.block_id; }).length;
      var completed = sessions.filter(function(row) { return row.block_id === block.block_id && row.status === 'completed'; }).length;
      return {block: block, score: assigned - completed, completed: completed};
    }).sort(function(a, b) { return a.score - b.score || a.completed - b.completed; })[0].block;
    var session = 's_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    append_('sessions', {session_id: session, study: study, block_id: best.block_id, pid_hash: pid, ua_hash: p.ua_hash || '', started_at: new Date().toISOString(), finished_at: '', status: 'started', headphone_check: '', completion_code: ''}, ['session_id','study','block_id','pid_hash','ua_hash','started_at','finished_at','status','headphone_check','completion_code']);
    return {ok: true, session_id: session, block_id: best.block_id, items: JSON.parse(best.item_order_json)};
  } finally { lock.releaseLock(); }
}

function appendEvent_(p) {
  append_('events', {session_id: p.session_id, ts: p.ts || new Date().toISOString(), type: p.type, item_id: p.item_id || '', payload_json: JSON.stringify(p.payload || {})}, ['session_id','ts','type','item_id','payload_json']);
  return {ok: true};
}

function appendResponse_(p) {
  var rows = rows_('responses'), duplicate = rows.some(function(row) { return row.session_id === p.session_id && row.item_id === p.item_id && row.task === p.task; });
  if (!duplicate) append_('responses', {session_id: p.session_id, item_id: p.item_id, task: p.task, answers_json: JSON.stringify(p.answers || {}), rt_ms: p.rt_ms || 0, replay_count: p.replay_count || 0, submitted_at: p.submitted_at || new Date().toISOString()}, ['session_id','item_id','task','answers_json','rt_ms','replay_count','submitted_at']);
  return {ok: true, duplicate: duplicate};
}

function complete_(p) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
  var bytes = Utilities.computeHmacSha256Signature(String(p.session_id || ''), secret);
  var code = bytes.map(function(b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('').slice(0, 8).toUpperCase();
  append_('sessions', {session_id: p.session_id, study: p.study || '', block_id: p.block_id || '', pid_hash: '', ua_hash: '', started_at: '', finished_at: new Date().toISOString(), status: 'completed', headphone_check: '', completion_code: code}, ['session_id','study','block_id','pid_hash','ua_hash','started_at','finished_at','status','headphone_check','completion_code']);
  return {ok: true, completion_code: code};
}
