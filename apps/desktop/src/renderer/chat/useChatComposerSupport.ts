import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CommandCatalogItem,
  CommandCatalogResponse,
  SavedProfileRecallResponse,
  SessionUsageSummary,
} from "../../shared/contracts";
import { commandCompletions } from "../command-completion";
import {
  type ContextPressureSnapshot,
  type ContextPressureTone,
  clampContextPercent,
  contextPressureTone,
} from "../context-pressure";
import { desktopRequest, errorMessage } from "../lib";
import {
  canRecallSavedProfileMatches,
  normalizeSavedProfileMatches,
} from "../memory-matches";
import type { ChatMemoryMatchState } from "./models";

const MEMORY_MATCH_DEBOUNCE_MS = 380;

interface SessionUsageResponse {
  usage?: SessionUsageSummary;
}

export interface CommandCatalogState {
  commands: CommandCatalogItem[];
  error: string;
}

export interface UseChatComposerSupportOptions {
  backendReady: boolean;
  commandMenuDismissed: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  selectedId: string;
  setCommandMenuDismissed: Dispatch<SetStateAction<boolean>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setQueueAnnouncement: Dispatch<SetStateAction<string>>;
}

export interface ChatComposerSupportState {
  commandCatalog: CommandCatalogState;
  commandSuggestions: CommandCatalogItem[];
  memoryMatches: ChatMemoryMatchState;
  refreshSessionUsage: (sessionId: string) => Promise<void>;
  selectCommandSuggestion: (command: CommandCatalogItem) => void;
  selectedContext: ContextPressureSnapshot | undefined;
  selectedContextLabel: string;
  selectedContextPercent: number;
  selectedContextTone: ContextPressureTone;
  selectedUsageError: string | undefined;
  usageLoading: string;
}

function isCommandMessage(message: string): boolean {
  return message.startsWith("/") || message.startsWith("!");
}

export function useChatComposerSupport({
  backendReady,
  commandMenuDismissed,
  composerRef,
  draft,
  selectedId,
  setCommandMenuDismissed,
  setDraft,
  setQueueAnnouncement,
}: UseChatComposerSupportOptions): ChatComposerSupportState {
  const [memoryMatches, setMemoryMatches] = useState<ChatMemoryMatchState>({
    query: "",
    matches: [],
    status: "idle",
  });
  const [sessionUsage, setSessionUsage] = useState<
    Record<string, ContextPressureSnapshot>
  >({});
  const [usageLoading, setUsageLoading] = useState("");
  const [usageErrors, setUsageErrors] = useState<Record<string, string>>({});
  const [commandCatalog, setCommandCatalog] = useState<CommandCatalogState>({
    commands: [],
    error: "",
  });
  const backendReadyRef = useRef(backendReady);
  backendReadyRef.current = backendReady;
  const memoryRecallSequence = useRef(0);
  const usageRequestSequence = useRef<Record<string, number>>({});

  const refreshSessionUsage = useCallback(
    async (sessionId: string) => {
      if (!sessionId || !backendReady) return;
      const sequence = (usageRequestSequence.current[sessionId] ?? 0) + 1;
      usageRequestSequence.current[sessionId] = sequence;
      const isLatestRequest = () =>
        backendReadyRef.current &&
        usageRequestSequence.current[sessionId] === sequence;

      setUsageLoading(sessionId);
      setUsageErrors((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      try {
        const path =
          `/sessions/usage?sessionId=${encodeURIComponent(sessionId)}` as const;
        const response = await desktopRequest<SessionUsageResponse>(path);
        const context = response.usage?.context;
        if (context && isLatestRequest()) {
          setSessionUsage((current) => ({
            ...current,
            [sessionId]: context,
          }));
        }
      } catch (error) {
        if (isLatestRequest()) {
          setUsageErrors((current) => ({
            ...current,
            [sessionId]: errorMessage(error),
          }));
        }
      } finally {
        if (isLatestRequest()) {
          setUsageLoading((current) => (current === sessionId ? "" : current));
        }
      }
    },
    [backendReady],
  );

  useEffect(() => {
    if (!backendReady) {
      setUsageLoading("");
      return;
    }
    void refreshSessionUsage(selectedId);
  }, [backendReady, refreshSessionUsage, selectedId]);

  useEffect(() => {
    if (!backendReady) {
      setCommandCatalog({ commands: [], error: "" });
      return;
    }

    let cancelled = false;
    void desktopRequest<CommandCatalogResponse>("/commands/catalog")
      .then((response) => {
        if (!cancelled) {
          setCommandCatalog({ commands: response.commands, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommandCatalog({
            commands: [],
            error: `Command catalog unavailable: ${errorMessage(error)}`,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backendReady]);

  useEffect(() => {
    const query = draft.trim();
    const sequence = memoryRecallSequence.current + 1;
    memoryRecallSequence.current = sequence;
    if (
      !backendReady ||
      isCommandMessage(query) ||
      !canRecallSavedProfileMatches(query)
    ) {
      setMemoryMatches({ query: "", matches: [], status: "idle" });
      return;
    }

    const timeout = window.setTimeout(() => {
      setMemoryMatches((current) => ({
        query,
        matches: current.query === query ? current.matches : [],
        status: "loading",
      }));
      const path =
        `/profiles/users/recall?userId=desktop-user&query=${encodeURIComponent(query)}` as const;
      void desktopRequest<SavedProfileRecallResponse>(path)
        .then((response) => {
          if (memoryRecallSequence.current !== sequence) return;
          setMemoryMatches({
            query,
            matches: normalizeSavedProfileMatches(response),
            status: "ready",
          });
        })
        .catch(() => {
          if (memoryRecallSequence.current !== sequence) return;
          setMemoryMatches({ query, matches: [], status: "error" });
        });
    }, MEMORY_MATCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [backendReady, draft]);

  const commandSuggestions = useMemo(
    () =>
      commandMenuDismissed
        ? []
        : commandCompletions(commandCatalog.commands, draft),
    [commandCatalog.commands, commandMenuDismissed, draft],
  );
  const selectCommandSuggestion = useCallback(
    (command: CommandCatalogItem) => {
      if (command.disabledReason) {
        setQueueAnnouncement(command.disabledReason);
        return;
      }
      setDraft(command.command);
      setCommandMenuDismissed(true);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [composerRef, setCommandMenuDismissed, setDraft, setQueueAnnouncement],
  );
  const selectedContext = sessionUsage[selectedId];
  const selectedUsageError = usageErrors[selectedId];
  const selectedContextPercent = selectedContext
    ? clampContextPercent(selectedContext.percent)
    : 0;
  const selectedContextTone = selectedContext
    ? contextPressureTone(selectedContext.usageFraction)
    : "neutral";
  const selectedContextLabel = selectedContext
    ? `${Math.round(selectedContextPercent)}%`
    : selectedUsageError
      ? "—"
      : "0%";

  return {
    commandCatalog,
    commandSuggestions,
    memoryMatches,
    refreshSessionUsage,
    selectCommandSuggestion,
    selectedContext,
    selectedContextLabel,
    selectedContextPercent,
    selectedContextTone,
    selectedUsageError,
    usageLoading,
  };
}
