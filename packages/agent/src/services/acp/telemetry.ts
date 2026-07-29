export interface AcpTelemetrySnapshot {
  lastProbeAt?: string;
  lastInvocationAt?: string;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
  lastError?: string;
  protocolEvents: number;
  protocolEventCounts: Record<string, number>;
  lastProtocolEvent?: {
    event: string;
    at: string;
    detail?: Record<string, unknown>;
  };
}

export class AcpTelemetry {
  private snapshotValue: AcpTelemetrySnapshot = {
    protocolEvents: 0,
    protocolEventCounts: {},
  };

  snapshot(): AcpTelemetrySnapshot {
    return {
      ...this.snapshotValue,
      protocolEventCounts: { ...this.snapshotValue.protocolEventCounts },
      lastProtocolEvent: this.snapshotValue.lastProtocolEvent
        ? {
            ...this.snapshotValue.lastProtocolEvent,
            detail: this.snapshotValue.lastProtocolEvent.detail
              ? { ...this.snapshotValue.lastProtocolEvent.detail }
              : undefined,
          }
        : undefined,
    };
  }

  recordProtocolEvent(event: string, detail?: Record<string, unknown>): void {
    this.snapshotValue.protocolEvents += 1;
    this.snapshotValue.protocolEventCounts[event] =
      (this.snapshotValue.protocolEventCounts[event] ?? 0) + 1;
    this.snapshotValue.lastProtocolEvent = {
      event,
      at: new Date().toISOString(),
      detail,
    };
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
