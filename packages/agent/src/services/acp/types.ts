export interface AcpServicePaths {
  registryDir: string;
  registryPath: string;
  exportDir: string;
  importDir: string;
  rootPackagePath: string;
}

export interface AcpSessionSummarySource {
  totalSessions: number;
  recentSessionIds: string[];
}

export interface AcpImportBundlePayload {
  label?: string;
  package?: { name?: string };
  tools?: unknown[];
}
