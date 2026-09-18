import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function routing() {
  const source = await readFile(new URL("../src/studyRouting.ts", import.meta.url), "utf8");
  const dir = await (await import("node:fs/promises")).mkdtemp(join(tmpdir(), "stealth-routing-"));
  const file = join(dir, "routing.mjs");
  const js = source.replace(/export type StudyRoute[\s\S]*?;\n\n/, "")
    .replace("export const ENVIRONMENT_STUDY_ID", "const ENVIRONMENT_STUDY_ID")
    .replace("export const", "const")
    .replace("export function", "function")
    .replace(/: URL \| string/g, "")
    .replace(/: URL/g, "")
    .replace(/: "A" \| "B" \| "C"/g, "")
    .replace(/: 40 \| 80/g, "")
    .replace(/: boolean/g, "")
    .replace(/: string \| null/g, "")
    .replace(/: StudyRoute/g, "")
    .replace(/: value is string/g, "")
    .replace(/\n$/, "\nexport { routeStudy };\n");
  await (await import("node:fs/promises")).writeFile(file, js);
  return import(pathToFileURL(file).href);
}

test("root defaults to the new C-study landing", async () => {
  const { routeStudy } = await routing();
  assert.deepEqual(routeStudy("https://pages.invalid/stealth-rate/"), { kind: "audio", path: "./audio-study-environments/" });
  assert.deepEqual(routeStudy("https://pages.invalid/?assignment=C001"), { kind: "audio", path: "./audio-study-environments/assignments/C001.html" });
  assert.deepEqual(routeStudy("https://pages.invalid/?assignment=C080"), { kind: "audio", path: "./audio-study-environments/assignments/C080.html" });
  assert.deepEqual(routeStudy("https://pages.invalid/?assignment=C081"), { kind: "legacy" });
  assert.deepEqual(routeStudy("https://pages.invalid/?assignment=B001"), { kind: "legacy" });
});

test("new C study uses strict C001--C080 assignments", async () => {
  const { routeStudy } = await routing();
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260918_n60").path, "./audio-study-environments/");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260918_n60&assignment=C001").path, "./audio-study-environments/assignments/C001.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260918_n60&assignment=C080").path, "./audio-study-environments/assignments/C080.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260918_n60&assignment=C081").path, "./audio-study-environments/");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260918_n60&assignment=B001").path, "./audio-study-environments/");
});

test("explicit old studies retain their assignment pages and old B landing", async () => {
  const { routeStudy } = await routing();
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260914").path, "./audio-study-environments/legacy-b.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260914&assignment=B001").path, "./audio-study-environments/assignments/B001.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260914&assignment=B040").path, "./audio-study-environments/assignments/B040.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260914&block=B40").path, "./audio-study-environments/legacy-b.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260914&assignment=B041").path, "./audio-study-environments/legacy-b.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_environment_20260914&assignment=C001").path, "./audio-study-environments/legacy-b.html");
  assert.equal(routeStudy("https://pages.invalid/?study=human_audio_gain_20260910&block=A040").path, "./audio-study/assignments/A040.html");
});

test("old study and possible old invitation/session links stay legacy", async () => {
  const { routeStudy } = await routing();
  assert.deepEqual(routeStudy("https://pages.invalid/?study=human_real_stealth_v2"), { kind: "legacy" });
  assert.deepEqual(routeStudy("https://pages.invalid/#invite=abc&block=block_1"), { kind: "legacy" });
  assert.deepEqual(routeStudy("https://pages.invalid/?PROLIFIC_PID=p1&STUDY_ID=s1&SESSION_ID=x"), { kind: "legacy" });
  assert.deepEqual(routeStudy("https://pages.invalid/?opaque_invitation=value"), { kind: "legacy" });
  assert.deepEqual(routeStudy("https://pages.invalid/?guide=1"), { kind: "audio", path: "./audio-study-environments/" });
  assert.deepEqual(routeStudy("https://pages.invalid/?lang=zh"), { kind: "audio", path: "./audio-study-environments/" });
});
