import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
let mod;
async function assignment() {
  if (!mod) {
    const source = await readFile(new URL("src/assignment.ts", root), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  }
  return mod;
}

async function payload() {
  const source = await readFile(new URL("src/backend/payload.ts", root), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

const blocks = [
  { block_id: "block_1", items: ["practice_a", "practice_b", "r1", "r2", "r3", "r4"] },
  { block_id: "block_2", items: ["practice_a", "practice_b", "s1", "s2", "s3", "s4"] },
];

test("invitation parsing validates 32 hex token and existing block without leaking token", async () => {
  const { parseInvitation } = await assignment();
  const invitation = parseInvitation("#invite=ABCDEF0123456789ABCDEF0123456789&block=block_1", blocks);
  assert.equal(invitation.blockId, "block_1");
  assert.match(invitation.participantKey, /^invite_[0-9a-f]{16}$/);
  assert.ok(!invitation.participantKey.includes("ABCDEF"));
  assert.throws(() => parseInvitation("#invite=bad&block=block_1", blocks), /invalid|incomplete/);
  assert.throws(() => parseInvitation("#invite=abcdef0123456789abcdef0123456789&block=nope", blocks), /block/);
});

test("same invite has stable shuffled rated order and keeps practice first", async () => {
  const { stableAssignedItems } = await assignment();
  const token = ["abcdef01", "23456789"].join("").repeat(2);
  const first = stableAssignedItems(blocks[0].items, token);
  const second = stableAssignedItems(blocks[0].items, token);
  const other = stableAssignedItems(blocks[0].items, "0123456789abcdef0123456789abcdef");
  assert.deepEqual(first, second);
  assert.deepEqual(first.slice(0, 2), ["practice_a", "practice_b"]);
  assert.deepEqual([...first.slice(2)].sort(), [...blocks[0].items.slice(2)].sort());
  assert.notDeepEqual(first, other);
});

test("payload adapter honors explicit invitation block and restores the stable order", async () => {
  const { stableAssignedItems } = await assignment();
  const { createPayloadAdapter } = await payload();
  const storage = globalThis.localStorage;
  globalThis.localStorage = new (class {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
  })();
  try {
    const config = { study_id: "human_real_stealth_v2", version: "2.0" };
    const adapter = createPayloadAdapter(config, blocks, 4);
    const inviteToken = "abcdef0123456789abcdef0123456789";
    const first = await adapter.assign("ignored", "ua", { blockId: "block_1", inviteToken });
    const second = await adapter.assign("ignored", "ua", { blockId: "block_1", inviteToken });
    assert.equal(first.block_id, "block_1");
    assert.deepEqual(first.items, second.items);
    assert.deepEqual(first.items, stableAssignedItems(blocks[0].items, inviteToken));
    assert.ok(!JSON.stringify(await adapter.restore(first.session_id)).includes(inviteToken));
  } finally {
    globalThis.localStorage = storage;
  }
});

test("two invites in one browser stay scope-isolated and duplicate saves are idempotent", async () => {
  const { createPayloadAdapter } = await payload();
  globalThis.localStorage = new (class {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
  })();
  const adapter = createPayloadAdapter({ study_id: "human_real_stealth_v2", version: "2.0" }, blocks, 4);
  const aToken = "abcdef0123456789abcdef0123456789";
  const bToken = "0123456789abcdef0123456789abcdef";
  const a = await adapter.assign("ignored", "ua", { blockId: "block_1", inviteToken: aToken });
  await adapter.response({ session_id: a.session_id, item_id: a.items[2], task: "edit", answers: { edited: "no" }, rt_ms: 1, replay_count: 0 });
  await adapter.response({ session_id: a.session_id, item_id: a.items[2], task: "edit", answers: { edited: "no" }, rt_ms: 1, replay_count: 0 });
  const b = await adapter.assign("ignored", "ua", { blockId: "block_2", inviteToken: bToken });
  assert.notEqual(a.session_id, b.session_id);
  assert.equal((await adapter.restore(b.session_id)).responses.length, 0);
  const restoredA = await adapter.assign("ignored", "ua", { blockId: "block_1", inviteToken: aToken });
  assert.equal(restoredA.session_id, a.session_id);
  assert.equal((await adapter.restore(a.session_id)).responses.length, 1);
});
