/* Display translations only: never rebuild the study form or change response values. */
(() => {
  'use strict';
  const preferenceKey = 'audio-study-ui-language';
  const translations = new Map(Object.entries({
    'Short video study': '短视频研究',
    'Participant page': '参与者页面',
    'Watch 30 short clips and give two independent ratings for each one: whether you noticed an added voice, and how much speech you understood. The study takes about 15–20 minutes.': '观看 30 个短视频，分别回答两个问题：是否注意到后期加入的人声，以及听懂了多少话语。整个过程约需 15–20 分钟。',
    'Study overview': '研究概览',
    '30 clips': '30 个视频',
    '2 independent ratings': '2 个独立问题',
    '~15–20 min': '约 15–20 分钟',
    'Enter your assigned code': '输入分配给你的编号',
    'Begin study': '开始作答',
    'Participation is voluntary. Keep the volume comfortable and stop if you need a break. Your responses are saved in this browser as you work; download the CSV and JSON at the end and send them privately to the study owner. Automatic upload to Google Sheets is not connected.': '参与完全自愿。请保持舒适音量，需要休息时可以暂停。作答过程中，进度会保存在当前浏览器中。完成后，请下载 CSV 和 JSON 文件，并私下发送给研究负责人。页面不会自动上传到 Google Sheets。',
    '帮助 / Help': '帮助',
    'Watch. Listen. Two quick ratings.': '观看、聆听，回答两个简短问题。',
    'Some clips contain a voice that may have been added; others do not.': '有些片段中可能有后期加入的人声，有些没有。',
    'Answer whether you noticed an added voice, then how much of that speech you understood.': '先回答是否注意到后期加入的人声，再回答听懂了多少话语。',
    'Start playback, then answer whenever ready. You do not need to finish the clip. Replays are okay.': '先播放视频，准备好后即可作答，不必等视频播放结束。可以重复播放。',
    'Use a comfortable, steady volume. Lower it or stop if it feels too loud.': '请使用舒适、稳定的音量。如果觉得太响，请调低音量或停止播放。',
    'About 15–20 minutes. You can pause and return in this browser. No name or email needed.': '约需 15–20 分钟。可以暂停，稍后在同一浏览器中继续。无需填写姓名或邮箱。',
    'At the end, download your responses and send them privately to your coordinator.': '完成后，请下载作答文件，并私下发送给研究组织者。',
    'Start': '开始',
    'Listen to this clip': '请聆听这个片段',
    '1. Did you notice a voice that seemed to have been added?': '1. 你是否注意到似乎是后期加入的人声？',
    'No': '没有',
    'Not sure': '不确定',
    'Yes': '有',
    'If yes, how noticeable was it?': '如果有，这段人声有多明显？',
    'Barely': '几乎察觉不到',
    'Slightly': '略微明显',
    'Clearly': '明显',
    'Very obvious': '非常明显',
    '2. How much of that speech could you understand?': '2. 这段人声中的话，你能听懂多少？',
    'Did not notice speech': '没注意到人声',
    'Heard a voice, no words': '听到了人声，但没听懂词语',
    'Some words': '部分词语',
    'Most words': '大部分词语',
    'All words': '全部词语',
    'Quick reminder / optional comment': '作答提示 / 留言（选填）',
    'Answer Q1 and Q2 independently. If you are unsure whether a voice was added, choose Not sure for Q1. For Q2, choose the speech level that matches what you heard.': '请分别回答两个问题。如果不确定人声是否为后期加入，第 1 题请选择“不确定”。第 2 题请根据实际听懂的程度作答。',
    'Anything we should know? (optional)': '有什么想告诉我们的吗？（选填）',
    'Back': '上一题',
    'Playback problem — skip': '播放有问题，跳过',
    'Save & next': '保存并继续',
    'Download CSV': '下载 CSV',
    'Download JSON': '下载 JSON',
    'Saved in this browser. Download your files when finished.': '已保存在当前浏览器中。完成后请下载作答文件。',
    'Browser saving is unavailable. Keep this page open and download a backup now.': '当前浏览器无法保存进度。请保持页面打开，并立即下载备份。',
    'This clip could not load. Please use Playback problem — skip.': '这个视频无法加载。请点击“播放有问题，跳过”。',
    'Please answer both questions; choose a noticeability level only when you selected Yes.': '请回答两个问题。第 1 题选择“有”时，还需选择人声的明显程度。',
    'Please play the clip first, or skip it if playback does not work.': '请先播放视频。如果无法播放，可以跳过。',
    'All done. Thank you!': '已完成，感谢参与！',
    'Download both files': '请下载两个文件',
    'and send them privately to your coordinator. Nothing has been uploaded automatically.': '，并私下发送给研究组织者。页面没有自动上传任何作答数据。',
    'Review my answers': '查看我的答案',
  }));

  for (const [prefix, last] of [['B', '040'], ['C', '080'], ['D', '080']]) {
    translations.set(
      `Use the code provided by the study coordinator (${prefix}001–${prefix}${last}). Codes are not assigned automatically; please complete only your assigned set.`,
      `请输入研究组织者提供的编号（${prefix}001–${prefix}${last}）。系统不会自动分配编号，请只完成分配给你的这一组。`,
    );
    translations.set(
      `Please enter your assigned code, from ${prefix}001 to ${prefix}${last}.`,
      `请输入分配给你的编号，范围为 ${prefix}001–${prefix}${last}。`,
    );
  }

  function normalize(value) {
    if (/^zh(?:-|$)/i.test(value || '')) return 'zh';
    if (/^en(?:-|$)/i.test(value || '')) return 'en';
    return null;
  }

  let stored = null;
  try { stored = localStorage.getItem(preferenceKey); } catch (_) { /* Optional preference. */ }
  const query = new URLSearchParams(window.location.search);
  let language = normalize(query.get('lang')) || normalize(query.get('language')) || normalize(stored) || 'en';
  const originals = new WeakMap();
  const originalTitle = document.title;

  function translate(source) {
    if (language === 'en') return source;
    const text = source.trim();
    let translated = translations.get(text);
    if (!translated && /^[BCD]\d{3} · 30 short clips$/.test(text)) {
      translated = text.replace('30 short clips', '30 个短视频');
    }
    if (!translated && /^\d+ \/ \d+ clips saved\.$/.test(text)) {
      translated = text.replace(/^(\d+) \/ (\d+) clips saved\.$/, '已保存 $1 / $2 个视频的答案。');
    }
    return translated ? source.replace(text, translated) : source;
  }

  function update(node, key, read, write) {
    const records = originals.get(node) || {};
    const current = read();
    const previous = records[key];
    // A new render or validation message can replace a previously translated node.
    const source = previous && current === previous.rendered ? previous.source : current;
    const rendered = translate(source);
    records[key] = { source, rendered };
    originals.set(node, records);
    if (current !== rendered) write(rendered);
  }

  function apply() {
    if (!window.document?.body) return;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = translate(originalTitle);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('script,style,textarea,input,[data-language-control]')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      update(node, 'text', () => node.nodeValue, value => { node.nodeValue = value; });
    }
    for (const element of document.querySelectorAll('[placeholder],[aria-label]')) {
      if (element.closest('[data-language-control]')) continue;
      for (const name of ['placeholder', 'aria-label']) {
        if (element.hasAttribute(name)) update(element, name, () => element.getAttribute(name), value => element.setAttribute(name, value));
      }
    }
  }

  const bar = document.createElement('div');
  bar.className = 'study-language';
  bar.dataset.languageControl = '';
  bar.innerHTML = '<label for="study-language">Language / 语言</label><select id="study-language" aria-label="Interface language / 界面语言"><option value="en" lang="en">English</option><option value="zh" lang="zh-CN">简体中文</option></select>';
  // Keep this outside #app so moving between questions does not remove it.
  const main = document.querySelector('main');
  if (main?.id === 'app') main.before(bar);
  else if (main) main.prepend(bar);
  else document.body.prepend(bar);
  const select = bar.querySelector('select');
  select.value = language;
  function remember() {
    try { localStorage.setItem(preferenceKey, language); } catch (_) { /* Still works for this page. */ }
  }
  select.addEventListener('change', () => {
    language = select.value;
    remember();
    // Replace a query override too, so refreshing respects the latest selection.
    const url = new URL(window.location.href);
    url.searchParams.delete('language');
    url.searchParams.set('lang', language);
    try { window.history.replaceState(null, '', url); } catch (_) { /* file:// or restricted browser. */ }
    apply();
  });
  remember();
  apply();
  // Translation touches text only: playback, drafts, controls and event handlers survive.
  new MutationObserver(apply).observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['placeholder', 'aria-label'],
  });
})();
