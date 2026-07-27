import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandGroup, CommandItem } from "./components/CommandPalette";
import {
  asArray,
  asRecord,
  asString,
  desktopRequest,
  displayTimestamp,
} from "./lib";

export type GlobalSearchTarget =
  | { kind: "conversation"; sessionId: string }
  | { kind: "workspace"; path: string }
  | { kind: "task"; taskId: string }
  | { kind: "log"; id: string };

export interface GlobalSearchResult {
  id: string;
  group: "Conversations" | "Workspace code" | "Tasks" | "Logs";
  label: string;
  description: string;
  keywords: string[];
  target: GlobalSearchTarget;
}

interface SearchPayloads {
  sessions: unknown;
  workspace: unknown;
  tasks: unknown;
  logs: unknown;
}

const GROUP_ORDER: GlobalSearchResult["group"][] = [
  "Conversations",
  "Workspace code",
  "Tasks",
  "Logs",
];
const MAX_RESULTS_PER_GROUP = 8;

function concise(value: string, max = 110): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
    : normalized;
}

function includesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function boundedUnique(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>();
  return results
    .filter((result) => {
      if (seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    })
    .slice(0, MAX_RESULTS_PER_GROUP);
}

export function normalizeGlobalSearchResults(
  payloads: SearchPayloads,
  query: string,
): GlobalSearchResult[] {
  const normalizedQuery = concise(query, 240).trim();
  if (normalizedQuery.length < 2) return [];

  const conversationResults = boundedUnique(
    asArray(asRecord(payloads.sessions).hits)
      .map((value): GlobalSearchResult | null => {
        const hit = asRecord(value);
        const sessionId = asString(hit.sessionId);
        const text = concise(asString(hit.text));
        if (!sessionId || !text) return null;
        return {
          id: `conversation:${sessionId}`,
          group: "Conversations",
          label: concise(text, 72),
          description: `Conversation · ${displayTimestamp(asString(hit.createdAt) || undefined)}`,
          keywords: [sessionId, text, normalizedQuery],
          target: { kind: "conversation", sessionId },
        };
      })
      .filter((result): result is GlobalSearchResult => result !== null),
  );

  const workspaceResults = boundedUnique(
    asArray(asRecord(payloads.workspace).results)
      .map((value): GlobalSearchResult | null => {
        const result = asRecord(value);
        const path = asString(result.path);
        const preview = concise(
          asArray(result.matches)
            .map((match) => asString(match))
            .filter(Boolean)
            .join(" · "),
        );
        if (!path) return null;
        return {
          id: `workspace:${path}`,
          group: "Workspace code",
          label: concise(path, 88),
          description: preview ? `Code · ${preview}` : "Code result",
          keywords: [path, preview, normalizedQuery],
          target: { kind: "workspace", path },
        };
      })
      .filter((result): result is GlobalSearchResult => result !== null),
  );

  const taskResults = boundedUnique(
    asArray(asRecord(payloads.tasks).tasks)
      .map((value): GlobalSearchResult | null => {
        const task = asRecord(value);
        const id = asString(task.id);
        const title = concise(
          asString(task.title) || asString(task.objective),
          88,
        );
        const objective = concise(asString(task.objective));
        const searchable = [id, title, objective, asString(task.status)].join(
          " ",
        );
        if (!id || !title || !includesQuery(searchable, normalizedQuery))
          return null;
        return {
          id: `task:${id}`,
          group: "Tasks",
          label: title,
          description: `${asString(task.status, "pending")} · ${objective || id}`,
          keywords: [id, title, objective, normalizedQuery],
          target: { kind: "task", taskId: id },
        };
      })
      .filter((result): result is GlobalSearchResult => result !== null),
  );

  const logResults = boundedUnique(
    asArray(asRecord(payloads.logs).logs)
      .map((value, index): GlobalSearchResult | null => {
        const log = asRecord(value);
        const message = concise(asString(log.message), 88);
        const detail = concise(asString(log.detail));
        const scope = asString(log.scope, "runtime");
        const at = asString(log.at);
        if (!message) return null;
        return {
          id: `log:${at || index}:${scope}:${message}`,
          group: "Logs",
          label: message,
          description: `${asString(log.level, "info")} · ${scope}${detail ? ` · ${detail}` : ""}`,
          keywords: [scope, message, detail, normalizedQuery],
          target: { kind: "log", id: at || `${index}` },
        };
      })
      .filter((result): result is GlobalSearchResult => result !== null),
  );

  return [
    ...conversationResults,
    ...workspaceResults,
    ...taskResults,
    ...logResults,
  ];
}

export function globalSearchGroups(
  results: readonly GlobalSearchResult[],
  onSelect: (target: GlobalSearchTarget) => void,
): CommandGroup[] {
  return GROUP_ORDER.map((label) => ({
    id: `search-${label.toLowerCase().replace(/\s+/gu, "-")}`,
    label,
    items: results
      .filter((result) => result.group === label)
      .map<CommandItem>((result) => ({
        id: result.id,
        label: result.label,
        description: result.description,
        keywords: result.keywords,
        onSelect: () => onSelect(result.target),
      })),
  })).filter((group) => group.items.length > 0);
}

export function useGlobalSearch(query: string, active: boolean) {
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const trimmedQuery = query.trim();

  useEffect(() => {
    const requestSequence = ++sequence.current;
    if (!active || trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        desktopRequest<unknown>(
          `/sessions/search?query=${encodeURIComponent(trimmedQuery)}&limit=8`,
        ),
        desktopRequest<unknown>(
          `/workspace/search?query=${encodeURIComponent(trimmedQuery)}`,
        ),
        desktopRequest<unknown>("/delegation/tasks?limit=50"),
        desktopRequest<unknown>(
          `/logs?limit=100&query=${encodeURIComponent(trimmedQuery)}`,
        ),
      ]).then((responses) => {
        if (sequence.current !== requestSequence) return;
        const [sessions, workspace, tasks, logs] = responses;
        const failures = responses.filter(
          (response) => response.status === "rejected",
        );
        setResults(
          normalizeGlobalSearchResults(
            {
              sessions: sessions.status === "fulfilled" ? sessions.value : {},
              workspace:
                workspace.status === "fulfilled" ? workspace.value : {},
              tasks: tasks.status === "fulfilled" ? tasks.value : {},
              logs: logs.status === "fulfilled" ? logs.value : {},
            },
            trimmedQuery,
          ),
        );
        setError(
          failures.length
            ? `Some local search sources are unavailable (${failures.length}/4).`
            : "",
        );
        setLoading(false);
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [active, trimmedQuery]);

  return useMemo(
    () => ({ results, loading, error }),
    [error, loading, results],
  );
}
