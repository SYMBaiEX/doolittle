import { describe, expect, test } from "bun:test";
import type { AgentSdkService } from "./agent-sdk-service";
import { SkillsService } from "./skills-service";

describe("SkillsService", () => {
  test("delegates catalog and search lookups to the shared agent sdk service", async () => {
    const calls: Array<
      | { method: "skillCatalog"; force: boolean; limit: number }
      | { method: "searchSkillCatalog"; query: string; limit: number }
    > = [];

    const agentSdk = {
      async skillCatalog(force = false, limit = 20) {
        calls.push({ method: "skillCatalog", force, limit });
        return {
          available: true,
          total: 1,
          trending: [],
        };
      },
      async searchSkillCatalog(query: string, limit = 15) {
        calls.push({ method: "searchSkillCatalog", query, limit });
        return {
          available: true,
          query,
          results: [],
        };
      },
    } as unknown as AgentSdkService;

    const service = new SkillsService("/tmp", agentSdk);

    await service.catalog(7);
    await service.searchCatalog("operator", 3);

    expect(calls).toEqual([
      { method: "skillCatalog", force: false, limit: 7 },
      { method: "searchSkillCatalog", query: "operator", limit: 3 },
    ]);
  });

  test("summarizes workspace breadth by root family", async () => {
    const agentSdk = {
      async skillCatalog() {
        return {
          available: true,
          total: 0,
          trending: [],
        };
      },
      async searchSkillCatalog() {
        return {
          available: true,
          query: "",
          results: [],
        };
      },
    } as unknown as AgentSdkService;

    const service = new SkillsService(
      "/Users/symbiex/dev/elizaos/eliza-agent/eliza-agent/packages/skills",
      agentSdk,
    );

    const summary = service.summary();

    expect(summary.total).toBeGreaterThan(10);
    expect(summary.curated).toBeGreaterThan(10);
    expect(summary.generated).toBeGreaterThan(0);
    expect(summary.roots.map((entry) => entry.name)).toContain("platform");
    expect(summary.roots.map((entry) => entry.name)).toContain("research");
    expect(summary.roots.map((entry) => entry.name)).toContain("generated");
  });
});
