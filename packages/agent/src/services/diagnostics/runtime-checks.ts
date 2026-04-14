import { buildAutonomyChecks } from "./runtime/autonomy";
import { buildExecutionBackendChecks } from "./runtime/execution-backends";
import { buildExecutionBasicsChecks } from "./runtime/execution-basics";
import { buildIntegrationChecks } from "./runtime/integrations";
import { buildRuntimeBridgeChecks } from "./runtime/runtime-bridges";
import type {
  DiagnosticsAutonomyChecksInput,
  DiagnosticsExecutionChecksInput,
} from "./runtime/types";

export function buildDiagnosticsExecutionChecks(
  input: DiagnosticsExecutionChecksInput,
) {
  return [
    ...buildExecutionBasicsChecks(input),
    ...buildExecutionBackendChecks(input),
    ...buildRuntimeBridgeChecks(input),
    ...buildIntegrationChecks(input),
  ];
}

export function buildDiagnosticsAutonomyChecks(
  input: DiagnosticsAutonomyChecksInput,
) {
  return buildAutonomyChecks(input);
}
