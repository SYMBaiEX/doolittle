export interface DiagnosticsRunInput {
  skillsCount: number;
  skillsSummary?: {
    total: number;
    workspace: number;
    generated: number;
    bundled: number;
    managed: number;
    project: number;
    invocable: number;
  };
  contextFilesCount: number;
  recentCronRuns: number;
  recentTerminalCommands: number;
  repositoryAvailable: boolean;
  gatewayTransportOverview?: {
    mismatchCount: number;
    operationalCount: number;
    details: Array<{
      platform: string;
      mismatchFlags: string[];
      inventory?: {
        detail: string;
      };
      platformState?: {
        detail?: string;
      };
    }>;
  };
}
