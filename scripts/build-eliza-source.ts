#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(
  readFileSync(join(root, "tooling/eliza-source/source.json"), "utf8"),
) as {
  repository: string;
  commit: string;
  bun: string;
  node: string;
  nub: string;
  aliases: Record<string, string>;
  packages: string[];
};
const expected = process.argv.includes("--verify")
  ? JSON.parse(
      readFileSync(join(root, "vendor/elizaos/source-builds.json"), "utf8"),
    )
  : undefined;
const cache = join(root, "var/eliza-source/integration");
const output = join(root, "vendor/elizaos");
const tools = mkdtempSync(join(tmpdir(), "doolittle-source-tools-"));
const home = join(tools, "home");
mkdirSync(home);
const bin = join(tools, "bin");
mkdirSync(bin);
symlinkSync(process.execPath, join(bin, "node"));
const env = {
  PATH: `${bin}:${join(tools, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
  HOME: home,
};
const nub = join(root, "node_modules/.bin/nub");

function run(command: string, args: string[], cwd = cache, input?: string) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "inherit", "inherit"] : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

function capture(command: string, args: string[], cwd = cache) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function digest(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function copy(from: string, to: string) {
  cpSync(from, to, {
    recursive: true,
    // Debug maps are not needed by the installed SDK. Runtime bytes are copied
    // unchanged; no implementation rewrites or patches are applied here.
    filter: (path) => !path.endsWith(".map") && !path.endsWith(".tsbuildinfo"),
  });
}

function copyRegistryAssets(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyRegistryAssets(source, target);
    else if (!/\.tsx?$/u.test(entry.name)) cpSync(source, target);
  }
}

function modulePaths(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(/^\.\/src\//u, "./dist/").replace(/\.ts$/u, ".js");
  if (Array.isArray(value)) return value.map(modulePaths);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, modulePaths(entry)]),
    );
  return value;
}

try {
  if (!/^[a-f\d]{40}$/u.test(config.commit))
    throw new Error("Exact source SHA required");
  mkdirSync(cache, { recursive: true });
  if (process.versions.node !== config.node)
    throw new Error(`Source builds require Node ${config.node}`);
  if (
    capture(nub, ["--version"]).split("\n")[0].replace(/^v/u, "") !== config.nub
  )
    throw new Error(`Source builds require Nub ${config.nub}`);
  if (capture("bun", ["--version"]) !== config.bun)
    throw new Error(`Source builds require Bun ${config.bun}`);
  for (const file of ["package.json", "nub.lock"])
    cpSync(join(root, "tooling/eliza-source", file), join(tools, file));
  run(nub, ["install", "--frozen-lockfile", "--ignore-scripts"], tools);
  if (!existsSync(join(cache, ".git"))) {
    run("git", ["init"]);
    run("git", ["remote", "add", "origin", config.repository]);
  }
  if (capture("git", ["remote", "get-url", "origin"]) !== config.repository)
    throw new Error("Unexpected source remote");
  if (capture("git", ["status", "--porcelain", "--untracked-files=no"]))
    throw new Error("Source checkout contains implementation edits");
  run("git", [
    "fetch",
    "--depth=1",
    "--filter=blob:none",
    "origin",
    config.commit,
  ]);
  const sparse = [
    "/*",
    "!/packages/",
    "!/plugins/",
    "/packages/*/package.json",
    "/plugins/*/package.json",
    "/packages/scripts/",
    "/plugins/plugin-build.ts",
    ...config.packages.map((path) => `/${path}/`),
  ];
  run(
    "git",
    ["sparse-checkout", "set", "--no-cone", "--stdin"],
    cache,
    `${sparse.join("\n")}\n`,
  );
  run("git", ["checkout", "--detach", config.commit]);
  rmSync(join(cache, "node_modules"), { recursive: true, force: true });
  symlinkSync(join(tools, "node_modules"), join(cache, "node_modules"), "dir");
  // Type emission must resolve the matching prompt API, not another installed
  // release. This is ordinary upstream workspace resolution, not copied code.
  const promptLink = join(cache, "packages/core/node_modules/@elizaos");
  mkdirSync(promptLink, { recursive: true });
  rmSync(join(promptLink, "prompts"), { recursive: true, force: true });
  symlinkSync(
    join(cache, "packages/prompts"),
    join(promptLink, "prompts"),
    "dir",
  );

  const workspaceVersions = JSON.parse(
    capture("node", [
      "--input-type=module",
      "--eval",
      "import {collectWorkspaceVersions} from './packages/scripts/prepare-package-dist.mjs'; console.log(JSON.stringify(Object.fromEntries(collectWorkspaceVersions(process.cwd()))))",
    ]),
  ) as Record<string, string>;
  const artifacts: Record<string, { sha256: string; [key: string]: unknown }> =
    {};
  mkdirSync(output, { recursive: true });
  for (const path of config.packages) {
    const directory = join(cache, path);
    console.log(`Building unmodified upstream ${path}`);
    if (path === "packages/registry") {
      run(
        "tsc6",
        [
          "-p",
          "tsconfig.json",
          "--noCheck",
          "--noEmit",
          "false",
          "--declaration",
          "--rewriteRelativeImportExtensions",
          "true",
          "--outDir",
          "dist",
          "--rootDir",
          "src",
        ],
        directory,
      );
      copyRegistryAssets(join(directory, "src"), join(directory, "dist"));
    } else if (path === "packages/core") {
      run("node", ["../shared/scripts/generate-keywords.mjs"], directory);
      run("bun", ["build.ts"], directory);
    } else {
      const script =
        path === "packages/prompts"
          ? "build:package"
          : path === "packages/app-core"
            ? "build:dist:unlocked"
            : ["packages/shared", "packages/agent"].includes(path)
              ? "build:dist"
              : "build";
      run("bun", ["run", script], directory);
    }

    const stage = mkdtempSync(join(tmpdir(), "doolittle-source-package-"));
    try {
      const prepared = join(directory, "dist/package.json");
      const manifest = JSON.parse(
        readFileSync(
          existsSync(prepared) ? prepared : join(directory, "package.json"),
          "utf8",
        ),
      );
      if (existsSync(prepared)) copy(join(directory, "dist"), stage);
      else {
        const files =
          path === "packages/registry" ? ["dist", "entries"] : manifest.files;
        for (const file of files) {
          const source = join(directory, file);
          if (existsSync(source)) copy(source, join(stage, file));
        }
        if (path === "packages/registry") {
          manifest.main = "./dist/index.js";
          manifest.types = "./dist/index.d.ts";
          manifest.exports = modulePaths(manifest.exports);
          manifest.files = ["dist", "entries"];
        }
      }
      for (const file of ["LICENSE", "SDK-LICENSE", "README.md"])
        if (existsSync(join(directory, file)))
          copy(join(directory, file), join(stage, file));
      for (const section of [
        "dependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        for (const [name, version] of Object.entries(manifest[section] ?? {})) {
          if (typeof version === "string" && version.startsWith("workspace:")) {
            const exact = workspaceVersions[name];
            if (!exact)
              throw new Error(`Upstream package version missing: ${name}`);
            manifest[section][name] = exact;
          }
        }
      }
      delete manifest.scripts;
      delete manifest.devDependencies;
      delete manifest.workspaces;
      manifest.doolittleSourceBuild = {
        repository: config.repository,
        commit: config.commit,
        package: path,
        bun: config.bun,
        node: config.node,
        nub: config.nub,
        toolLockSha256: digest(join(root, "tooling/eliza-source/nub.lock")),
      };
      writeFileSync(
        join(stage, "package.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      const packed = JSON.parse(
        capture(
          nub,
          ["pack", "--ignore-scripts", "--json", "--pack-destination", output],
          stage,
        ),
      ) as { filename: string }[];
      const original = resolve(output, packed[0].filename);
      const filename = `${manifest.name.replace(/^@/u, "").replaceAll("/", "-")}-${manifest.version}-${config.commit.slice(0, 8)}.tgz`;
      cpSync(original, join(output, filename));
      rmSync(original);
      artifacts[config.aliases[manifest.name] ?? manifest.name] = {
        artifact: `vendor/elizaos/${filename}`,
        version: manifest.version,
        sha256: digest(join(output, filename)),
        ...manifest.doolittleSourceBuild,
      };
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
  if (capture("git", ["status", "--porcelain", "--untracked-files=no"]))
    throw new Error("Upstream build modified tracked implementation");
  if (expected) {
    const changed = Object.entries(artifacts)
      .filter(([name, artifact]) => expected[name]?.sha256 !== artifact.sha256)
      .map(([name]) => name);
    if (changed.length)
      throw new Error(
        `Source build is not reproducible: ${changed.join(", ")}`,
      );
  }
  writeFileSync(
    join(output, "source-builds.json"),
    `${JSON.stringify(artifacts, null, 2)}\n`,
  );
  console.log(
    "Source builds complete; installation is a separate reviewed step.",
  );
} finally {
  rmSync(tools, { recursive: true, force: true });
}
