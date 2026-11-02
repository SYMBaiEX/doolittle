import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { cliBuildOptions } from "./cli-build-options";

const result = await build({ ...cliBuildOptions(), metafile: true });
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
