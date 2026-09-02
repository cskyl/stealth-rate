import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function sourceFiles(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...await sourceFiles(path));
    else if (path.endsWith(".ts")) paths.push(path);
  }
  return paths;
}

const failures = [];
for (const path of await sourceFiles("src")) {
  const lines = (await readFile(path, "utf8")).split("\n");
  lines.forEach((line, index) => {
    if (line.length > 120) failures.push(`${path}:${index + 1}: ${line.length}`);
  });
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("STYLE_CHECK_OK");

