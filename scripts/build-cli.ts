import { build } from "esbuild";
import { cliBuildOptions } from "./cli-build-options";

await build(cliBuildOptions());
