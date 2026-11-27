import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { RunReceiptStore } from "./chat/models";
import { desktopQueryClient } from "./lib";
import {
  deriveSessionAttention,
  pendingInputsBySession,
  rollupSessionRuns,
  type SessionAttention,
} from "./session-attention";
import { useWorkspaceState } from "./session-workspace/chat-workspace-store";
import "./session-attention.css";

/**
 * Attention evidence is read-only: the volatile chat workspace store plus the
 * approval/input-request payloads the shell and composers already poll. No
 * query is created here, so rows never add network or runtime load; coverage
 * is exactly as fresh as the existing consumers make it.
 */
const ATTENTION_RESOURCE_PATHS = [
  "/execution/approvals?status=pending",
  "/execution/input-requests?status=pending",
] as const;

let scanMemo: { revision: string; payloads: readonly unknown[] } = {
  revision: "",
  payloads: [],
};

function scanAttentionPayloads(): readonly unknown[] {
  const matched = desktopQueryClient
    .getQueryCache()
    .findAll()
    .filter((query) => {
      const key = query.queryKey[0];
      return (
        typeof key === "string" &&
        ATTENTION_RESOURCE_PATHS.some((path) =>
          key.startsWith(`doolittle:api:${path}`),
        ) &&
        query.state.data !== undefined
      );
    });
  const revision = matched
    .map((query) => `${String(query.queryKey[0])}@${query.state.dataUpdatedAt}`)
    .sort()
    .join("\n");
  if (revision === scanMemo.revision) return scanMemo.payloads;
  const payloads = matched.map((query) => query.state.data);
  scanMemo = { revision, payloads };
  return payloads;
}

function subscribeQueryCache(listener: () => void): () => void {
  return desktopQueryClient.getQueryCache().subscribe(listener);
}

/**
 * Lookup for the attention state of any session row. Surfaces outside the
 * chat workspace store read empty volatile state and stay quiet, which is the
 * honest answer when no run evidence is mounted.
 */
export function useSessionAttention(): (sessionId: string) => SessionAttention {
  const [activeRequests] = useWorkspaceState<Record<string, string>>(
    "run.active-requests",
    {},
  );
  const [receipts] = useWorkspaceState<RunReceiptStore>("run.receipts", {});
  const payloads = useSyncExternalStore(
    subscribeQueryCache,
    scanAttentionPayloads,
  );
  const inputsBySession = useMemo(
    () => pendingInputsBySession(payloads),
    [payloads],
  );
  const runsBySession = useMemo(
    () => rollupSessionRuns(activeRequests, receipts),
    [activeRequests, receipts],
  );
  return useCallback(
    (sessionId: string) =>
      deriveSessionAttention({
        runActivity: runsBySession.get(sessionId),
        pendingInputs: inputsBySession.get(sessionId) ?? 0,
      }),
    [runsBySession, inputsBySession],
  );
}

/**
 * Compact quiet row marker in the activity feed's dot idiom: a small accent
 * dot with a halo when the session needs input, a plain muted dot while it is
 * working, and nothing at all when idle. The marker is presentation only;
 * rows carry the same state as text in their tooltips.
 */
export function SessionAttentionMark({
  attention,
}: {
  attention: SessionAttention;
}) {
  if (attention.kind === "idle") return null;
  return (
    <span
      aria-hidden="true"
      className="session-attention-mark"
      data-kind={attention.kind}
    />
  );
}
