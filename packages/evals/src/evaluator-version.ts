import { readFileSync } from "node:fs";

interface EvalsPackageMetadata {
  evaluatorVersion?: unknown;
}

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as EvalsPackageMetadata;

if (
  typeof packageMetadata.evaluatorVersion !== "string" ||
  !packageMetadata.evaluatorVersion.trim()
) {
  throw new Error("The eval workspace must declare an evaluatorVersion.");
}

export const EVALS_EVALUATOR_VERSION = packageMetadata.evaluatorVersion;
