import type { CliExecutionResult } from "@/cli/execution";

export function isShellCommandInput(line: string): boolean {
  return line.startsWith("!");
}

export function resolveQueuedResponseDescriptor(
  line: string,
  agentName: string,
  isConversationalInput: (text: string) => boolean,
): {
  label: string;
  kind: "assistant" | "command" | "shell";
} {
  if (isConversationalInput(line)) {
    return {
      label: agentName,
      kind: "assistant",
    };
  }
  if (isShellCommandInput(line)) {
    return {
      label: "Shell",
      kind: "shell",
    };
  }
  return {
    label: "Command Result",
    kind: "command",
  };
}

export function resolveCompletedResponseLabel(input: {
  line: string;
  tone: CliExecutionResult["tone"];
  agentName: string;
}): string {
  if (input.tone === "agent") {
    return input.agentName;
  }
  if (isShellCommandInput(input.line)) {
    return "Shell";
  }
  return input.line.startsWith("/") ? "Command Result" : input.agentName;
}

export function resolveQueuedHistoryLabel(
  trimmed: string,
  isConversationalInput: (text: string) => boolean,
): "You" | "Shell" | "Command" | undefined {
  if (isConversationalInput(trimmed)) {
    return "You";
  }
  if (trimmed.startsWith("!")) {
    return "Shell";
  }
  if (trimmed.startsWith("/")) {
    return "Command";
  }
  return undefined;
}
