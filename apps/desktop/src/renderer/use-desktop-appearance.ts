import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import { useEffect, useState } from "react";
import type { BackendState, ThemeResponse } from "../shared/contracts";
import {
  announceAppearanceApplied,
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopTheme,
  applyThemeManifest,
  type DesktopAppearance,
  type DesktopDensity,
  loadAppearancePreference,
  loadDensityPreference,
  loadDesktopThemeSource,
  loadStoredThemeManifest,
  parseDesktopThemeProfile,
  resolveAppearance,
  subscribeToDesktopThemeChanges,
} from "./desktop-theme";
import { desktopRequest } from "./lib";

/** Keep appearance preferences and runtime theme synchronization in one lifecycle. */
export function useDesktopAppearance(backendPhase: BackendState["phase"]) {
  const [appearance, setAppearance] = useState<DesktopAppearance>(
    loadAppearancePreference,
  );
  const [density, setDensity] = useState<DesktopDensity>(loadDensityPreference);
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedAppearance = resolveAppearance(appearance, systemPrefersDark);

  useEffect(() => {
    applyDesktopAppearance(appearance, systemPrefersDark);
    announceAppearanceApplied(resolveAppearance(appearance, systemPrefersDark));
  }, [appearance, systemPrefersDark]);

  useEffect(() => {
    applyDesktopDensity(density);
  }, [density]);

  useEffect(() => {
    applyThemeManifest(
      loadStoredThemeManifest(),
      loadDesktopThemeSource() ?? "builtin",
    );
  }, []);

  useEffect(() => {
    if (backendPhase !== "ready") return;
    let disposed = false;
    void desktopRequest<ThemeResponse>("/theme")
      .then((response) => {
        if (disposed) return;
        if (["imported", "builtin"].includes(loadDesktopThemeSource() ?? ""))
          return;
        const profile = parseDesktopThemeProfile(response.profile);
        if (profile) applyDesktopTheme(profile, "runtime");
      })
      .catch(() => {
        // The cached profile preserves the visual theme while the runtime recovers.
      });
    return () => {
      disposed = true;
    };
  }, [backendPhase]);

  useEffect(() => {
    return subscribeToDesktopThemeChanges({
      onAppearance: setAppearance,
      onDensity: setDensity,
      onTheme: applyDesktopTheme,
    });
  }, []);

  return { resolvedAppearance, setAppearance };
}
