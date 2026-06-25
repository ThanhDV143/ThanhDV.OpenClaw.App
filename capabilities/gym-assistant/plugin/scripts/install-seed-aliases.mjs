import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(import.meta.dirname, "../seed/exercise-aliases.seed.json");
const target = process.argv[3] ?? process.env.GYM_EXERCISE_ALIAS_PATH ?? "/home/node/.openclaw/gym-assistant/exercise-aliases.json";

try {
  await stat(target);
  console.log(`Alias store already exists: ${target}`);
  console.log("Seed was not copied to avoid overwriting learned aliases.");
} catch (error) {
  if (!isNotFound(error)) {
    throw error;
  }

  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`Installed alias seed: ${target}`);
}

function isNotFound(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

