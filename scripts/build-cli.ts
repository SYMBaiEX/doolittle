import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { build } from "esbuild";
import {
  CLI_CHUNK_PATTERN,
  CLI_OUTPUT_DIRECTORY,
  cliBuildOptions,
} from "./cli-build-options";

const result = await build({
  ...cliBuildOptions(),
  metafile: true,
  write: false,
});
const manifest = JSON.parse(
  readFileSync(new URL("../apps/cli/package.json", import.meta.url), "utf8"),
);
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (!dependency.external || !dependency.path.startsWith("@elizaos/"))
      continue;
    const name = dependency.path.split("/").slice(0, 2).join("/");
    if (!manifest.dependencies?.[name])
      throw new Error(
        `Compiled CLI requires a declared runtime dependency: ${name}`,
      );
  }
}

const outputs = result.outputFiles.map((output) => ({
  ...output,
  name: basename(output.path),
}));
// Publish content-addressed chunks before replacing either entrypoint.
outputs.sort(
  (a, b) =>
    Number(CLI_CHUNK_PATTERN.test(b.name)) -
    Number(CLI_CHUNK_PATTERN.test(a.name)),
);
mkdirSync(CLI_OUTPUT_DIRECTORY, { recursive: true });
const staging = mkdtempSync(join(CLI_OUTPUT_DIRECTORY, ".build-"));
try {
  for (const output of outputs) {
    writeFileSync(join(staging, output.name), output.contents, {
      mode: CLI_CHUNK_PATTERN.test(output.name) ? 0o644 : 0o755,
    });
  }
  for (const output of outputs) {
    renameSync(join(staging, output.name), output.path);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}

// A process launched from an earlier build can still have pending imports.
if (process.argv.slice(2).includes("--clean")) {
  const published = new Set(outputs.map(({ name }) => name));
  for (const entry of readdirSync(CLI_OUTPUT_DIRECTORY, {
    withFileTypes: true,
  })) {
    if (
      entry.isFile() &&
      CLI_CHUNK_PATTERN.test(entry.name) &&
      !published.has(entry.name)
    ) {
      rmSync(join(CLI_OUTPUT_DIRECTORY, entry.name));
    }
  }
}
