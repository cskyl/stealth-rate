import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const root = new URL("../../audio-study-environments/", import.meta.url);
const languageScript = await readFile(new URL("ui-language.js", root), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function page(file = "assignments/D001.html", query = "", stored = null, blocked = false) {
  const html = await readFile(new URL(file, root), "utf8");
  const dom = new JSDOM(html, {
    url: `https://study.example/audio-study-environments/${file}${query}`,
    runScripts: "dangerously",
    beforeParse(window) {
      if (stored) window.localStorage.setItem("audio-study-ui-language", stored);
      if (blocked) Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
    },
  });
  dom.window.eval(languageScript);
  await tick();
  return dom;
}

async function setLanguage(window, value) {
  const select = window.document.getElementById("study-language");
  select.value = value;
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick();
}

function choose(window, name, value) {
  window.document.querySelector(`input[name="${name}"][value="${value}"]`).click();
}

test("landing switches instructions and live validation; query beats saved preference", async t => {
  const dom = await page("index.html", "?lang=zh-CN", "en");
  t.after(() => dom.window.close());
  const { window } = dom;
  const doc = window.document;
  assert.equal(doc.documentElement.lang, "zh-CN");
  assert.equal(doc.querySelector("h1").textContent, "短视频研究");
  doc.getElementById("assignment-code").value = "D999";
  doc.getElementById("assignment-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  assert.match(doc.getElementById("code-error").textContent, /请输入.*D001–D080/);
  await setLanguage(window, "en");
  assert.equal(doc.querySelector("h1").textContent, "Short video study");
  assert.match(doc.getElementById("code-error").textContent, /^Please enter/);
  assert.equal(doc.getElementById("assignment-code").value, "D999");
  assert.equal(new URL(window.location.href).searchParams.get("lang"), "en");
  assert.equal(window.localStorage.getItem("audio-study-ui-language"), "en");
});

test("switching mid-answer preserves media, radio selections, comment and stored draft", async t => {
  const dom = await page();
  t.after(() => dom.window.close());
  const { window } = dom;
  const doc = window.document;
  doc.getElementById("start").click();
  const video = doc.getElementById("video");
  video.currentTime = 2.5;
  video.dispatchEvent(new window.Event("play"));
  choose(window, "voice_detected", "yes");
  choose(window, "noticeability", "clearly");
  choose(window, "intelligibility", "some_words");
  doc.querySelector("details").open = true;
  const comment = doc.getElementById("comment");
  comment.value = "No — 这是参与者自己写的留言";
  comment.dispatchEvent(new window.Event("input", { bubbles: true }));
  const key = "human_audio_environment_20260918_controls-2.1-D001";
  const before = window.localStorage.getItem(key);
  await setLanguage(window, "zh");
  assert.strictEqual(doc.getElementById("video"), video);
  assert.equal(video.currentTime, 2.5);
  assert.equal(doc.querySelector('input[name="voice_detected"]:checked').value, "yes");
  assert.equal(doc.querySelector('input[name="intelligibility"]:checked').value, "some_words");
  assert.equal(doc.getElementById("noticeabilityWrap").hidden, false);
  assert.equal(comment.value, "No — 这是参与者自己写的留言");
  assert.equal(doc.querySelector("details").open, true);
  assert.equal(window.localStorage.getItem(key), before);
  assert.match(doc.querySelector("h2").textContent, /后期加入的人声/);
  assert.equal(comment.placeholder, "有什么想告诉我们的吗？（选填）");
  doc.getElementById("next").click();
  await tick();
  assert.equal(doc.querySelector("h1").textContent, "请聆听这个片段");
  const saved = JSON.parse(window.localStorage.getItem(key));
  const row = Object.values(saved.rows)[0];
  assert.equal(row.voice_detected, "yes");
  assert.equal(row.noticeability, "clearly");
  assert.equal(row.intelligibility, "some_words");
  assert.equal(saved.index, 1);
  await setLanguage(window, "en");
  assert.equal(doc.querySelector("h1").textContent, "Listen to this clip");
});

test("new errors, completion and review remain translated; exports keep canonical values", async t => {
  const dom = await page("assignments/D001.html", "?lang=zh");
  t.after(() => dom.window.close());
  const { window } = dom;
  const doc = window.document;
  doc.getElementById("start").click();
  doc.getElementById("next").click();
  await tick();
  assert.match(doc.getElementById("formError").textContent, /^请回答两个问题/);
  choose(window, "voice_detected", "no");
  choose(window, "intelligibility", "not_noticed");
  doc.getElementById("next").click();
  await tick();
  assert.match(doc.getElementById("formError").textContent, /^请先播放视频/);
  doc.getElementById("video").dispatchEvent(new window.Event("play"));
  doc.getElementById("next").click();
  for (let i = 1; i < 30; i++) doc.getElementById("skip").click();
  await tick();
  assert.equal(doc.querySelector("h1").textContent, "已完成，感谢参与！");
  assert.match(doc.body.textContent, /已保存 30 \/ 30 个视频的答案/);
  const downloads = [];
  window.Blob = class { constructor(parts) { this.text = parts.join(""); } };
  window.URL.createObjectURL = blob => { downloads.push(blob.text); return "blob:synthetic"; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {};
  doc.getElementById("json").click();
  const data = JSON.parse(downloads[0]);
  assert.equal(data.protocol_version, "2.1");
  assert.equal(data.completed, 30);
  assert.equal(data.responses[0].voice_detected, "no");
  assert.equal(data.responses[0].intelligibility, "not_noticed");
  doc.getElementById("csv").click();
  assert.match(downloads[1], /"voice_detected"/);
  assert.match(downloads[1], /"not_noticed"/);
  await setLanguage(window, "en");
  assert.equal(doc.querySelector("h1").textContent, "All done. Thank you!");
  doc.getElementById("review").click();
  await tick();
  assert.equal(doc.querySelector('input[name="voice_detected"]:checked').value, "no");
});

test("saved language works for B/C links and storage denial does not block the selector", async t => {
  for (const prefix of ["B", "C"]) {
    const dom = await page(`assignments/${prefix}001.html`, "", "zh");
    t.after(() => dom.window.close());
    assert.equal(dom.window.document.documentElement.lang, "zh-CN");
    assert.match(dom.window.document.body.textContent, /30 个短视频/);
  }
  const dom = await page("assignments/D001.html", "?language=zh", null, true);
  t.after(() => dom.window.close());
  dom.window.document.getElementById("start").click();
  await tick();
  assert.match(dom.window.document.getElementById("saveMsg").textContent, /^当前浏览器无法保存进度/);
  await setLanguage(dom.window, "en");
  assert.match(dom.window.document.getElementById("saveMsg").textContent, /^Browser saving is unavailable/);
});
