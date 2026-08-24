import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join("C:\\", "lg-build", "release");
const projectRelease = join(root, "release");
const setupName = "LuckyGain-Setup-0.1.0.exe";

mkdirSync(outDir, { recursive: true });

const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

const build = spawnSync(
  "npx",
  ["electron-builder", "--win", "nsis", `--config.directories.output=${outDir}`],
  { cwd: root, env, stdio: "inherit", shell: true },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

mkdirSync(projectRelease, { recursive: true });
for (const name of [setupName, `${setupName}.blockmap`]) {
  const from = join(outDir, name);
  if (existsSync(from)) {
    cpSync(from, join(projectRelease, name));
  }
}

console.log(
  `\nInstaller ready:\n  ${join(outDir, setupName)}\n  ${join(projectRelease, setupName)}\n`,
);
