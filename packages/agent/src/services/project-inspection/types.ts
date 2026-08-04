export type {
  LocalCodebaseMatch,
  LocalProjectInspection,
  LocalProjectTarget,
} from "@doolittle/contracts";

export interface PackageJsonSummary {
  packageName?: string;
  packageManager?: string;
  workspacePatterns: string[];
  scripts: string[];
}
