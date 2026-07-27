import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const env = { ...process.env };
const unpackedDirectories =
  process.platform === "darwin"
    ? [
        resolve(desktopRoot, "release", `mac-${process.arch}`),
        resolve(desktopRoot, "release", "mac"),
      ]
    : process.platform === "win32"
      ? [
          resolve(desktopRoot, "release", `win-${process.arch}-unpacked`),
          resolve(desktopRoot, "release", "win-unpacked"),
        ]
      : [
          resolve(desktopRoot, "release", `linux-${process.arch}-unpacked`),
          resolve(desktopRoot, "release", "linux-unpacked"),
        ];

if (args.includes("--dir")) {
  for (const directory of unpackedDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  args.includes("--dir") &&
  process.platform === "darwin" &&
  env.CSC_IDENTITY_AUTO_DISCOVERY === undefined
) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

const result = spawnSync(process.execPath, ["x", "electron-builder", ...args], {
  cwd: desktopRoot,
  env,
  stdio: "inherit",
});
if (result.status !== 0 && args.includes("--dir")) {
  for (const directory of unpackedDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
}
process.exit(result.status ?? 1);
