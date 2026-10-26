import { parseWalletActivityReceipt } from "@doolittle/contracts/wallet-activity";
import type { RunSnapshot } from "./types";

export const nowIso = (): string => new Date().toISOString();

export const cloneRun = (run: RunSnapshot): RunSnapshot => ({
  ...run,
  ...(Array.isArray(run.walletActivities)
    ? {
        walletActivities: run.walletActivities
          .flatMap((value) => {
            const receipt = parseWalletActivityReceipt(value);
            return receipt ? [receipt] : [];
          })
          .slice(-32),
      }
    : { walletActivities: undefined }),
  localMutations: run.localMutations.map((mutation) => ({ ...mutation })),
});
