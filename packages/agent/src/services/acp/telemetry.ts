export interface AcpTelemetrySnapshot {
  lastProbeAt?: string;
  lastInvocationAt?: string;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
  lastError?: string;
}

export class AcpTelemetry {
  private snapshotValue: AcpTelemetrySnapshot = {};

  snapshot(): AcpTelemetrySnapshot {
    return { ...this.snapshotValue };
  }

  recordProbe(ok: boolean, rawOutput?: string): void {
    this.snapshotValue.lastProbeAt = new Date().toISOString();
    this.snapshotValue.lastError = ok ? undefined : rawOutput;
  }

  recordInvocation(ok: boolean, rawOutput?: string): void {
    this.snapshotValue.lastInvocationAt = new Date().toISOString();
    this.snapshotValue.lastError = ok ? undefined : rawOutput;
  }

  recordPublish(publishedAt = new Date().toISOString()): void {
    this.snapshotValue.lastPublishAt = publishedAt;
  }

  recordExport(exportedAt: string): void {
    this.snapshotValue.lastExportAt = exportedAt;
  }

  recordImport(importedAt: string): void {
    this.snapshotValue.lastImportAt = importedAt;
  }
}
