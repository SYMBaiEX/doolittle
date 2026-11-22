import { Radio, RotateCw, SquareTerminal } from "lucide-react";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  type ApiResource,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  type UnknownRecord,
} from "../lib";
import { DiagnosticStatusRow } from "../runtime-state/DiagnosticWorkspace";

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

export function OperationsTracePanel({
  commandEntries,
  deliveries,
  deliveryEntries,
  terminalHistory,
}: {
  commandEntries: UnknownRecord[];
  deliveries: ApiResource<DeliveriesResponse>;
  deliveryEntries: UnknownRecord[];
  terminalHistory: ApiResource<TerminalHistoryResponse>;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-3">
      <WorkbenchSection
        title="Recent deliveries"
        headingLevel={3}
        icon={Radio}
        actions={
          <WorkbenchAction
            aria-label="Refresh recent deliveries"
            emphasis="quiet"
            icon={RotateCw}
            onClick={deliveries.reload}
          >
            Refresh
          </WorkbenchAction>
        }
      >
        {deliveries.loading ? (
          <LoadingBlock />
        ) : deliveries.error ? (
          <ErrorBlock error={deliveries.error} retry={deliveries.reload} />
        ) : deliveryEntries.length ? (
          <div className="grid gap-1">
            {deliveryEntries.slice(0, 12).map((entry, index) => (
              <DiagnosticStatusRow
                title={asString(
                  entry.platform,
                  asString(entry.channel, "Delivery"),
                )}
                detail={asString(
                  entry.preview,
                  asString(entry.detail, asString(entry.message, "No preview")),
                )}
                status={
                  <Badge>
                    {asString(entry.status, asString(entry.state, "Recorded"))}
                  </Badge>
                }
                key={`${asString(entry.id, "delivery")}:${String(index)}`}
              />
            ))}
          </div>
        ) : (
          <WorkbenchEmpty icon={Radio} title="No deliveries recorded">
            Deliveries appear after gateway or home outputs run.
          </WorkbenchEmpty>
        )}
      </WorkbenchSection>
      <WorkbenchSection
        title="Terminal history"
        headingLevel={3}
        icon={SquareTerminal}
        actions={
          <WorkbenchAction
            aria-label="Refresh terminal history"
            emphasis="quiet"
            icon={RotateCw}
            onClick={terminalHistory.reload}
          >
            Refresh
          </WorkbenchAction>
        }
      >
        {terminalHistory.loading ? (
          <LoadingBlock />
        ) : terminalHistory.error ? (
          <ErrorBlock
            error={terminalHistory.error}
            retry={terminalHistory.reload}
          />
        ) : commandEntries.length ? (
          <div className="grid gap-1">
            {commandEntries.slice(0, 12).map((entry, index) => (
              <DiagnosticStatusRow
                title={asString(entry.command, "Unknown command")}
                detail={
                  [
                    asString(entry.backend),
                    asString(entry.cwd),
                    asString(entry.status),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No command metadata"
                }
                status={
                  <Badge tone={entry.ok === false ? "bad" : "neutral"}>
                    {entry.ok === false
                      ? "Failed"
                      : entry.ok === true
                        ? "OK"
                        : asString(entry.exitCode, "Recorded")}
                  </Badge>
                }
                key={`${asString(entry.command, "command")}:${String(index)}`}
              />
            ))}
          </div>
        ) : (
          <WorkbenchEmpty icon={SquareTerminal} title="No recent commands">
            Local terminal commands appear here after execution.
          </WorkbenchEmpty>
        )}
      </WorkbenchSection>
    </div>
  );
}
