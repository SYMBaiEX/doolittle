import { arch, hostname, platform, release } from "node:os";
import type { AppContext } from "@/runtime/bootstrap";

type ChatRuntimeContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

export function buildSystemFactsContext(context: ChatRuntimeContext): string {
  const terminalAvailable = "yes";
  const settings = context.services.settings.get();
  return [
    "Live machine facts:",
    `- os=${platform()} ${release()}`,
    `- arch=${arch()}`,
    `- hostname=${hostname()}`,
    `- workspace=${context.config.workspaceDir}`,
    `- shell access=${terminalAvailable} via terminal service and /terminal run`,
    `- execution backend=${settings.execution.backend}`,
    `- provider=${settings.model.provider}`,
    "Use these live facts when answering machine or terminal capability questions. Do not say you cannot inspect the machine when local terminal access is available.",
  ].join("\n");
}
