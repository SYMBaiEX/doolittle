import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("../", import.meta.url));
export const desktop = join(repo, "apps/desktop");
export const cargoTarget = resolve(
  repo,
  process.env.CARGO_TARGET_DIR || "target",
);

export function run(command: string, args: string[], cwd = repo): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

export function productVersion(): string {
  const { version } = JSON.parse(
    readFileSync(join(repo, "package.json"), "utf8"),
  ) as { version: string };
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error("Doolittle packaging requires a numeric product version.");
  }
  return version;
}

export function prepareNativeRuntime(
  requirePinnedNode = false,
): (runtime: string) => void {
  const node = realpathSync(process.execPath);
  const required = readFileSync(join(repo, ".node-version"), "utf8").trim();
  if (requirePinnedNode && process.versions.node !== required) {
    throw new Error(
      `Use the repository-pinned Node distribution (${required}) to package Doolittle.`,
    );
  }
  const nodeLicense = [
    join(dirname(node), "LICENSE"),
    resolve(dirname(node), "../LICENSE"),
  ].find((candidate) => existsSync(candidate));
  if (!nodeLicense) {
    throw new Error(
      "The repository-pinned Node distribution must include its LICENSE.",
    );
  }
  run("cargo", [
    "build",
    "--locked",
    "--release",
    "-p",
    "doolittle-desktop",
    "-p",
    "doolittle-cli-native",
  ]);
  const prepared = join(repo, "target/native-runtime");
  for (const args of [
    ["scripts/prepare-runtime.ts", "--standalone-node"],
    [
      "scripts/verify-package.ts",
      "--runtime-manifest",
      "../../target/native-runtime/runtime-manifest.json",
    ],
  ]) {
    if (process.platform === "win32") {
      // cmd.exe is required for the Nub .cmd shim. These are fixed arguments.
      run("cmd.exe", ["/d", "/c", "nub", ...args], desktop);
    } else {
      run("nub", args, desktop);
    }
  }
  return (runtime) => {
    cpSync(prepared, runtime, { recursive: true, verbatimSymlinks: true });
    const bin = join(runtime, "bin");
    mkdirSync(bin, { recursive: true });
    copyFileSync(
      node,
      join(bin, process.platform === "win32" ? "node.exe" : "node"),
    );
    copyFileSync(nodeLicense, join(bin, "LICENSE.node"));
    cpSync(join(repo, "packages/skills"), join(runtime, "packages/skills"), {
      recursive: true,
      filter: (path) =>
        !path
          .split(sep)
          .some((part) => part === "node_modules" || part === ".git"),
    });
  };
}
