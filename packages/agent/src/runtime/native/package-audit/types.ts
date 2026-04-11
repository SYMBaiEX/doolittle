export interface NativePackageAuditRecord {
  packageName: string;
  role: string;
  currentStrategy: "official" | "vendored" | "custom";
  currentTag: "latest" | "alpha" | "workspace";
  latestTagVersion: string;
  alphaTagVersion?: string;
  compatibility:
    | "aligned"
    | "lagging-latest"
    | "alpha-only"
    | "workspace-only"
    | "vendored-by-design";
  note: string;
}

export interface NativePackageAuditSummary {
  aligned: number;
  vendored: number;
  alphaOnly: number;
  laggingLatest: number;
  workspaceOnly: number;
}
