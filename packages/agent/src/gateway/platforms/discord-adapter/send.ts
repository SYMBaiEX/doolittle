import { openAsBlob } from "node:fs";
import type { OutboundPlatformMessage } from "@/types/gateway";
import { fetchPlatform, readPlatformResponseText } from "../platform-http";

const DISCORD_API_ROOT = "https://discord.com/api/v10";

interface DiscordRequestResult {
  response: Response;
  bodyText: string;
}

export async function sendDiscordMessage(
  botToken: string,
  message: OutboundPlatformMessage,
  payload: Record<string, unknown>,
  voicePath?: string,
): Promise<DiscordRequestResult> {
  const response = voicePath
    ? await sendDiscordVoiceMessage(
        botToken,
        message.roomId,
        payload,
        voicePath,
      )
    : await fetchPlatform(
        `${DISCORD_API_ROOT}/channels/${message.roomId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

  return {
    response,
    bodyText: response.ok
      ? await response.text()
      : await readPlatformResponseText(response),
  };
}

export async function editDiscordMessage(
  botToken: string,
  channelId: string,
  messageId: string,
  payload: Record<string, string>,
): Promise<DiscordRequestResult> {
  const response = await fetchPlatform(
    `${DISCORD_API_ROOT}/channels/${channelId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return {
    response,
    bodyText: response.ok
      ? await response.text()
      : await readPlatformResponseText(response),
  };
}

async function sendDiscordVoiceMessage(
  botToken: string,
  roomId: string,
  payload: Record<string, unknown>,
  voicePath: string,
): Promise<Response> {
  const form = new FormData();
  form.set("payload_json", JSON.stringify(payload));
  form.set(
    "files[0]",
    await openAsBlob(voicePath),
    voicePath.split("/").at(-1),
  );

  return fetchPlatform(`${DISCORD_API_ROOT}/channels/${roomId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    body: form,
  });
}
