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
    ? `${bot.name} is stopped. Send a message to start its runtime with approved access. Your draft is retained.`
    : failed
      ? `${bot.name} could not start. ${bot.error ? `${bot.error} ` : ""}Your draft is retained; retry when its runtime is available.`
      : bot.state === "starting"
        ? `${bot.name} is starting in the shared engine. Your draft is retained until it is ready.`
        : `${bot.name} is unavailable. Your draft is retained.`;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--text-soft)]"
      role={failed ? "alert" : "status"}
    >
      <span>{message}</span>
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
