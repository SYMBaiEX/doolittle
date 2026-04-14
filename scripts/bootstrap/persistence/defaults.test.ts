import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TUI_THEME } from "../../../packages/agent/src/runtime/theme-catalog";
import {
  createDefaultGatewayConfig,
  createDefaultSettings,
  loadBootstrapGatewayConfig,
  loadBootstrapSettings,
} from "./defaults";

describe("bootstrap persistence defaults", () => {
  it("creates stable default settings and gateway config", () => {
    const settings = createDefaultSettings(DEFAULT_TUI_THEME);
    const gateway = createDefaultGatewayConfig(true, "pair");

    expect(settings.model.model).toBe("gpt-5.4");
    expect(settings.agent.maxIterations).toBeGreaterThan(0);
    expect(gateway.allowAllUsers).toBe(true);
    expect(gateway.platforms.api.enabled).toBe(true);
    expect(gateway.platforms.telegram.pairingMode).toBe("pair");
  });

  it("loads and merges persisted settings and gateway files", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-bootstrap-persistence-"),
    );
    const settingsPath = join(root, "settings.json");
    const gatewayPath = join(root, "gateway.json");

    try {
      writeFileSync(
        settingsPath,
        JSON.stringify(
          {
            model: { model: "gpt-5.4-mini" },
            execution: { backend: "ssh", sshHost: "host" },
          },
          null,
          2,
        ),
        "utf8",
      );
      writeFileSync(
        gatewayPath,
        JSON.stringify(
          {
            allowAllUsers: false,
            platforms: {
              telegram: {
                enabled: true,
                allowedUserIds: [],
                pairingMode: "pair",
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const settings = loadBootstrapSettings(settingsPath, DEFAULT_TUI_THEME);
      const gateway = loadBootstrapGatewayConfig(gatewayPath, true, "allow");

      expect(settings.model.model).toBe("gpt-5.4-mini");
      expect(settings.execution.backend).toBe("ssh");
      expect(settings.ui.theme).toBe(DEFAULT_TUI_THEME);
      expect(gateway.allowAllUsers).toBe(false);
      expect(gateway.platforms.api.enabled).toBe(true);
      expect(gateway.platforms.telegram.enabled).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
