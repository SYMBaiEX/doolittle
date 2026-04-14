import { displayCommand } from "@/runtime/commands/command-execution";
import type { RunDepth, ToolProgressMode } from "@/types/runtime";
import { RUN_DEPTH_ITERATION_PRESETS } from "@/types/runtime";

import type { AgentExecutionContext } from "../../chat";
import {
  formatRunPolicy,
  parseRunDepth,
  parseToolProgressMode,
} from "../runtime-status-formatters";
import type { RuntimeWorkspaceCommandHandler } from "./types";

export function getRunPolicy(context: AgentExecutionContext): {
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
} {
  const agent = context.services.settings.get().agent;
  return {
    runDepth: agent.runDepth,
    maxIterations: agent.maxIterations,
    toolProgressMode: agent.toolProgressMode,
  };
}

export const handleRuntimePolicyCommand: RuntimeWorkspaceCommandHandler =
  async (_input, trimmed, context) => {
    if (trimmed === "/mode") {
      const policy = getRunPolicy(context);
      return formatRunPolicy(
        policy.runDepth,
        policy.maxIterations,
        policy.toolProgressMode,
      );
    }

    if (trimmed.startsWith("/mode set ")) {
      const nextDepth = parseRunDepth(trimmed.replace("/mode set ", "").trim());
      if (!nextDepth) {
        return `Usage: ${displayCommand("/mode set <quick|standard|deep|explore>")}`;
      }
      const nextCap = RUN_DEPTH_ITERATION_PRESETS[nextDepth];
      context.services.settings.set("agent.runDepth", nextDepth);
      context.services.settings.set("agent.maxIterations", nextCap);
      const policy = getRunPolicy(context);
      return [
        `Run depth updated to ${nextDepth}.`,
        formatRunPolicy(nextDepth, nextCap, policy.toolProgressMode),
      ].join("\n");
    }

    if (trimmed === "/progress") {
      const policy = getRunPolicy(context);
      return formatRunPolicy(
        policy.runDepth,
        policy.maxIterations,
        policy.toolProgressMode,
      );
    }

    if (trimmed.startsWith("/progress set ")) {
      const nextMode = parseToolProgressMode(
        trimmed.replace("/progress set ", "").trim(),
      );
      if (!nextMode) {
        return `Usage: ${displayCommand("/progress set <off|new|all|verbose>")}`;
      }
      context.services.settings.set("agent.toolProgressMode", nextMode);
      const policy = getRunPolicy(context);
      return [
        `Tool progress updated to ${nextMode}.`,
        formatRunPolicy(
          policy.runDepth,
          policy.maxIterations,
          policy.toolProgressMode,
        ),
      ].join("\n");
    }

    return undefined;
  };
