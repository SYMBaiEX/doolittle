import type { IncomingPlatformMessage } from "@/types/gateway";
import { normalizeMetadata } from "../helpers";

export function parseMattermostMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    post?: {
      id?: string;
      message?: string;
      channel_id?: string;
      root_id?: string;
      user_id?: string;
      props?: Record<string, unknown>;
      file_ids?: string[];
    };
    sender_name?: string;
    channel_name?: string;
    team_domain?: string;
  };

  if (
    !payload.post?.message ||
    !payload.post.channel_id ||
    !payload.post.user_id
  ) {
    return null;
  }

  return {
    platform: "mattermost",
    userId: payload.post.user_id,
    roomId: payload.post.channel_id,
    text: payload.post.message,
    threadId: payload.post.root_id,
    replyToMessageId: payload.post.root_id,
    messageId: payload.post.id,
    metadata: normalizeMetadata([
      ["authorName", payload.sender_name],
      ["channelName", payload.channel_name],
      ["teamDomain", payload.team_domain],
      ["fileIds", payload.post.file_ids?.join("|")],
      ["propKeys", Object.keys(payload.post.props ?? {}).join("|")],
    ]),
  };
}
