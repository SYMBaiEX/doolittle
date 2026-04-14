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
      status: integrationControl.browser.source === "native" ? "pass" : "warn",
      summary: "Native browser integration",
      detail:
        integrationControl.browser.source === "native"
          ? "Browser status is resolved through the native Eliza service bridge."
          : "Browser status is still resolved through the product fallback service.",
    },
    {
      id: "integration.mcp.native",
      status: integrationControl.mcp.source === "native" ? "pass" : "warn",
      summary: "Native MCP integration",
      detail:
        integrationControl.mcp.source === "native"
          ? `MCP status is resolved through the native Eliza service bridge with ${integrationControl.mcp.cachedTools.length} cached tool(s).`
          : "MCP status is still resolved through the product fallback service.",
    },
  ];
};
