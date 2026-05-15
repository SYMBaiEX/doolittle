export function describeTrajectoryRlExport(totalSessions: number): string {
  return [
    "RL Export Capabilities:",
    `  Sessions available: ${totalSessions}`,
    "  Formats: JSONL (windowed turn format, Doolittle debug/evaluation schema)",
    "  Schema: doolittle-rl-v1",
    "  Training: not ElizaOS SDK trajectory data; use /trajectories export for canonical training exports",
    "  Methods:",
    "    exportRlReady(sessionId)  — single session RL export",
    "    exportRlDataset()         — all sessions combined RL export",
  ].join("\n");
}
