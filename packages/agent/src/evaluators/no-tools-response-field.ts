import { ChannelType, type ResponseHandlerFieldEvaluator } from "@elizaos/core";
import { hasExplicitNoToolsIntent } from "@/runtime/no-tools-intent";
import { messageText } from "@/utils/eliza-compat";

const DIRECT_TEXT_CHANNELS = new Set<ChannelType>([
  ChannelType.DM,
  ChannelType.API,
  ChannelType.SELF,
]);

/**
 * Ask for the full answer in the SDK's existing Stage-1 call. Its normal
 * planning-path replyText can be only an acknowledgement, so switching routes
 * after generation isn't enough. This native field keeps generation and
 * tool-free routing together without another provider invocation.
 */
export const noToolsResponseField: ResponseHandlerFieldEvaluator<string> = {
  name: "doolittleToolFreeReply",
  description:
    "For this explicit no-tools request, write the COMPLETE final answer here, not an acknowledgement or promise to act. Satisfy all current user constraints using only visible context, distinguish a proposed plan from performed work, and explicitly state any requested action was not performed. Set contexts=[simple], candidateActionNames=[], and replyText to this same full answer; otherwise leave this field empty.",
  priority: 30,
  schema: {
    type: "string",
    description: "Complete tool-free answer, or empty when not applicable.",
  },
  shouldRun: ({ message }) =>
    DIRECT_TEXT_CHANNELS.has(message.content.channelType as ChannelType) &&
    hasExplicitNoToolsIntent(messageText(message)),
  parse: (value) => (typeof value === "string" ? value.trim() : ""),
  handle: ({ value, parsed, turnSignal }) => {
    turnSignal.throwIfAborted();
    // Do not override STOP/IGNORE, or the SDK's voice/group turn-taking gates.
    if (parsed.shouldRespond !== "RESPOND") return undefined;
    return {
      mutateResult: (result) => {
        result.contexts = ["simple"];
        result.candidateActionNames = [];
        result.replyText =
          value ||
          "I did not use tools or perform the requested action, but could not produce a complete answer.";
      },
      preempt: {
        mode: "direct-reply",
        reason: "explicit tool-free request uses the complete Stage-1 answer",
      },
    };
  },
};
