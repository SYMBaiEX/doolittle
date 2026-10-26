import { z } from "zod";

const label = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ._:-]{0,79}$/u);
const receiptSchema = z
  .object({
    id: z.string().uuid().optional(),
    subaction: z.enum(["transfer", "swap", "bridge", "gov"]),
    status: z.enum(["prepared", "submitted"]),
    chain: label,
    mode: z.enum(["prepare", "execute"]),
    dryRun: z.boolean(),
    amount: z
      .string()
      .max(80)
      .regex(/^\d+(?:\.\d+)?$/u)
      .optional(),
    fromToken: label.optional(),
    toToken: label.optional(),
    transactionId: z
      .string()
      .regex(/^(?:0x[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{64,88})$/u)
      .optional(),
  })
  .refine(
    (value) =>
      value.status !== "submitted" ||
      (!value.dryRun && value.mode === "execute"),
  );

/** Public client projection of an SDK wallet execution, never signing material. */
export type WalletActivityReceipt = z.infer<typeof receiptSchema>;

export function parseWalletActivityReceipt(
  value: unknown,
): WalletActivityReceipt | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  const result = receiptSchema.safeParse({
    ...input,
    transactionId:
      input.transactionId ?? input.transactionHash ?? input.signature,
  });
  return result.success ? result.data : undefined;
}

const walletActions = new Set([
  "WALLET",
  "WALLET_TRANSFER",
  "WALLET_SWAP",
  "WALLET_BRIDGE",
  "WALLET_GOV",
]);
export function walletActivityFromAction(
  action: string | undefined,
  value: unknown,
): WalletActivityReceipt | undefined {
  if (
    !action ||
    !walletActions.has(action) ||
    !value ||
    typeof value !== "object"
  )
    return undefined;
  const result = value as { success?: unknown; data?: unknown };
  return result.success === true
    ? parseWalletActivityReceipt(result.data)
    : undefined;
}
