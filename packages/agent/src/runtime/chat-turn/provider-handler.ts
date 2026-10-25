import {
  type ActionResult,
  type Memory,
  setTrajectoryPurpose,
} from "@elizaos/core";
import {
  actionResultActionName,
  extractLocalMutationsFromActionResult,
} from "../action-result-metadata";
import type { AgentExecutionContext } from "../chat";
import { matchesRegisteredCommandShortcut } from "../command-shortcut-match";
import { checkOllamaReadiness } from "../native/plugin-registry/ollama-readiness";
import {
  getScopedTurnActionResults,
  getScopedTurnPlannerBudget,
  recordScopedTurnActionResult,
  resolveScopedTurnActionResult,
  TurnPlannerBudget,
} from "../turn-runtime-scope";
import { hasWorkspaceMutationObligation } from "../workspace-mutation-intent";
import {
  CONSTRAINED_FRONTEND_REVIEW_FAILURE,
  frontendRequirements,
  frontendReviewAttempt,
  frontendReviewBlockedByUserConstraint,
  frontendReviewRequired,
  frontendReviewSummary,
  serverStartPolicy,
  UNRESOLVED_INTERACTIVE_TEXT_FAILURE,
  unresolvedInteractiveTextBlocker,
} from "./frontend-review";
import {
  collectProviderActionResults,
  completedManagedAppServerSummary,
  completedManagedDelegationResponse,
  managedDelegationFailure,
} from "./provider-receipts";
import type { StreamingOutputModel } from "./provider-streaming";
import {
  isUnsynthesizedToolResponse,
  synthesizeToolResultResponse,
} from "./tool-result-synthesis";
import {
  elapsedMsSince,
  readSdkTrajectoryStepId,
  recordEvaluationTraceEvent,
  runWithSdkTrajectoryContext,
} from "./trajectory";
import {
  continuationMemory,
  explicitlyReportsIncompleteWork,
  hasPostAdmissionWorkspaceVerification,
  type IncompleteVerificationScope,
  type IncompleteWorkspaceKind,
  incompleteAdmittedWorkspaceFailure,
  incompleteMutationFailure,
  incompleteVerificationScopes,
  incompleteWorkspaceVerificationFailure,
  verifiedWorkspaceNoopResponse,
} from "./workspace-continuation";
import {
  admittedWorkspace,
  hasVerifiedWorkspaceCompletion,
  hasVerifiedWorkspaceMutation,
  missingWorkspaceMutationRequirements,
  verifyWorkspaceNoopCompletion,
} from "./workspace-evidence";
import { workspaceNoopRequirements } from "./workspace-noop-completion";

export type ProviderTurnSettingsSnapshot = {
  model: {
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
};

export type ProviderMessageExecutionResult = {
  handledMessage: boolean;
  response: string;
  runFailureMessage?: string;
  messageId: string;
  actionResults: ActionResult[];
  responseMessages: Memory[];
};

type ProviderMessageExecutionInput = {
  context: AgentExecutionContext;
  memory: Memory;
  sessionId?: string;
  runId?: string;
  streamState: StreamingOutputModel;
  messagePolicy: {
    useMultiStep: boolean;
    maxIterations: number;
  };
  abortSignal: AbortSignal | undefined;
  settingsDuring: ProviderTurnSettingsSnapshot;
  onNotice?: (notice: {
    kind: "status";
    message: string;
  }) => Promise<void> | void;
  connectionSource: string;
  roomId: string;
  buildProviderFailureMessage: (
    provider: string,
    model: string,
    error: unknown,
    baseUrl: string,
  ) => string;
};

function memoryText(memory: Memory): string {
  const content = memory.content as { text?: unknown } | undefined;
  return typeof content?.text === "string" ? content.text : "";
}

function responseText(memory: Memory | undefined): string {
  const content = memory?.content as { text?: unknown } | undefined;
  return typeof content?.text === "string" ? content.text.trim() : "";
}

type SdkResponseContent = {
  text?: unknown;
  failureKind?: unknown;
  thought?: unknown;
};

function isSdkFailureReply(content: SdkResponseContent | null | undefined) {
  // beta.7 annotates no-provider replies, but its structured-failure builder
  // only supplies this fixed internal marker. Do not classify ordinary prose
  // (including a user asking about errors) by matching the displayed text.
  return (
    content?.failureKind === "no_provider" ||
    content?.failureKind === "trajectory_limit" ||
    content?.thought ===
      "Handle a temporary reply failure during running the native tool message runtime."
  );
}

function actionResultsFromState(state: unknown): ActionResult[] {
  if (!state || typeof state !== "object") return [];
  const data = (state as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const actionResults = (data as { actionResults?: unknown }).actionResults;
  return Array.isArray(actionResults) ? (actionResults as ActionResult[]) : [];
}

function actionResultsFromMessageResult(result: unknown): ActionResult[] {
  if (!result || typeof result !== "object") return [];
  const actionResults = (result as { actionResults?: unknown }).actionResults;
  return Array.isArray(actionResults) ? (actionResults as ActionResult[]) : [];
}

const MAX_MUTATION_CONTINUATION_PASSES = 12;

const MAX_CONSECUTIVE_NO_ACTION_PASSES = 2;

function hasMutationObligation(
  context: AgentExecutionContext,
  sessionId: string,
  prompt: string,
): boolean {
  let recentMessages: Array<{ role?: string; text?: string }> = [];
  try {
    recentMessages = context.services.sessions.recentBySession(sessionId, 6);
  } catch {
    // The explicit request still provides a reliable signal when history is unavailable.
  }
  return hasWorkspaceMutationObligation(prompt, recentMessages);
}

function hasPendingApproval(context: AgentExecutionContext, sessionId: string) {
  try {
    return (
      (context.services.runController.getActive(sessionId)?.pendingApprovals ??
        0) > 0
    );
  } catch {
    return false;
  }
}

/**
 * The message service can invoke callbacks for a response-handler preamble
 * before its planner executes actions. Its returned responseContent is the
 * terminal response after that loop and is the only safe user-facing answer.
 */
type SdkResponseOrigin =
  | "current-response-content"
  | "response-message-fallback"
  | "provisional-stream-fallback"
  | "empty-after-actions"
  | "empty";

function resolveSdkMessageResponse(input: {
  responseContent?: SdkResponseContent | null;
  responseMessages: Memory[];
  provisionalResponse: string;
  actionResults: ActionResult[];
}): { text: string; origin: SdkResponseOrigin } {
  const responseContent = input.responseContent?.text;
  if (typeof responseContent === "string" && responseContent.trim()) {
    return { text: responseContent.trim(), origin: "current-response-content" };
  }

  // A tool/action run without a canonical terminal response must not fall
  // back to responseMessages: the SDK includes response-handler early replies
  // in that collection. Post-provider will surface the normal no-response
  // notice rather than accidentally ending a turn before tool synthesis.
  if (input.actionResults.length > 0) {
    return { text: "", origin: "empty-after-actions" };
  }

  for (const message of [...input.responseMessages].reverse()) {
    const text = responseText(message);
    if (text) return { text, origin: "response-message-fallback" };
  }

  const text = input.provisionalResponse.trim();
  return { text, origin: text ? "provisional-stream-fallback" : "empty" };
}

function throwIfTurnAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Agent run cancelled.");
  error.name = "AbortError";
  throw error;
}

async function discardUnsynthesizedResponseMemories(input: {
  context: AgentExecutionContext;
  response: string;
  responseMessages: Memory[];
  runId?: string;
  sessionId: string;
  roomId: string;
}): Promise<Memory[]> {
  const rejected = input.responseMessages.filter(
    (memory) => responseText(memory) === input.response.trim(),
  );
  if (!rejected.length) return input.responseMessages;

  const deleteMemory = input.context.runtime.deleteMemory?.bind(
    input.context.runtime,
  );
  if (deleteMemory) {
    const rejectedMemoryIds = rejected.flatMap((memory) =>
      memory.id ? [memory.id] : [],
    );
    const results = await Promise.allSettled(
      rejectedMemoryIds.map((memoryId) => deleteMemory(memoryId)),
    );
    const failedDeletes = results.filter(
      (result) => result.status === "rejected",
    ).length;
    if (failedDeletes) {
      input.context.runtime.logger?.warn(
        {
          runId: input.runId,
          sessionId: input.sessionId,
          roomId: input.roomId,
          rejectedMemoryIds: rejectedMemoryIds.map(String),
          failedDeletes,
        },
        "Failed to remove every unsynthesized native response memory",
      );
    }
  }

  const rejectedMemories = new Set(rejected);
  return input.responseMessages.filter(
    (memory) => !rejectedMemories.has(memory),
  );
}

export async function executeProviderMessageTurn(
  input: ProviderMessageExecutionInput,
): Promise<ProviderMessageExecutionResult> {
  let handledMessage = false;
  let response = input.streamState.getResponse();
  let runFailureMessage: string | undefined;
  const startedAt = performance.now();
  const prompt = memoryText(input.memory);
  const sessionId = input.sessionId ?? String(input.memory.roomId);
  const messageId = String(input.memory.id);
  let actionResults: ActionResult[] = [];
  const settledActionResults: ActionResult[] = [];
  let responseMessages: Memory[] = [];
  const plannerBudget =
    getScopedTurnPlannerBudget(input.context.runtime) ??
    new TurnPlannerBudget(
      input.messagePolicy.maxIterations,
      input.settingsDuring.model.model,
      MAX_MUTATION_CONTINUATION_PASSES,
    );

  await runWithSdkTrajectoryContext(
    input.context,
    {
      runId: input.runId,
      roomId: input.roomId,
      messageId,
      source: input.connectionSource,
      purpose: "response",
      metadata: {
        path: "provider-message-service",
        runId: input.runId,
        roomId: input.roomId,
        messageId,
        sessionId,
        provider: input.settingsDuring.model.provider,
        model: input.settingsDuring.model.model,
      },
      metadataTarget: input.memory,
    },
    async () => {
      recordEvaluationTraceEvent(input.context, {
        category: "model",
        event: "model.request",
        sessionId,
        runId: input.runId,
        roomId: input.roomId,
        source: input.connectionSource,
        provider: input.settingsDuring.model.provider,
        model: input.settingsDuring.model.model,
        text: `[model:request] ${input.settingsDuring.model.provider}/${input.settingsDuring.model.model}`,
        metadata: {
          path: "provider-message-service",
          trajectoryStepId: readSdkTrajectoryStepId(input.memory.metadata),
          prompt,
          promptChars: prompt.length,
          useMultiStep: input.messagePolicy.useMultiStep,
          maxIterations: input.messagePolicy.useMultiStep
            ? input.messagePolicy.maxIterations
            : 1,
          baseUrl: input.settingsDuring.model.baseUrl,
          temperature: input.settingsDuring.model.temperature,
          maxTokens: input.settingsDuring.model.maxTokens,
        },
      });

      let mutationObligation = false;
      let admittedIncomplete:
        | {
            actionCount: number;
            kind: IncompleteWorkspaceKind;
            workdir: string | undefined;
            verificationAdmissions: Map<IncompleteVerificationScope, number>;
          }
        | undefined;
      // An API path can contain `app`; a negated server-start clause must not
      // turn it into a requested managed-app handoff.
      const { verificationRequest } = serverStartPolicy(prompt);
      const noOpRequirements = workspaceNoopRequirements(verificationRequest);
      try {
        throwIfTurnAborted(input.abortSignal);
        setTrajectoryPurpose("response");
        const messageService = input.context.runtime.messageService;
        if (!messageService) {
          throw new Error("ElizaOS message service is not registered.");
        }
        if (
          input.settingsDuring.model.provider === "ollama" &&
          !input.context.config.offlineBootstrapMode &&
          // Recovery commands must reach the SDK's pre-LLM shortcut gate even
          // when the current provider is unavailable. Matching is not dispatch:
          // the SDK still owns command authorization and action execution.
          !matchesRegisteredCommandShortcut(input.context.runtime, prompt)
        ) {
          const availability = await checkOllamaReadiness(
            String(
              input.context.runtime.getSetting("OLLAMA_API_ENDPOINT") ||
                input.context.config.ollamaApiEndpoint,
            ),
            input.settingsDuring.model.model,
            input.context.runtime.fetch,
          );
          throwIfTurnAborted(input.abortSignal);
          // The SDK otherwise swallows this known configuration/network
          // failure into a canned successful reply and retries other slots.
          if (!availability.ready) throw new Error(availability.detail);
        }
        mutationObligation = hasMutationObligation(
          input.context,
          sessionId,
          prompt,
        );
        let messageMemory = input.memory;
        let messageResult:
          | Awaited<ReturnType<typeof messageService.handleMessage>>
          | undefined;
        const allResponseMessages: Memory[] = [];
        let consecutiveNoActionPasses = 0;

        // Check workspace mutations against Doolittle's receipt gate after
        // each SDK message pass. The installed beta.7 planner ignores the
        // legacy iteration/continuation hints below: one handleMessage call
        // can execute multiple actions before returning. The shared allowance
        // now forwards real SDK limits and bounds both passes and tool calls.
        // Continuing on the same
        // memory ID preserves the original room/session without another
        // visible user message; the SDK still owns its internal planner.
        for (let attempt = 0; !plannerBudget.exhausted; attempt += 1) {
          throwIfTurnAborted(input.abortSignal);
          const settledCountBeforeAttempt = settledActionResults.length;
          messageResult = await messageService.handleMessage(
            input.context.runtime,
            messageMemory,
            input.streamState.onCallbackContent,
            {
              useMultiStep: input.messagePolicy.useMultiStep,
              maxMultiStepIterations: mutationObligation
                ? 1
                : input.messagePolicy.useMultiStep
                  ? input.messagePolicy.maxIterations
                  : 1,
              // Compatibility hint, not an enforceable one-action yield on
              // beta.7. sdk-planner-yield.test.ts exercises the installed SDK;
              // a hard tool-call refusal is not a completion-preserving yield.
              continueAfterActions: !mutationObligation,
              abortSignal: input.abortSignal,
              plannerLoopConfig: plannerBudget.beginPass(),
              // Once a managed coding child has completed, its final response
              // must come from the terminal receipt below. Suppress the SDK's
              // provisional follow-up text so beta.7's streamed no-provider
              // fallback cannot appear as a false error before its structured
              // failure marker is available. Run and tool progress still
              // streams; post-provider emits the selected final answer once.
              onStreamChunk: async (chunk: string) => {
                plannerBudget.observeStreamChunk(chunk);
                const streamResults = [
                  ...actionResults,
                  ...settledActionResults,
                  ...getScopedTurnActionResults(input.context.runtime),
                ];
                if (completedManagedDelegationResponse(streamResults)) return;
                await input.streamState.onStreamChunk(chunk);
              },
              // Available in current Eliza develop and ignored by beta.7. Keep
              // committed action evidence even if a later planner stage fails.
              onSettledActionResult: (result: ActionResult) => {
                if (
                  !resolveScopedTurnActionResult(input.context.runtime, result)
                ) {
                  recordScopedTurnActionResult(input.context.runtime, result);
                }
                settledActionResults.push(result);
              },
            } as Parameters<typeof messageService.handleMessage>[3] & {
              onSettledActionResult: (result: ActionResult) => void;
            },
          );
          throwIfTurnAborted(input.abortSignal);
          handledMessage = true;

          const directActionResults =
            actionResultsFromMessageResult(messageResult);
          const stateActionResults = actionResultsFromState(
            messageResult?.state,
          );
          const settledThisAttempt = settledActionResults.slice(
            settledCountBeforeAttempt,
          );
          const attemptActionResults =
            directActionResults.length > 0
              ? directActionResults
              : stateActionResults.length > 0
                ? stateActionResults
                : settledThisAttempt;
          plannerBudget.finishPass(attemptActionResults.length);
          actionResults = collectProviderActionResults(
            input.context.runtime,
            actionResults,
            settledThisAttempt,
            attemptActionResults,
          );
          consecutiveNoActionPasses =
            attemptActionResults.length === 0
              ? consecutiveNoActionPasses + 1
              : 0;
          // Receipt-backed visual edits need the completion gate even when a
          // short user request did not match the workspace-intent heuristic.
          mutationObligation ||= frontendReviewRequired(actionResults, prompt);
          allResponseMessages.push(...(messageResult?.responseMessages ?? []));
          responseMessages = allResponseMessages;
          const selectedResponse = resolveSdkMessageResponse({
            responseContent: messageResult?.responseContent,
            responseMessages,
            provisionalResponse: input.streamState.getResponse(),
            actionResults,
          });
          response = selectedResponse.text;

          // A planner can return a polished-sounding preamble (or a premature
          // summary) after inspection without actually changing the workspace.
          // Do not treat that text as terminal until a mutation receipt exists
          // or a strict no-op evidence contract proves the requested state was
          // already satisfied. A silent unverified pass still gets its bounded
          // follow-up so the SDK can synthesize a final answer.
          const incompleteKind = mutationObligation
            ? explicitlyReportsIncompleteWork(response)
            : undefined;
          const responseExplicitlyIncomplete = Boolean(incompleteKind);
          let currentVerificationScopes: IncompleteVerificationScope[] = [];
          if (incompleteKind) {
            // A weaker admission cannot erase unresolved implementation work.
            // It may become verification-only once a new verified mutation
            // supersedes the earlier correction boundary; fresh checks must
            // still follow this newest admission.
            const unresolvedImplementation =
              admittedIncomplete?.kind === "implementation" &&
              (!admittedIncomplete.workdir ||
                !hasVerifiedWorkspaceMutation(
                  actionResults.slice(admittedIncomplete.actionCount),
                  admittedIncomplete?.workdir,
                ));
            const verificationAdmissions = new Map(
              admittedIncomplete?.verificationAdmissions,
            );
            // Mixed admissions retain each unfinished verification stage even
            // while implementation remains the stronger obligation.
            currentVerificationScopes = [
              ...incompleteVerificationScopes(response),
            ];
            for (const scope of currentVerificationScopes)
              verificationAdmissions.set(scope, actionResults.length);
            admittedIncomplete = {
              actionCount: actionResults.length,
              kind: unresolvedImplementation
                ? "implementation"
                : incompleteKind,
              workdir: admittedIncomplete
                ? admittedIncomplete.workdir
                : admittedWorkspace(
                    actionResults,
                    input.context.services.workspace.root(),
                  ),
              verificationAdmissions,
            };
          }
          const currentRequirements = frontendRequirements(
            actionResults,
            noOpRequirements,
            prompt,
          );
          const verifiedWorkspaceNoop = Boolean(
            verifyWorkspaceNoopCompletion(actionResults, noOpRequirements),
          );
          const verifiedWorkspaceCompletion = hasVerifiedWorkspaceCompletion(
            actionResults,
            currentRequirements,
          );
          const frontendReviewComplete =
            !frontendReviewRequired(actionResults, prompt) ||
            Boolean(
              frontendReviewAttempt(actionResults, noOpRequirements, prompt),
            );
          const correctedAfterAdmission =
            !responseExplicitlyIncomplete &&
            admittedIncomplete !== undefined &&
            actionResults.length > admittedIncomplete.actionCount &&
            verifiedWorkspaceCompletion &&
            frontendReviewComplete &&
            (admittedIncomplete.kind !== "implementation" ||
              (Boolean(admittedIncomplete.workdir) &&
                hasVerifiedWorkspaceMutation(
                  actionResults.slice(admittedIncomplete.actionCount),
                  admittedIncomplete.workdir,
                ))) &&
            [...admittedIncomplete.verificationAdmissions].every(
              ([scope, actionCount]) =>
                hasPostAdmissionWorkspaceVerification(
                  actionResults,
                  actionCount,
                  scope,
                  currentRequirements,
                  prompt,
                  admittedIncomplete?.workdir,
                ),
            );
          if (correctedAfterAdmission) admittedIncomplete = undefined;
          const explicitlyIncomplete =
            responseExplicitlyIncomplete || admittedIncomplete !== undefined;
          if (
            managedDelegationFailure(actionResults) ||
            frontendReviewBlockedByUserConstraint(
              actionResults,
              noOpRequirements,
              prompt,
            ) ||
            !mutationObligation ||
            isSdkFailureReply(messageResult?.responseContent) ||
            hasPendingApproval(input.context, sessionId) ||
            attempt >= MAX_MUTATION_CONTINUATION_PASSES - 1 ||
            plannerBudget.exhausted ||
            consecutiveNoActionPasses >= MAX_CONSECUTIVE_NO_ACTION_PASSES ||
            // A strict no-op receipt includes the completed coding-agent
            // attestation plus the requested parent install/build and ready
            // server evidence. It is authoritative over a contradictory
            // provisional model phrase such as "not started yet"; continuing
            // after it only repeats already-verified workspace actions.
            (verifiedWorkspaceNoop && frontendReviewComplete) ||
            (response.trim() &&
              verifiedWorkspaceCompletion &&
              frontendReviewComplete &&
              !explicitlyIncomplete) ||
            (!response.trim() &&
              attempt > 0 &&
              !verifiedWorkspaceCompletion &&
              !hasVerifiedWorkspaceMutation(actionResults))
          ) {
            break;
          }

          // Observe only continuing passes, after the existing clearance gate.
          // These enums describe receipt obligations, not response content or
          // proof that the model's admission accurately describes the app.
          let retainedUnmetCategories: Array<
            "implementation" | IncompleteVerificationScope
          > | null = [];
          try {
            if (admittedIncomplete) {
              if (
                admittedIncomplete.kind === "implementation" &&
                (!admittedIncomplete.workdir ||
                  !hasVerifiedWorkspaceMutation(
                    actionResults.slice(admittedIncomplete.actionCount),
                    admittedIncomplete.workdir,
                  ))
              )
                retainedUnmetCategories.push("implementation");
              for (const [
                scope,
                actionCount,
              ] of admittedIncomplete.verificationAdmissions) {
                if (
                  !hasPostAdmissionWorkspaceVerification(
                    actionResults,
                    actionCount,
                    scope,
                    currentRequirements,
                    prompt,
                    admittedIncomplete.workdir,
                  )
                )
                  retainedUnmetCategories.push(scope);
              }
            }
          } catch {
            // Optional observation must not change the continuation decision.
            retainedUnmetCategories = null;
          }
          recordEvaluationTraceEvent(input.context, {
            category: "model",
            event: "model.continuation",
            sessionId,
            runId: input.runId,
            roomId: input.roomId,
            source: input.connectionSource,
            provider: input.settingsDuring.model.provider,
            model: input.settingsDuring.model.model,
            text: "[model:continuation] continuing an unfinished workspace mutation",
            metadata: {
              reason: explicitlyIncomplete
                ? "explicitly-incomplete-response"
                : response.trim()
                  ? "unverified-terminal-response"
                  : "empty-terminal-response",
              responseChars: response.length,
              verifiedMutation: hasVerifiedWorkspaceMutation(actionResults),
              verifiedNoopCompletion: Boolean(
                verifyWorkspaceNoopCompletion(actionResults, noOpRequirements),
              ),
              attempt: attempt + 1,
              continuationDiagnostics: {
                version: 1,
                responseOrigin: selectedResponse.origin,
                currentExplicitlyIncomplete: responseExplicitlyIncomplete,
                currentIncompleteKind: incompleteKind ?? null,
                currentVerificationScopes,
                retainedIncompleteKind: admittedIncomplete?.kind ?? null,
                retainedUnmetCategories,
                verifiedWorkspaceCompletion,
                frontendReviewComplete,
              },
              actionNames: Array.from(
                new Set(
                  actionResults
                    .map(actionResultActionName)
                    .filter((name): name is string => Boolean(name)),
                ),
              ),
            },
          });
          messageMemory = continuationMemory(
            input.memory,
            prompt,
            actionResults,
            response,
            currentRequirements,
          );
        }

        throwIfTurnAborted(input.abortSignal);
        const delegatedFailure = managedDelegationFailure(actionResults);
        if (delegatedFailure) {
          runFailureMessage = delegatedFailure.message;
          response = delegatedFailure.message;
        }
        if (
          !runFailureMessage &&
          isSdkFailureReply(messageResult?.responseContent)
        ) {
          const providerFailure =
            response ||
            "The model provider could not complete this turn. Check provider status and retry.";
          const completedPass =
            completedManagedDelegationResponse(actionResults);
          const plannerLimitReached =
            messageResult?.responseContent?.failureKind === "trajectory_limit";
          if (admittedIncomplete !== undefined) {
            runFailureMessage =
              incompleteAdmittedWorkspaceFailure(actionResults);
            response = runFailureMessage;
          } else if (completedPass) {
            const appServerSummary =
              completedManagedAppServerSummary(actionResults);
            response = [
              completedPass,
              appServerSummary,
              plannerLimitReached
                ? "The parent planner reached its configured execution limit after the coding agent finished. This receipt-backed report is preserved as the final answer; it does not infer checks beyond the results listed above."
                : "Doolittle's configured response provider returned an unavailable reply after the coding agent finished. This receipt-backed report is preserved as the final answer; it does not infer checks beyond the results listed above.",
            ]
              .filter(Boolean)
              .join("\n\n");
            input.context.runtime.logger?.warn(
              {
                runId: input.runId,
                sessionId,
                roomId: input.roomId,
                provider: input.settingsDuring.model.provider,
                model: input.settingsDuring.model.model,
                failureKind: messageResult?.responseContent?.failureKind,
                verifiedMutation: hasVerifiedWorkspaceMutation(actionResults),
                managedAppReady: Boolean(appServerSummary),
              },
              "ElizaOS returned a no-provider terminal reply after a completed managed coding delegation; preserved its verified report",
            );
          } else {
            runFailureMessage = providerFailure;
            response = providerFailure;
          }
        }
        const verifiedNoopCompletion = mutationObligation
          ? verifyWorkspaceNoopCompletion(actionResults, noOpRequirements)
          : undefined;
        const finalRequirements = frontendRequirements(
          actionResults,
          noOpRequirements,
          prompt,
        );
        if (
          mutationObligation &&
          unresolvedInteractiveTextBlocker(
            actionResults,
            noOpRequirements,
            prompt,
          )
        ) {
          runFailureMessage = [
            UNRESOLVED_INTERACTIVE_TEXT_FAILURE,
            serverStartPolicy(prompt).forbidden
              ? "The user's instruction still forbids starting or restarting a server; do not do so for correction verification."
              : undefined,
            runFailureMessage,
          ]
            .filter(Boolean)
            .join(" ");
          response = runFailureMessage;
        }
        if (
          !runFailureMessage &&
          mutationObligation &&
          frontendReviewBlockedByUserConstraint(
            actionResults,
            noOpRequirements,
            prompt,
          )
        ) {
          runFailureMessage = CONSTRAINED_FRONTEND_REVIEW_FAILURE;
          response = runFailureMessage;
        }
        if (
          !runFailureMessage &&
          mutationObligation &&
          !hasVerifiedWorkspaceMutation(actionResults) &&
          !verifiedNoopCompletion
        ) {
          runFailureMessage = incompleteMutationFailure(actionResults);
          response = runFailureMessage;
        }
        if (
          !runFailureMessage &&
          mutationObligation &&
          hasVerifiedWorkspaceMutation(actionResults) &&
          missingWorkspaceMutationRequirements(actionResults, finalRequirements)
            .length > 0
        ) {
          runFailureMessage = incompleteWorkspaceVerificationFailure(
            actionResults,
            finalRequirements,
          );
          response = runFailureMessage;
        }
        if (
          !runFailureMessage &&
          mutationObligation &&
          frontendReviewRequired(actionResults, prompt) &&
          !frontendReviewAttempt(actionResults, noOpRequirements, prompt)
        ) {
          runFailureMessage =
            "The frontend changed and its build and managed app readiness were verified, but no browser-analysis attempt followed the latest mutation, build, and ready receipt. The changes are preserved; review the current rendered app before claiming completion.";
          response = runFailureMessage;
        }
        if (!runFailureMessage && verifiedNoopCompletion) {
          const providerUnavailable = isSdkFailureReply(
            messageResult?.responseContent,
          )
            ? messageResult?.responseContent?.failureKind === "trajectory_limit"
              ? "The parent planner reached its configured execution limit; completion is based on the verified coding, build, server, and HTTP receipts."
              : "The configured response provider did not produce a final message; completion is based on the verified coding, build, server, and HTTP receipts."
            : undefined;
          response = verifiedWorkspaceNoopResponse(
            verifiedNoopCompletion,
            providerUnavailable,
          );
        }
        if (
          !runFailureMessage &&
          mutationObligation &&
          !verifiedNoopCompletion &&
          (admittedIncomplete !== undefined ||
            explicitlyReportsIncompleteWork(response))
        ) {
          runFailureMessage =
            admittedIncomplete !== undefined
              ? incompleteAdmittedWorkspaceFailure(actionResults)
              : [
                  "The requested workspace task is still incomplete after the agent's continuation attempts.",
                  hasVerifiedWorkspaceMutation(actionResults)
                    ? "Some local files changed, but the final response confirms implementation or verification remains unfinished."
                    : "No verified local file changes were recorded.",
                  "Inspect the current workspace before retrying; completed partial changes have been preserved.",
                ].join(" ");
          response = runFailureMessage;
        }
        const pendingFrontendReview = mutationObligation
          ? frontendReviewAttempt(actionResults, noOpRequirements, prompt)
          : undefined;
        // Mandatory review disclosure makes byte-exact final delivery ineligible.
        // Keep both recovery checks consistent; never suppress the disclosure.
        const allowExactOutput = pendingFrontendReview === undefined;
        if (!runFailureMessage && !response.trim() && mutationObligation) {
          const verifiedMutations = actionResults.flatMap((result) =>
            extractLocalMutationsFromActionResult(result).filter(
              (mutation) => result.success === true && mutation.success,
            ),
          );
          if (verifiedMutations.length > 0) {
            try {
              response = await synthesizeToolResultResponse({
                context: input.context,
                userRequest: prompt,
                actionResults,
                abortSignal: input.abortSignal,
                runtimeOverrides: input.settingsDuring.model,
                allowExactOutput,
              });
            } catch (error) {
              input.context.runtime.logger?.warn(
                {
                  error,
                  runId: input.runId,
                  sessionId,
                  roomId: input.roomId,
                  verifiedMutationCount: verifiedMutations.length,
                },
                "Unable to synthesize a terminal answer from verified workspace changes",
              );
            }
          }
          if (!response.trim()) {
            runFailureMessage = incompleteMutationFailure(actionResults);
            response = runFailureMessage;
          }
        }
        if (
          !runFailureMessage &&
          isUnsynthesizedToolResponse(
            response,
            actionResults,
            prompt,
            allowExactOutput,
          )
        ) {
          input.context.runtime.logger?.warn(
            {
              runId: input.runId,
              sessionId,
              roomId: input.roomId,
              messageId,
              actionResultCount: actionResults.length,
              responseChars: response.length,
            },
            "ElizaOS returned raw native tool output as the terminal response; synthesizing a user-facing answer",
          );
          responseMessages = await discardUnsynthesizedResponseMemories({
            context: input.context,
            response,
            responseMessages,
            runId: input.runId,
            sessionId,
            roomId: input.roomId,
          });
          response = await synthesizeToolResultResponse({
            context: input.context,
            userRequest: prompt,
            actionResults,
            abortSignal: input.abortSignal,
            runtimeOverrides: input.settingsDuring.model,
            allowExactOutput,
          });
        }
        if (pendingFrontendReview)
          response =
            `${response.trim()}\n\n${frontendReviewSummary(pendingFrontendReview)}`.trim();
        input.streamState.setResponse(response);
      } catch (error) {
        if (input.abortSignal?.aborted) throw error;
        const committedActionResults = collectProviderActionResults(
          input.context.runtime,
          actionResults,
          settledActionResults,
        );
        mutationObligation ||= frontendReviewRequired(
          committedActionResults,
          prompt,
        );
        if (
          mutationObligation &&
          unresolvedInteractiveTextBlocker(
            committedActionResults,
            noOpRequirements,
            prompt,
          )
        ) {
          handledMessage = true;
          actionResults = committedActionResults;
          runFailureMessage = [
            UNRESOLVED_INTERACTIVE_TEXT_FAILURE,
            serverStartPolicy(prompt).forbidden
              ? "The user's instruction still forbids starting or restarting a server; do not do so for correction verification."
              : undefined,
          ]
            .filter(Boolean)
            .join(" ");
          response = runFailureMessage;
          input.streamState.setResponse(response);
          return;
        }
        if (admittedIncomplete !== undefined) {
          handledMessage = true;
          actionResults = committedActionResults;
          runFailureMessage = incompleteAdmittedWorkspaceFailure(
            committedActionResults,
          );
          response = runFailureMessage;
          input.streamState.setResponse(response);
          return;
        }
        const recoveredNoopCompletion = mutationObligation
          ? verifyWorkspaceNoopCompletion(
              committedActionResults,
              noOpRequirements,
            )
          : undefined;
        if (recoveredNoopCompletion) {
          handledMessage = true;
          actionResults = committedActionResults;
          response = verifiedWorkspaceNoopResponse(
            recoveredNoopCompletion,
            "The model did not provide a separate final message; Doolittle completed from the verified coding, Bun, build, and managed-server receipts.",
          );
          input.context.runtime.logger?.warn(
            {
              error,
              runId: input.runId,
              sessionId,
              provider: input.settingsDuring.model.provider,
              model: input.settingsDuring.model.model,
              roomId: input.roomId,
              messageId,
              actionResultCount: actionResults.length,
              verifiedNoop: true,
              managedAppReady: Boolean(recoveredNoopCompletion.url),
            },
            "ElizaOS continuation failed after the requested workspace state was verified; preserving receipt-backed completion",
          );
          input.streamState.setResponse(response);
          return;
        }
        const recoveredRequirements = frontendRequirements(
          committedActionResults,
          noOpRequirements,
          prompt,
        );
        if (
          mutationObligation &&
          frontendReviewBlockedByUserConstraint(
            committedActionResults,
            noOpRequirements,
            prompt,
          )
        ) {
          handledMessage = true;
          actionResults = committedActionResults;
          runFailureMessage = CONSTRAINED_FRONTEND_REVIEW_FAILURE;
          response = runFailureMessage;
          input.streamState.setResponse(response);
          return;
        }
        if (
          mutationObligation &&
          hasVerifiedWorkspaceMutation(committedActionResults) &&
          missingWorkspaceMutationRequirements(
            committedActionResults,
            recoveredRequirements,
          ).length > 0
        ) {
          handledMessage = true;
          actionResults = committedActionResults;
          response = incompleteWorkspaceVerificationFailure(
            actionResults,
            recoveredRequirements,
          );
          runFailureMessage = response;
          input.context.runtime.logger?.warn(
            {
              error,
              runId: input.runId,
              sessionId,
              provider: input.settingsDuring.model.provider,
              model: input.settingsDuring.model.model,
              roomId: input.roomId,
              messageId,
              missingRequirements: missingWorkspaceMutationRequirements(
                actionResults,
                recoveredRequirements,
              ),
            },
            "ElizaOS continuation failed before requested workspace verification receipts were recorded",
          );
          input.streamState.setResponse(response);
          return;
        }
        if (
          mutationObligation &&
          frontendReviewRequired(committedActionResults, prompt) &&
          !frontendReviewAttempt(
            committedActionResults,
            noOpRequirements,
            prompt,
          )
        ) {
          handledMessage = true;
          actionResults = committedActionResults;
          runFailureMessage =
            "The frontend changed, but no browser-analysis attempt followed the latest mutation, build, and verified managed app readiness. The changes are preserved; review the current app before claiming completion.";
          response = runFailureMessage;
          input.streamState.setResponse(response);
          return;
        }
        const recoveredDelegationResponse = completedManagedDelegationResponse(
          committedActionResults,
        );
        if (recoveredDelegationResponse) {
          handledMessage = true;
          actionResults = committedActionResults;
          const review = frontendReviewAttempt(
            actionResults,
            noOpRequirements,
            prompt,
          );
          response = review
            ? `${recoveredDelegationResponse}\n\n${frontendReviewSummary(review)}`
            : recoveredDelegationResponse;
          input.context.runtime.logger?.warn(
            {
              error,
              runId: input.runId,
              sessionId,
              provider: input.settingsDuring.model.provider,
              model: input.settingsDuring.model.model,
              roomId: input.roomId,
              messageId,
              actionResultCount: actionResults.length,
            },
            "ElizaOS parent continuation failed after a completed managed coding delegation; preserving its verified completion receipt",
          );
          input.streamState.setResponse(response);
          return;
        }
        const failureMessage = input.buildProviderFailureMessage(
          input.settingsDuring.model.provider,
          input.settingsDuring.model.model,
          error,
          input.settingsDuring.model.baseUrl,
        );
        input.context.runtime.logger?.warn(
          {
            error,
            runId: input.runId,
            sessionId,
            provider: input.settingsDuring.model.provider,
            model: input.settingsDuring.model.model,
            roomId: input.roomId,
            messageId,
          },
          "ElizaOS message service turn failed",
        );
        try {
          await input.onNotice?.({
            kind: "status",
            message: failureMessage,
          });
        } catch (noticeError) {
          input.context.runtime.logger?.warn(
            { noticeError, runId: input.runId, sessionId, messageId },
            "Provider failure notice callback failed",
          );
        }
        response = failureMessage;
        runFailureMessage = failureMessage;
        input.streamState.setResponse(response);
      } finally {
        const elapsedMs = elapsedMsSince(startedAt);
        recordEvaluationTraceEvent(input.context, {
          category: "model",
          event: runFailureMessage ? "model.error" : "model.response",
          sessionId,
          runId: input.runId,
          roomId: input.roomId,
          source: input.connectionSource,
          provider: input.settingsDuring.model.provider,
          model: input.settingsDuring.model.model,
          elapsedMs,
          text: `[model:${runFailureMessage ? "error" : "response"}] ${response}`,
          metadata: {
            path: "provider-message-service",
            trajectoryStepId: readSdkTrajectoryStepId(input.memory.metadata),
            handledMessage,
            messageId,
            actionResults,
            response,
            responseChars: response.length,
            runFailureMessage,
          },
        });
      }
    },
  );

  return {
    handledMessage,
    response,
    runFailureMessage,
    messageId,
    actionResults,
    responseMessages,
  };
}
