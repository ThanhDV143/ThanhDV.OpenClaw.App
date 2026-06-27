import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "openclaw.plugin.json");
const packagePath = resolve(root, "package.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pkg = JSON.parse(await readFile(packagePath, "utf8"));

const expectedTools = [
  "gym_alias_list",
  "gym_alias_add",
  "gym_plan_status",
  "gym_log_latest",
  "gym_log_search",
  "gym_log_append",
  "gym_log_find",
  "gym_log_update",
  "gym_log_delete",
];

if (manifest.id !== "gym-assistant") {
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
