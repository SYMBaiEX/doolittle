import type { WalletActivityReceipt } from "@doolittle/contracts/wallet-activity";

const titles = {
  transfer: "Transfer",
  swap: "Swap",
  bridge: "Bridge",
  gov: "Governance",
} as const;
/** ElizaOS owns signing, approval and execution; this only renders its receipt. */
export function WalletActivityCard({
  receipt,
}: {
  receipt: WalletActivityReceipt;
}) {
  const title = titles[receipt.subaction];
  const chain = receipt.chain;
  const status = receipt.dryRun
    ? "Simulation · not sent"
    : receipt.status === "prepared"
      ? "Prepared · not sent"
      : "Submitted · awaiting confirmation";
  const { amount, fromToken, toToken, transactionId } = receipt;
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
