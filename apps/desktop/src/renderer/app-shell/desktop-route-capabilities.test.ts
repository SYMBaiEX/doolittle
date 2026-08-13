import { describe, expect, it } from "vitest";
import { type View, views } from "../desktop-navigation";
import {
  canRenderDesktopRoute,
  desktopRouteCapabilities,
} from "./desktop-route-capabilities";

describe("desktop route capabilities", () => {
  it.each(["ready", "degraded"] as const)(
    "classifies every %s route without disabling module preload",
    (phase) => {
      for (const view of views) {
        const capabilities = desktopRouteCapabilities(view, phase);
        expect(capabilities.modulePreload).toBe(true);
        expect(capabilities.apiRead).toBe(
          phase === "ready" ||
            (phase === "degraded" &&
              ["runtime", "compatibility"].includes(view)),
        );
        expect(capabilities.writes).toBe(phase === "ready");
        expect(capabilities.diagnosticsReadOnly).toBe(
          phase === "degraded" && ["runtime", "compatibility"].includes(view),
        );
      }
    },
  );

  it.each(["booting", "stopped"] as const)(
    "keeps %s routes module-loadable but API-inactive",
    (phase) => {
      for (const view of views) {
        const capabilities = desktopRouteCapabilities(view, phase);
        expect(capabilities.modulePreload).toBe(true);
        expect(capabilities.apiRead).toBe(false);
        expect(capabilities.writes).toBe(false);
        expect(capabilities.diagnosticsReadOnly).toBe(false);
        expect(canRenderDesktopRoute(view, phase)).toBe(false);
      }
    },
  );

  it.each(["ready", "degraded"] as const)(
    "keeps diagnostic routes renderable in %s",
    (phase) => {
      for (const view of ["runtime", "compatibility"] as View[]) {
        const capabilities = desktopRouteCapabilities(view, phase);
        expect(capabilities.modulePreload).toBe(true);
        expect(capabilities.diagnosticsReadOnly).toBe(phase === "degraded");
        expect(canRenderDesktopRoute(view, phase)).toBe(true);
      }
    },
  );

  it("allows API reads and writes only when ready", () => {
    for (const phase of ["ready", "degraded"] as const) {
      const capabilities = desktopRouteCapabilities("settings", phase);
      expect(capabilities.apiRead).toBe(phase === "ready");
      expect(capabilities.writes).toBe(phase === "ready");
      expect(capabilities.diagnosticsReadOnly).toBe(false);
    }
  });
});
