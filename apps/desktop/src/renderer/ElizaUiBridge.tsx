import { createLogger } from "@elizaos/logger";
import { publishAppValue, seedAppValue } from "@elizaos/ui/state/app-store";
import type { AppContextValue } from "@elizaos/ui/state/internal";
import { type ReactNode, useEffect, useMemo, useState } from "react";

const rendererLogger = createLogger({
  namespace: "doolittle.desktop.renderer.i18n",
  __forceType: "browser",
});

export function elizaEnglishFallbackTranslator(
  key: string,
  values?: Record<string, unknown>,
): string {
  const fallback = values?.defaultValue;
  const template =
    typeof fallback === "string" && fallback.trim() ? fallback : key;
  const variables: Record<string, unknown> = {
    appName: "Doolittle",
    ...values,
  };
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => {
    const value = variables[name];
    return value == null ? "" : String(value);
  });
}

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
  const [translate, setTranslate] = useState<AppContextValue["t"]>(
    () => elizaEnglishFallbackTranslator,
  );
  useEffect(() => {
    let cancelled = false;
    void import("@elizaos/ui/i18n")
      .then(({ createTranslator }) => {
        if (!cancelled) {
          setTranslate(() => createTranslator("en", { appName: "Doolittle" }));
        }
      })
      .catch(() => {
        rendererLogger.warn(
          { context: { component: "ElizaUiBridge" } },
          "Eliza UI translations unavailable; using English fallbacks.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () =>
      ({
        t: translate,
        uiLanguage: "en",
      }) as AppContextValue,
    [translate],
  );

  seedAppValue(value);
  useEffect(() => publishAppValue(value), [value]);

  return children;
}
