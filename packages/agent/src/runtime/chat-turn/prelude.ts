import type { AppContext } from "@/runtime/bootstrap";
import { getEffectiveTurnCapabilityPolicy } from "@/runtime/native/service-bridge/tool-policy";
import { getEffectiveCodingAgentContext } from "@/runtime/native/service-bridge/tooling";
import type { resolveTurnCapabilityProfile } from "@/runtime/turn-classification/message";

type ChatRuntimeContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

export function buildCodingContextPrelude(input: {
  taskDescription: string;
  sessionId: string;
  workspaceRoot: string;
  maxIterations: number;
  context: ChatRuntimeContext;
}): string | undefined {
  try {
    const codingContext = getEffectiveCodingAgentContext(
      input.context.runtime,
      input.context.services,
      {
        sessionId: input.sessionId,
        taskDescription: input.taskDescription,
        workspaceRoot: input.workspaceRoot,
        maxIterations: input.maxIterations,
        interactionMode: "human-in-the-loop",
        metadata: {
          provider: input.context.services.settings.get().model.provider,
          source: "interactive-turn",
        },
      },
    );

    return [
      "CODING CONTEXT",
      `task=${codingContext.taskDescription}`,
      `cwd=${codingContext.workingDirectory}`,
      `connector=${codingContext.connector.type}`,
      `mode=${codingContext.interactionMode}`,
      `maxIterations=${codingContext.maxIterations}`,
    ].join("\n");
  } catch {
    return undefined;
  }
}

export function buildCapabilityPrelude(input: {
  context: ChatRuntimeContext;
  profile: ReturnType<typeof resolveTurnCapabilityProfile>;
}): string | undefined {
  const policy = getEffectiveTurnCapabilityPolicy(
    input.context.runtime,
    input.profile,
  );
  if (policy.profile === "minimal") {
    return [
      "CAPABILITY PROFILE",
      "profile=minimal",
      "Respond like a strong terminal-native teammate: direct, concrete, and natural.",
      "Answer directly first.",
      "Avoid tools, delegation, and broad planning unless the user explicitly asks for execution.",
      "Do not use meta sections like 'What was completed' or offer to do work you should already have done.",
      "Do not narrate that you searched or inspected something unless that detail materially helps the answer.",
    ].join("\n");
  }

  const preferred = policy.preferredTools.length
    ? `Prefer: ${policy.preferredTools.join(", ")}`
    : undefined;
  const denied = policy.deniedTools.length
    ? `Avoid: ${policy.deniedTools
        .slice(0, 5)
        .map((entry) => entry.name)
        .join(", ")}`
    : undefined;

  return [
    "CAPABILITY PROFILE",
    `profile=${policy.profile}`,
    "Be direct, useful, and terminal-friendly.",
    "Lead with the answer, not process narration.",
    "Avoid filler, defensive caveats, and meta recap sections unless the user explicitly asks for them.",
    "Do not narrate tool usage unless it helps the user understand the result or next decision.",
    preferred,
    denied,
  ]
    .filter(Boolean)
    .join("\n");
}
