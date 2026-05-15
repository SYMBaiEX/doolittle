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
      `iterations=${codingContext.iterations.length}`,
      codingContext.iterations.at(-1)
        ? `lastIteration=fileOps:${codingContext.iterations.at(-1)?.fileOperations.length ?? 0} commandResults:${codingContext.iterations.at(-1)?.commandResults.length ?? 0}`
        : undefined,
      "localFileRoots=workspace plus ~/dev, ~/code, ~/projects when present",
      "fileTools=READ_FILE, WRITE_FILE, PATCH_FILE, SEARCH_FILES, CREATE_DIRECTORY",
      "Use WRITE_FILE for new files; it creates parent directories automatically.",
      "Use PATCH_FILE for targeted edits and READ_FILE/SEARCH_FILES for inspection.",
      "Reserve RUN_IN_TERMINAL for builds, tests, git, package managers, scripts, processes, and network checks.",
      "Do not use terminal cat/head/tail to read files, grep/find/ls to inspect files, echo/cat heredocs to create files, or sed/awk to edit files.",
      "For create-or-change-file requests, do not finish with REPLY/NONE until the requested file writes or patches have actually succeeded.",
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
