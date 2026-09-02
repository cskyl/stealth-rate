import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

function responseFor(value) {
  return {
    ok: true,
    async json() {
      return value;
    },
  };
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `missing ${selector}`);
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("payload frontend flow produces blinded responses", async () => {
  const study = await readJson("../studies/sample_synthetic_v0/study.json");
  const itemData = await readJson("../studies/sample_synthetic_v0/items.json");
  const blockData = await readJson("../studies/sample_synthetic_v0/blocks.json");
  const html = await readFile(new URL("dist/index.html", root), "utf8");
  const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert.ok(scriptPath, "built entry script is missing");
  const script = await readFile(new URL(`dist/${scriptPath.replace(/^\.\//, "")}`, root), "utf8");
  const windowUrl = "https://example.test/stealth-rate/?study=sample_synthetic_v0";
  const dom = new JSDOM(html, {
    url: windowUrl,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  Object.defineProperty(window, "crypto", { value: webcrypto });
  for (const name of [
    "Blob",
    "CompressionStream",
    "TextEncoder",
    "Response",
    "btoa",
    "atob",
  ]) {
    if (globalThis[name]) Object.defineProperty(window, name, { value: globalThis[name] });
  }
  window.fetch = async (url) => {
    const path = new URL(url, window.location.href).pathname;
    if (path.endsWith("study.json")) return responseFor(study);
    if (path.endsWith("items.json")) return responseFor(itemData);
    if (path.endsWith("blocks.json")) return responseFor(blockData);
    throw new Error(`unexpected fetch: ${url}`);
  };
  window.eval(script);
  await settle();
  const hook = window.__STEALTHRATE_TEST__;
  assert.ok(hook, "test hook is missing");

  click(window, "button[data-action=consent]");
  click(window, "button[data-action=device]");
  click(window, "button[data-action=headphones]");
  for (let trial = 0; trial < 6; trial += 1) {
    hook.answerHeadphone(trial % 2 === 0 ? "left" : "right");
  }
  click(window, "button[data-action=start]");
  await settle();

  const practice = itemData.items.filter((item) => item.practice).map((item) => item.item_id);
  const trials = itemData.items.filter((item) => !item.practice).slice(0, 3).map((item) => item.item_id);
  hook.setAssignmentItems([...practice, ...trials]);
  click(window, "button[data-action=practice-next]");
  click(window, "button[data-action=practice-next]");
  await settle();
  for (let trial = 0; trial < 3; trial += 1) {
    const video = window.document.querySelector("video#clip");
    assert.ok(video, "trial video is missing");
    video.dispatchEvent(new window.Event("ended"));
    await settle();
    hook.answerTrial();
    await settle();
  }
  await settle();
  const payload = window.document.querySelector("#payload-code")?.value;
  assert.ok(payload, "payload control is missing");
  const bundle = JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
  assert.equal(bundle.responses.filter((row) => row.task === "mcq").length, 3);
  assert.equal(bundle.responses.filter((row) => row.task === "edit").length, 3);
  const forbidden = [
    ["c", "lean"].join(""),
    [["har", "mless"].join(""), "av"].join("_"),
    ["audio", "low"].join("_"),
    ["audio", "high"].join("_"),
    ["visual", "low"].join("_"),
    ["visual", "high"].join("_"),
  ];
  assert.ok(!forbidden.some((word) => JSON.stringify(bundle).includes(word)));
  dom.window.close();
});
