import type { BotSummary } from "@doolittle/contracts/bots";

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
    <div className="chat-bot-start-notice" role={failed ? "alert" : "status"}>
      <span>
        {message}
        {failed && bot.error ? <small>{bot.error}</small> : null}
      </span>
      {(stopped || failed) && onStart ? (
        <button
          className="secondary-button shrink-0"
          onClick={() => void onStart(bot.id)}
          type="button"
        >
          {failed ? "Retry start" : "Start now"}
        </button>
      ) : null}
    </div>
  );
}
