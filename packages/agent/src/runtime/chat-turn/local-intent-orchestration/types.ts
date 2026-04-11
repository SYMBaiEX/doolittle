import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";

export interface DirectLocalIntentLoader {
  directLocalIntent: unknown;
  executeDirectLocalIntent: (
    intent: never,
    sessionId: string,
    context: AgentExecutionContext,
    hooks?: AgentTurnHooks,
  ) => Promise<string>;
  isHighConfidenceDirectLocalIntent: (intent: never) => boolean;
  requiresModelSynthesisForLocalIntent: (intent: never) => boolean;
  shouldUseDirectLocalFallback: (input: {
    message: string;
    response: string;
    observedActionCount: number;
    runFailureMessage?: string;
    isHighConfidenceIntent?: boolean;
    requiresModelSynthesis?: boolean;
  }) => boolean;
}

export type DirectLocalIntentModule = Partial<DirectLocalIntentLoader>;

export interface DirectLocalIntentLoaderDependencies {
  loadFallbackModule?: () => Promise<DirectLocalIntentModule>;
}

export interface DirectLocalIntentApprovalDependencies {
  maybeRequireRemoteExecutionApproval?: (
    input: ChatTurnRequest,
    context: AgentExecutionContext,
    command: string,
    options: AgentTurnHooks | undefined,
  ) => Promise<string | undefined>;
  storeSessionMessage?: (
    context: AgentExecutionContext,
    message: {
      sessionId: string;
      roomId: string;
      entityId: string;
      role: "assistant";
      text: string;
    },
  ) => void;
}

export interface PreferredLocalIntentFastPathDependencies
  extends DirectLocalIntentLoaderDependencies,
    DirectLocalIntentApprovalDependencies {
  createDirectLocalIntentLoader?: typeof import("./loader").createDirectLocalIntentLoader;
  executeApprovedDirectLocalIntent?: typeof import("./approval").executeApprovedDirectLocalIntent;
}

export type PreferredLocalIntentFastPathResult =
  | {
      kind: "approval";
      response: string;
      loadDirectLocalIntent: () => Promise<DirectLocalIntentLoader>;
      preferredLocalIntent: DirectLocalIntentLoader;
    }
  | {
      kind: "direct-response";
      response: string;
      loadDirectLocalIntent: () => Promise<DirectLocalIntentLoader>;
      preferredLocalIntent: DirectLocalIntentLoader;
    }
  | {
      kind: "continue";
      loadDirectLocalIntent: () => Promise<DirectLocalIntentLoader>;
      preferredLocalIntent: DirectLocalIntentLoader | null;
    };

export interface PreferredLocalIntentSynthesisDependencies
  extends DirectLocalIntentApprovalDependencies {
  executeApprovedDirectLocalIntent?: typeof import("./approval").executeApprovedDirectLocalIntent;
}

export type PreferredLocalIntentSynthesisResult =
  | {
      kind: "approval";
      response: string;
    }
  | {
      kind: "continue";
      localSynthesisPrelude: string;
    };

export interface LocalIntentOrchestrationInput {
  input: ChatTurnRequest;
  context: AgentExecutionContext;
  options?: AgentTurnHooks;
}
