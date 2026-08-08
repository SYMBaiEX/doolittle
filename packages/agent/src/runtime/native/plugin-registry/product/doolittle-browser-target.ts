import type {
  BrowserTarget,
  BrowserWorkspaceCommand,
  BrowserWorkspaceCommandResult,
} from "@elizaos/plugin-browser";
import type { AppServices } from "@/services";

export const DOOLITTLE_BROWSER_TARGET_ID = "doolittle-evidence";

type WebService = AppServices["web"];

function requireUrl(command: BrowserWorkspaceCommand): string {
  const url = command.url?.trim();
  if (!url) {
    throw new Error("Doolittle evidence browser target requires a URL.");
  }
  return url;
}

async function executeEvidenceCommand(
  web: WebService,
  command: BrowserWorkspaceCommand,
): Promise<unknown> {
  const operation = command.name?.trim().toLowerCase();

  switch (operation) {
    case "status":
      return web.status();
    case "fetch":
      return web.fetchText(requireUrl(command));
    case "inspect":
      return web.inspect(requireUrl(command));
    case "snapshot":
      return web.snapshot(requireUrl(command));
    case "screenshot":
      return web.screenshot(requireUrl(command));
    case "capture":
      return web.capture(requireUrl(command));
    case "analyze":
      return web.analyze(requireUrl(command));
    case "compare": {
      const secondaryUrl = command.secondaryUrl?.trim();
      if (!secondaryUrl) {
        throw new Error(
          "Doolittle evidence comparison requires a secondary URL.",
        );
      }
      return web.compare(requireUrl(command), secondaryUrl);
    }
    case "analyze-comparison": {
      const secondaryUrl = command.secondaryUrl?.trim();
      if (!secondaryUrl) {
        throw new Error(
          "Doolittle evidence comparison analysis requires a secondary URL.",
        );
      }
      return web.analyzeComparison(requireUrl(command), secondaryUrl);
    }
    default:
      throw new Error(
        `Doolittle evidence browser target does not support operation: ${operation || command.subaction}.`,
      );
  }
}

export function createDoolittleBrowserTarget(web: WebService): BrowserTarget {
  return {
    id: DOOLITTLE_BROWSER_TARGET_ID,
    name: "Doolittle Evidence",
    description:
      "Doolittle's evidence capture, artifact, analysis, and comparison backend.",
    kind: "external",
    score: () => null,
    available: async () => true,
    execute: async (
      command: BrowserWorkspaceCommand,
    ): Promise<BrowserWorkspaceCommandResult> => ({
      mode: "web",
      subaction: command.subaction,
      value: await executeEvidenceCommand(web, command),
    }),
  };
}
