import type { ConversationResponseRecord } from "./types";

export function buildResponsePayload(record: ConversationResponseRecord) {
  const parsedCreatedAt =
    typeof record.createdAt === "number"
      ? record.createdAt
      : Date.parse(record.createdAt);
  const createdAt =
    Number.isFinite(parsedCreatedAt) && parsedCreatedAt > 100_000_000_000
      ? Math.floor(parsedCreatedAt / 1_000)
      : parsedCreatedAt;

  return {
    id: record.id,
    object: "response",
    created_at: Number.isFinite(createdAt)
      ? createdAt
      : Math.floor(Date.now() / 1_000),
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
