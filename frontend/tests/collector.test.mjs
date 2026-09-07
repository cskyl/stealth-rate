import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
let mod;
async function collector() {
  if (!mod) {
    const source = await readFile(new URL("src/backend/collector.ts", root), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  }
  return mod;
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const bundle = {
  session: { study_id: "human_real_stealth_v2", version: "2.0", status: "started" },
  events: [{ session_id: "s1", type: "play", item_id: "i1" }],
  responses: [{ session_id: "s1", item_id: "i1", task: "edit", answers: { edited: "no" }, rt_ms: 1, replay_count: 0 }],
};

test("snapshot persists gzip before an offline sync and retries to a complete ack", async () => {
  const { createCollector } = await collector();
  const storage = new MemoryStorage();
  let calls = 0;
  const fetcher = async (_url, init) => {
    calls += 1;
    assert.equal(init.headers["Content-Type"], "text/plain;charset=utf-8");
    const sent = JSON.parse(init.body);
    assert.equal(sent.op, "sync");
    assert.equal(sent.bundle.responses.length, 1);
    if (calls === 1) throw new Error("offline");
    return { ok: true, async json() { return { ok: true, ack_response_count: 1 }; } };
  };
  const instance = createCollector({ studyId: "human_real_stealth_v2", version: "2.0", inviteToken: "abcdef0123456789abcdef0123456789", participantKey: "invite_scope", url: "https://mock.invalid/sync", storage, fetcher });
  await instance.snapshot(bundle, "partial");
  await new Promise((resolve) => setImmediate(resolve));
  const key = [...storage.values.keys()][0];
  const restored = JSON.parse(gunzipSync(Buffer.from(storage.getItem(key), "base64")).toString("utf8"));
  assert.equal(restored.responses.length, 1);
  assert.equal(instance.syncStatus().pending, true);
  await instance.sync(bundle);
  assert.equal(calls, 2);
  assert.equal(instance.syncStatus().pending, false);
  assert.equal(instance.syncStatus().acknowledgedResponses, 1);
});

test("incomplete acknowledgements remain pending", async () => {
  const { createCollector } = await collector();
  const instance = createCollector({ studyId: "study", version: "v1", inviteToken: "abcdef0123456789abcdef0123456789", participantKey: "p", url: "https://mock.invalid/sync", storage: new MemoryStorage(), fetcher: async () => ({ ok: true, async json() { return { ok: true, ack_response_count: 0 }; } }) });
  await assert.rejects(() => instance.sync(bundle), /acknowledgement/);
  assert.equal(instance.syncStatus().pending, true);
  assert.match(instance.syncStatus().lastError, /acknowledgement/);
});

test("a newer bundle cannot be marked synced by an older acknowledgement", async () => {
  const { createCollector } = await collector();
  let release;
  let calls = 0;
  const fetcher = async (_url, init) => {
    calls += 1;
    const sent = JSON.parse(init.body);
    if (calls === 1) {
      await new Promise((resolve) => { release = resolve; });
      return { ok: true, async json() { return { ok: true, ack_response_count: sent.bundle.responses.length }; } };
    }
    return { ok: true, async json() { return { ok: true, ack_response_count: 2 }; } };
  };
  const instance = createCollector({ studyId: "study", version: "v1", inviteToken: "abcdef0123456789abcdef0123456789", participantKey: "p", url: "https://mock.invalid/sync", storage: new MemoryStorage(), fetcher });
  const one = { ...bundle, responses: [bundle.responses[0]] };
  const two = { ...bundle, responses: [bundle.responses[0], { ...bundle.responses[0], item_id: "i2" }] };
  const first = instance.sync(one);
  await new Promise((resolve) => setImmediate(resolve));
  const second = instance.sync(two);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.syncStatus().pending, true);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(instance.syncStatus().pending, false);
  assert.equal(instance.syncStatus().acknowledgedResponses, 2);
});
