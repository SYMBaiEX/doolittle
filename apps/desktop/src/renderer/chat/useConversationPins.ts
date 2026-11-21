import { useCallback, useEffect, useRef } from "react";
import { isTranscriptId } from "../../shared/transcript-id";
import {
  CONVERSATION_PINS_EVENT,
  CONVERSATION_PINS_STORAGE_KEY,
  type ConversationPins,
  loadConversationPins,
  saveConversationPins,
} from "../conversation-persistence";
import {
  useChatWorkspaceStore,
  useWorkspaceState,
} from "../session-workspace/chat-workspace-store";

const PINS_STATE_KEY = "conversation.pins";
const readPins = () => loadConversationPins(localStorage);

export function useConversationPins(observeStorage = true) {
  const store = useChatWorkspaceStore();
  const [pinnedSessions, setPinnedSessions] = useWorkspaceState(
    PINS_STATE_KEY,
    readPins,
  );
  const lastPins = useRef(pinnedSessions);
  lastPins.current = pinnedSessions;

  useEffect(() => {
    if (!observeStorage) return;
    const sync = () => setPinnedSessions(readPins());
    const syncStorage = (event: StorageEvent) => {
      if (event.key === CONVERSATION_PINS_STORAGE_KEY || event.key === null)
        sync();
    };
    window.addEventListener(CONVERSATION_PINS_EVENT, sync);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(CONVERSATION_PINS_EVENT, sync);
      window.removeEventListener("storage", syncStorage);
    };
  }, [observeStorage, setPinnedSessions]);

  const togglePin = useCallback(
    (sessionId: string) => {
      if (!isTranscriptId(sessionId)) return;
      const current =
        store?.read<ConversationPins>(PINS_STATE_KEY, readPins) ??
        lastPins.current;
      const next = { ...current, [sessionId]: true };
      if (current[sessionId] === true) delete next[sessionId];
      lastPins.current = next;
      setPinnedSessions(next);
      if (saveConversationPins(localStorage, next))
        window.dispatchEvent(new Event(CONVERSATION_PINS_EVENT));
    },
    [setPinnedSessions, store],
  );

  return { pinnedSessions, togglePin };
}
