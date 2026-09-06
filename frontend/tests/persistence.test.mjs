import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { webcrypto } from "node:crypto";

const root = new URL("../", import.meta.url);
const modules = new Map();
async function load(name) {
  if (!modules.has(name)) {
    const source = await readFile(new URL(`src/${name}.ts`, root), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    modules.set(name, import(`data:text/javascript,${encodeURIComponent(js)}`));
  }
  return modules.get(name);
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
if (!globalThis.crypto?.randomUUID) Object.defineProperty(globalThis, "crypto", { value: webcrypto });
const config = { study_id: "study", version: "v1" };
const blocks = [{ block_id: "b1", items: ["i1"] }];

test("payload adapter restores rows and completed bundle without cross-scope leakage", async () => {
  const { createPayloadAdapter } = await load("backend/payload");
  const first = createPayloadAdapter(config, blocks, 1);
  const assignment = await first.assign("participant");
  await first.event({ session_id: assignment.session_id, type: "played", item_id: "i1" });
  await first.response({ session_id: assignment.session_id, item_id: "i1", task: "mcq",
    answers: { choice: "a" }, rt_ms: 1, replay_count: 0 });
  const complete = await first.complete(assignment.session_id, assignment.block_id);
  const second = createPayloadAdapter(config, blocks, 1);
  const restored = await second.assign("participant");
  assert.equal(restored.session_id, assignment.session_id);
  assert.equal((await second.restore(assignment.session_id)).responses.length, 1);
  await second.assign("participant");
  assert.equal((await second.restore(assignment.session_id)).responses.length, 1);
  assert.equal(await second.getCompletedBundle(assignment.session_id), complete.bundle);
  assert.notEqual((await second.assign("other")).session_id, assignment.session_id);
});

test("completion quota failure can be retried and persisted", async () => {
  const { createPayloadAdapter } = await load("backend/payload");
  const adapter = createPayloadAdapter(config, blocks, 1);
  const assignment = await adapter.assign("retry");
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: saved.getItem.bind(saved), setItem() { throw new Error("quota"); } };
  await assert.rejects(() => adapter.complete(assignment.session_id, assignment.block_id), /storage unavailable/);
  globalThis.localStorage = saved;
  const result = await adapter.complete(assignment.session_id, assignment.block_id);
  assert.ok(result.bundle);
  assert.equal(await adapter.getCompletedBundle(assignment.session_id), result.bundle);
});

test("corrupt or unavailable storage fails visibly and does not overwrite", async () => {
  const { createPayloadAdapter } = await load("backend/payload");
  localStorage.setItem("stealthrate.payload.v2:study:v1:bad", "not-json");
  await assert.rejects(() => createPayloadAdapter(config, blocks, 1).assign("bad"), /corrupt/);
  const old = globalThis.localStorage;
  globalThis.localStorage = { getItem() { return null; }, setItem() { throw new Error("quota"); } };
  await assert.rejects(() => createPayloadAdapter(config, blocks, 1).assign("quota"), /storage unavailable/);
  globalThis.localStorage = old;
});
