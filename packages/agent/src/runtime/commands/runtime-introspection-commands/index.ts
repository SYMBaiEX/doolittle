import type { AgentExecutionContext } from "../../chat";
import { handleAutonomousRuntimeIntrospectionCommand } from "./autonomous";
import { handleEcosystemRuntimeIntrospectionCommand } from "./ecosystem";
import { handleExecutionRuntimeIntrospectionCommand } from "./execution";
import { handleMediaRuntimeIntrospectionCommand } from "./media";
import { handleOwnershipRuntimeIntrospectionCommand } from "./ownership";
import { handlePluginRuntimeIntrospectionCommand } from "./plugin";
import { handleRegistryRuntimeIntrospectionCommand } from "./registry";
import { handleResearchRuntimeIntrospectionCommand } from "./research";
import { handleServiceRuntimeIntrospectionCommand } from "./service";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export async function handleRuntimeIntrospectionCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const handlers: RuntimeIntrospectionCommandHandler[] = [
    handlePluginRuntimeIntrospectionCommand,
    handleServiceRuntimeIntrospectionCommand,
    handleOwnershipRuntimeIntrospectionCommand,
    handleEcosystemRuntimeIntrospectionCommand,
    handleAutonomousRuntimeIntrospectionCommand,
    handleMediaRuntimeIntrospectionCommand,
    handleExecutionRuntimeIntrospectionCommand,
    handleResearchRuntimeIntrospectionCommand,
    handleRegistryRuntimeIntrospectionCommand,
  ];

  for (const handler of handlers) {
    const response = await handler(trimmed, context);
    if (response !== undefined) {
      return response;
    }
  }

  return undefined;
}
