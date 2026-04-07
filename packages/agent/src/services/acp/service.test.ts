import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvConfig, ToolDefinition } from "@/types";
import { AcpService } from "./service";

describe("AcpService", () => {
  it("publishes a registry and exposes ACP-style tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-acp-"));
    const fixturePath = join(
      import.meta.dir,
      "..",
      "..",
      "testing",
      "mock-mcp.ts",
    );
    const config = {
      agentName: "Doolittle",
      dataDir: root,
      acpServerCommand: `bun run ${fixturePath}`,
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
    const service = new AcpService(
      config,
      () => tools,
      sessionSummary,
      listSessions,
    );

    try {
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
      expect(service.describeTool("workspace.read")).toContain("ACP TOOL");

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
      expect(result.ok).toBe(true);
      expect(result.output).toContain("5");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
