import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "openclaw.plugin.json"), "utf8"));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const expectedTools = [
  "unity_package_index_refresh",
  "unity_package_search",
  "unity_package_get",
  "unity_package_delete_candidate",
  "unity_package_delete",
];

if (manifest.id !== "unity-package-catalog") {
  throw new Error(`Unexpected plugin id: ${manifest.id}`);
}

if (!manifest.contracts || !Array.isArray(manifest.contracts.tools)) {
  throw new Error("Plugin manifest is missing contracts.tools.");
}

for (const toolName of expectedTools) {
  if (!manifest.contracts.tools.includes(toolName)) {
    throw new Error(`Plugin manifest is missing tool ${toolName}.`);
  }
}

if (pkg.type !== "module") {
  throw new Error("package.json must keep type=module.");
}

if (!Array.isArray(pkg.files) || !pkg.files.includes("dist")) {
  throw new Error("package.json files must include dist.");
}

console.log("plugin metadata ok");

