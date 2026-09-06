import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("instruction copy covers explicit scales, recovery, and invented examples", async () => {
  const source = await readFile(new URL("src/instructionContent.ts", root), "utf8");
  const en = JSON.parse(await readFile(new URL("src/i18n/en.json", root), "utf8"));
  const zh = JSON.parse(await readFile(new URL("src/i18n/zh.json", root), "utf8"));
  for (const strings of [en, zh]) {
    for (const key of [
      "step1_title", "step2_title", "step3_title", "rating_guide",
      "examples_title", "playback_help_body", "practice_feedback",
    ]) {
      assert.ok(strings[key], `missing instruction key ${key}`);
    }
    assert.match(strings.conspicuousness_guide_body, /1.*5/);
    assert.match(strings.naturalness_guide_body, /1.*5/);
    assert.match(strings.confidence_guide_body, /1.*3/);
  }
  assert.match(source, /instruction-steps/);
  assert.match(source, /instruction-details/);
  assert.match(en.examples_note, /invented|not answers/i);
});

test("rating controls are intentional and preserve payload field names", async () => {
  const source = await readFile(new URL("src/forms.ts", root), "utf8");
  assert.match(source, /type: "radio", name: inputName/);
  assert.match(source, /name: "mcq_confidence"/);
  assert.match(source, /inputName = name === "confidence" \? "edit_confidence"/);
  assert.match(source, /value: "", disabled: true, selected: true/);
  assert.doesNotMatch(source, /type: "range"/);
});
