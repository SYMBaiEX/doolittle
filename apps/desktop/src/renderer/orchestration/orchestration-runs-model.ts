import { asArray } from "../lib";
import type { CodegenRunRecord } from "../orchestration-resources";

export { statusTone } from "./detail-primitives";

export type CodegenMode = "generate" | "research" | "prd" | "qa";

export const CODEGEN_MODES: ReadonlyArray<{
  id: CodegenMode;
  label: string;
  detail: string;
}> = [
  { id: "generate", label: "Generate", detail: "Build from a prompt" },
  { id: "research", label: "Research", detail: "Investigate an approach" },
  { id: "prd", label: "PRD", detail: "Research and specify" },
  { id: "qa", label: "QA", detail: "Run project quality checks" },
];

export function runArtifacts(record: CodegenRunRecord): unknown[] {
  const opaque = asArray(record.artifacts);
  return opaque.length > 0 ? opaque : asArray(record.artifactPaths);
}
