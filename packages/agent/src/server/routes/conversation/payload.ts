import type { ConversationResponseRecord } from "./types";

export function buildResponsePayload(record: ConversationResponseRecord) {
  const createdAt =
    typeof record.createdAt === "number"
      ? record.createdAt
      : Date.parse(record.createdAt);

  return {
    id: record.id,
    object: "response",
    created_at: Number.isFinite(createdAt) ? createdAt : Date.now(),
    previous_response_id: record.previousResponseId,
    output_text: record.outputText,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: record.outputText }],
      },
    ],
    room_id: record.roomId,
  };
}
