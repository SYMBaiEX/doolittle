import { createTranslator } from "@elizaos/ui/i18n";
import { publishAppValue, seedAppValue } from "@elizaos/ui/state/app-store";
import type { AppContextValue } from "@elizaos/ui/state/internal";
import { type ReactNode, useEffect, useMemo } from "react";

/**
 * Seeds the narrow selector contract used by provider-free Eliza UI islands.
 *
 * The full Eliza AppProvider owns the complete Electrobun/browser application
 * lifecycle. Doolittle owns an Electron lifecycle and IPC transport, so mounting
 * that provider here would start a second application. Official account
 * components only select `t`; this bridge supplies that supported migration seam
 * without fabricating the rest of the Eliza application state.
 */
export function ElizaUiBridge({ children }: { children: ReactNode }) {
  const value = useMemo(
    () =>
      ({
        t: createTranslator("en", { appName: "Doolittle" }),
        uiLanguage: "en",
      }) as AppContextValue,
    [],
  );

  seedAppValue(value);
  useEffect(() => publishAppValue(value), [value]);

  return children;
}
