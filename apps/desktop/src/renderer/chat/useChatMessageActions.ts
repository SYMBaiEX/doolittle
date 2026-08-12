import { useCallback, useEffect, useRef, useState } from "react";
import { visibleAssistantText } from "../components/message-output";
import type { CopyState, DisplayMessage } from "./models";

export interface ChatMessageActionsState {
  copyMessage: (id: string, value: string) => Promise<void>;
  copyStates: Record<string, CopyState>;
  readMessage: (message: DisplayMessage) => void;
  speakingMessageId: string;
  speechSupported: boolean;
  stopSpeaking: () => void;
}

export function useChatMessageActions(): ChatMessageActionsState {
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({});
  const [speakingMessageId, setSpeakingMessageId] = useState("");
  const copyTimeoutsRef = useRef(new Map<string, number>());
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSupported =
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(
    () => () => {
      for (const timeout of copyTimeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      copyTimeoutsRef.current.clear();
      window.speechSynthesis?.cancel();
      speechUtteranceRef.current = null;
    },
    [],
  );

  const copyMessage = useCallback(async (id: string, value: string) => {
    let state: CopyState = "copied";
    if (!value || !navigator.clipboard?.writeText) {
      state = "failed";
    } else {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        state = "failed";
      }
    }
    setCopyStates((current) => ({ ...current, [id]: state }));
    const priorTimeout = copyTimeoutsRef.current.get(id);
    if (priorTimeout !== undefined) window.clearTimeout(priorTimeout);
    const timeout = window.setTimeout(() => {
      copyTimeoutsRef.current.delete(id);
      setCopyStates((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, 1_500);
    copyTimeoutsRef.current.set(id, timeout);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setSpeakingMessageId("");
  }, [speechSupported]);

  const readMessage = useCallback(
    (message: DisplayMessage) => {
      const readableContent =
        message.role === "assistant"
          ? visibleAssistantText(message.content)
          : message.content;
      if (
        !speechSupported ||
        message.role !== "assistant" ||
        message.pending ||
        message.error ||
        !readableContent.trim()
      ) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(readableContent);
      speechUtteranceRef.current = utterance;
      setSpeakingMessageId(message.id);
      const finish = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setSpeakingMessageId("");
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [speechSupported],
  );

  return {
    copyMessage,
    copyStates,
    readMessage,
    speakingMessageId,
    speechSupported,
    stopSpeaking,
  };
}
