import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = ["clean", "harmless_av", "audio_low", "audio_high", "visual_low", "visual_high", "anchor", "attention", "harmless", "gold", "injected"];
const conditionIds = ["clean", "harmless_av", "audio_low", "audio_high", "visual_low", "visual_high"];
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path)); else out.push(path);
  }
  return out;
}
const studyFiles = await files("studies");
const targets = [
  ...await files("frontend/dist"),
  ...studyFiles.filter((path) => path.endsWith("/items.json") || path.endsWith("/study.json")),
];
const failures = [];
for (const path of targets) {
  const text = (await readFile(path, "utf8")).toLowerCase();
  const words = path.endsWith("/study.json") ? conditionIds : forbidden;
  for (const word of words) if (text.includes(word)) failures.push(`${path}: ${word}`);
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`BUNDLE_GREP_OK (${targets.length} files scanned)`);
