import type { DiagnosticCheck } from "@/types";
import type {
  DiagnosticsCheckBuilder,
  DiagnosticsExecutionChecksInput,
} from "./types";

export const buildIntegrationChecks: DiagnosticsCheckBuilder<
  DiagnosticsExecutionChecksInput
> = ({ integrationControl }): DiagnosticCheck[] => {
  if (!integrationControl) {
    return [];
  }

  return [
    {
      id: "integration.browser.native",
      status: "pass",
      summary: "Native browser integration",
      detail:
        "Browser status is resolved through the required native Eliza service bridge.",
    },
    {
      id: "integration.mcp.native",
      status: "pass",
      summary: "Native MCP integration",
      detail: `MCP status is resolved through the required native Eliza service bridge with ${integrationControl.mcp.cachedTools.length} cached tool(s).`,
    },
  ];
};
