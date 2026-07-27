export interface NativePackageAuditRecord {
  packageName: string;
  role: string;
  currentStrategy: "official" | "vendored" | "custom";
  currentTag: "latest" | "beta" | "workspace";
  latestTagVersion: string;
  betaTagVersion?: string;
  compatibility:
    | "aligned"
    | "lagging-latest"
    | "beta-only"
    | "workspace-only"
    | "vendored-by-design";
  note: string;
}

export interface NativePackageAuditSummary {
  aligned: number;
  vendored: number;
  betaOnly: number;
  laggingLatest: number;
  workspaceOnly: number;
}

export interface NativePackageAuditRuntimeLine {
  date: string;
  latest: string;
  beta: string;
}
