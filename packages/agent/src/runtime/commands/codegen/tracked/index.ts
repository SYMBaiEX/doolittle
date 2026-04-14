import type { AgentExecutionContext } from "../../../chat";
import { handleCodegenGenerateCommand } from "./generate";
import { handleCodegenListingCommand } from "./listing";
import { handleCodegenPrdCommand } from "./prd";
import { handleCodegenQaCommand } from "./qa";
import { handleCodegenResearchCommand } from "./research";

type TrackedCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined>;

export async function handleTrackedCodegenCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const handlers: TrackedCommandHandler[] = [
    handleCodegenGenerateCommand,
    handleCodegenResearchCommand,
    handleCodegenPrdCommand,
    handleCodegenQaCommand,
    handleCodegenListingCommand,
  ];

  for (const handler of handlers) {
    const response = await handler(trimmed, context);
    if (response !== undefined) {
      return response;
    }
  }

  return undefined;
}

export { createAutocoderRunRecord } from "./shared";
