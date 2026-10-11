import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { EnvConfig, ToolDefinition } from "@/types";
import { AcpService } from "./service";

describe("AcpService", () => {
  it("does not expose protocol exceptions through results or telemetry", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-acp-errors-"));
    const service = new AcpService(
      { dataDir: root } as EnvConfig,
      () => ({
        totalSessions: 0,
        recentSessionIds: [],
      }),
      () => [],
    );
    const secret = "token=abc123 /private/operator/credentials.json";
    try {
      vi.spyOn(service, "initializeProtocol").mockRejectedValue(
        new Error(secret),
      );
      vi.spyOn(service, "newProtocolSession").mockRejectedValue(secret);
      expect(await service.probe()).toEqual({
        ok: false,
        detail: "ACP probe failed.",
      });
      expect(service.status().lastError).toBe("ACP probe failed.");
      expect(await service.invoke("hello")).toEqual({
        ok: false,
        output: "ACP invocation failed.",
      });
      expect(service.status().lastError).toBe("ACP invocation failed.");
      expect(JSON.stringify(service.status())).not.toContain(secret);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("publishes a registry and exposes ACP-style tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-acp-"));
    const fixturePath = fileURLToPath(
      new URL("../../testing/mock-mcp.ts", import.meta.url),
    );
    const config = {
      agentName: "Doolittle",
      dataDir: root,
      acpServerCommand: `nub ${fixturePath}`,
      acpTimeoutMs: 5_000,
    } as EnvConfig;
    const tools: ToolDefinition[] = [
      {
        id: "workspace.read",
        name: "Workspace Read",
        category: "workspace",
        description: "Read a file from the workspace.",
        enabled: true,
        transport: "service",
      },
      {
        id: "terminal.run",
        name: "Terminal Run",
        category: "terminal",
        description: "Execute a terminal command.",
        enabled: true,
        transport: "service",
      },
    ];
    const sessionSummary = () => ({
      totalSessions: 3,
      recentSessionIds: ["session-a", "session-b", "session-c"],
    });
    const listSessions = () => [
      {
        sessionId: "session-a",
        title: "Primary Session",
        messageCount: 3,
        participants: ["user", "assistant"] as Array<
          "user" | "assistant" | "system"
        >,
        preview: [],
      },
      {
        sessionId: "session-b",
        title: "Editor Session",
        messageCount: 2,
        participants: ["user"] as Array<"user" | "assistant" | "system">,
        preview: [],
      },
    ];
    const service = new AcpService(config, sessionSummary, listSessions);

    try {
      expect(service.tools()).toEqual([]);
      expect(service.status().toolSource).toBe("unbound");
      service.bindRuntimeTools(() => tools);

      expect(service.packageMetadata().name).toBe("doolittle");
      expect(service.editorSummary().registryPath).toContain("agent.json");
      expect(service.sessionSummary().titledSessions).toBe(2);

      const published = service.publishRegistry();
      expect(published.path).toContain("agent.json");
      expect(readFileSync(published.path, "utf8")).toContain("doolittle");
      expect(service.tools().some((tool) => tool.kind === "read")).toBe(true);
      expect(service.tools().some((tool) => tool.kind === "execute")).toBe(
        true,
      );
      expect(service.tools().every((tool) => tool.source === "doolittle")).toBe(
        true,
      );
      expect(service.status()).toMatchObject({
        toolCount: 2,
        toolSource: "eliza-runtime",
      });
      expect(service.describeTool("workspace.read")).toContain("ACP TOOL");

      tools.push({
        id: "WEB_SEARCH",
        name: "Web Search",
        category: "runtime",
        description: "Search current information on the web.",
        enabled: true,
        transport: "native",
      });
      expect(service.tools().map((tool) => tool.name)).toContain("WEB_SEARCH");
      expect(service.status().toolCount).toBe(3);

      const probe = await service.probe();
      expect(probe.ok).toBe(true);

      const exported = service.exportBundle("zed");
      expect(exported.path).toContain("acp-export-zed");

      const imported = service.importBundle(
        JSON.stringify({
          label: "zed",
          package: { name: "doolittle" },
          tools: [{ name: "workspace.read" }],
        }),
      );
      expect(imported.packageName).toBe("doolittle");
      expect(imported.toolCount).toBe(1);

      const result = await service.invokeTool("sum", { a: 2, b: 3 });
      expect(result.ok).toBe(false);
      expect(result.output).toContain("does not define direct tool invocation");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
