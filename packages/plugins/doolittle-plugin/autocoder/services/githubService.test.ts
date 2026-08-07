import { DOOLITTLE_GITHUB_PLANNING_SERVICE } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import { createGitHubService } from "./githubService";

describe("GitHubService", () => {
  it("returns explicit non-executing repository plans", async () => {
    const GitHubService = createGitHubService();
    const service = await GitHubService.start();

    expect(GitHubService.serviceType).toBe(DOOLITTLE_GITHUB_PLANNING_SERVICE);

    await expect(service.createRepository("demo", false)).resolves.toEqual(
      expect.objectContaining({
        experimental: true,
        executed: false,
        name: "demo",
        private: false,
        status: "planned",
      }),
    );
    await expect(service.deleteRepository("demo")).resolves.toEqual(
      expect.objectContaining({
        experimental: true,
        executed: false,
        name: "demo",
        status: "planned",
      }),
    );
  });
});
