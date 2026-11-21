import type { BotSummary } from "@doolittle/contracts/bots";
import { ChatNotice } from "../chat/ChatNotice";

type NoticeBot = Pick<BotSummary, "id" | "name" | "state" | "error">;

/** A draft survives while its selected bot is not yet available to chat. */
export function BotRuntimeNotice({
  bot,
  onStart,
}: {
  bot: NoticeBot;
  onStart?: (botId: string) => Promise<void>;
}) {
  const stopped = bot.state === "stopped";
  const failed = bot.state === "error";
  const message = stopped
    ? `${bot.name} is ready to start.`
    : failed
      ? `${bot.name} could not start.`
      : bot.state === "starting"
        ? `Starting ${bot.name}…`
        : `${bot.name} is unavailable.`;

  return (
    <ChatNotice
      action={
        (stopped || failed) && onStart
          ? {
              label: failed ? "Retry start" : "Start now",
              invoke: () => void onStart(bot.id),
            }
          : undefined
      }
      tone={failed ? "error" : "neutral"}
    >
      {message}
      {failed && bot.error ? <small>{bot.error}</small> : null}
    </ChatNotice>
  );
}
