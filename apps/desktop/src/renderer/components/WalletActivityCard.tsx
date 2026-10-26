import type { ToolActivity } from "./message-output";

const titles = new Map([
  ["transfer", "Transfer"],
  ["swap", "Swap"],
  ["bridge", "Bridge"],
  ["gov", "Governance"],
]);
const actionNames = new Set([
  "WALLET",
  "WALLET_TRANSFER",
  "WALLET_SWAP",
  "WALLET_BRIDGE",
  "WALLET_GOV",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function label(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,79}$/u.test(value)
    ? value
    : undefined;
}

/** A receipt view only. ElizaOS retains signing, approval and execution ownership. */
export function WalletActivityCard({ activity }: { activity: ToolActivity }) {
  if (activity.status !== "completed" || !actionNames.has(activity.name))
    return null;
  const envelope = record(activity.output);
  if (!envelope || envelope.success === false) return null;
  const receipt = record(envelope.data) ?? envelope;
  const title =
    typeof receipt.subaction === "string"
      ? titles.get(receipt.subaction)
      : undefined;
  const chain = label(receipt.chain);
  if (
    !title ||
    !chain ||
    typeof receipt.dryRun !== "boolean" ||
    !["prepare", "execute"].includes(String(receipt.mode))
  )
    return null;
  if (receipt.status !== "prepared" && receipt.status !== "submitted")
    return null;
  if (
    receipt.status === "submitted" &&
    (receipt.dryRun || receipt.mode !== "execute")
  )
    return null;
  const status = receipt.dryRun
    ? "Simulation · not sent"
    : receipt.status === "prepared"
      ? "Prepared · not sent"
      : "Submitted · awaiting confirmation";
  const amount =
    typeof receipt.amount === "string" &&
    receipt.amount.length <= 80 &&
    /^\d+(?:\.\d+)?$/u.test(receipt.amount)
      ? receipt.amount
      : undefined;
  const fromToken = label(receipt.fromToken);
  const toToken = label(receipt.toToken);
  const transaction = receipt.transactionHash ?? receipt.signature;
  const transactionId =
    typeof transaction === "string" &&
    /^(?:0x[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{64,88})$/u.test(transaction)
      ? transaction
      : undefined;
  return (
    <section
      aria-label={`Wallet ${title.toLowerCase()}`}
      className="my-2 rounded-[var(--radius-xs)] border border-[var(--canvas-border)] bg-[var(--canvas-bg)] p-3 text-[length:var(--text-control)]"
      data-wallet-activity="true"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="font-medium">
          {title} · {chain}
        </strong>
        <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
          {status}
        </span>
      </header>
      {amount || fromToken || toToken ? (
        <p className="mt-1.5 break-all">
          {[amount, fromToken].filter(Boolean).join(" ")}
          {toToken ? ` → ${toToken}` : ""}
        </p>
      ) : null}
      {transactionId ? (
        <dl className="mt-2 text-[length:var(--text-meta)]">
          <dt className="text-[var(--muted)]">Transaction</dt>
          <dd className="m-0 select-text break-all font-mono">
            {transactionId}
          </dd>
        </dl>
      ) : null}
    </section>
  );
}
