import { AgentSkillsService } from "@elizaos/plugin-agent-skills";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime";
import { AGENT_SKILLS_SERVICE } from "../runtime-contracts";
import {
  getEffectiveSkillHubCatalog,
  installEffectiveSkill,
  searchEffectiveSkillHubCatalog,
  syncEffectiveSkillCatalog,
} from ".";

function services(): AppServices {
  return {
    skills: {
      get: () => undefined,
    },
    skillsHub: {
      manifest: () => undefined,
      project: vi.fn(),
    },
  } as unknown as AppServices;
}

describe("official Agent Skills bridge", () => {
  it.each([
    new Error("fixture-secret\n    at transport (/private/file:1)"),
    "fixture-secret\n    at transport (/private/file:1)",
  ])("does not expose official service exception details", async (failure) => {
    const reject = vi.fn(async () => {
      throw failure;
    });
    const runtime = {
      getService(name: string) {
        return name === "AGENT_SKILLS_SERVICE"
          ? { search: reject, syncCatalog: reject, install: reject }
          : null;
      },
    } as unknown as RuntimeLike;

    const search = await searchEffectiveSkillHubCatalog(
      runtime,
      services(),
      "browser",
    );
    const sync = await syncEffectiveSkillCatalog(runtime);
    const install = await installEffectiveSkill(runtime, "browser");
    expect(search.error).toBe("Skills catalog search failed.");
    expect(sync.error).toBe("Skills catalog sync failed.");
    expect(install.error).toBe("Skill installation failed.");
    expect(JSON.stringify([search, sync, install])).not.toContain(
      "fixture-secret",
    );
    expect(JSON.stringify([search, sync, install])).not.toContain(
      "/private/file",
    );
  });

  it("uses the official runtime service key", () => {
    expect(AGENT_SKILLS_SERVICE).toBe(AgentSkillsService.serviceType);
  });

  it("projects the official service catalog into the product catalog shape", async () => {
    const appServices = services();
    const getCatalog = vi.fn(async () => [
      {
        slug: "release-checklist",
        displayName: "Release Checklist",
        summary: "Ship safely.",
        version: "1.0.0",
        tags: { domain: "release" },
        stats: { downloads: 42, stars: 7 },
        updatedAt: Date.now(),
      },
      {
        slug: "incident-triage",
        displayName: "Incident Triage",
        summary: "Restore service safely.",
        version: "1.0.0",
        tags: { domain: "operations" },
        stats: { downloads: 21, stars: 3 },
        updatedAt: Date.now(),
      },
    ]);
    const runtime = {
      getService(name: string) {
        return name === "AGENT_SKILLS_SERVICE"
          ? {
              getCatalog,
              getManagedSkills: () => [],
            }
          : null;
      },
    } as unknown as RuntimeLike;

    await expect(
      getEffectiveSkillHubCatalog(runtime, appServices, true, 1),
    ).resolves.toEqual([
      expect.objectContaining({
        slug: "release-checklist",
        displayName: "Release Checklist",
        installsAllTime: 42,
        stars: 7,
        source: "catalog",
      }),
    ]);
    expect(getCatalog).toHaveBeenCalledWith({ forceRefresh: true });
    expect(appServices.skillsHub.project).toHaveBeenCalledWith({
      catalog: [
        expect.objectContaining({
          slug: "release-checklist",
          source: "catalog",
        }),
        expect.objectContaining({
          slug: "incident-triage",
          source: "catalog",
        }),
      ],
      installed: [],
    });
  });

  it("degrades a stalled official catalog read without replacing the last projection", async () => {
    vi.useFakeTimers();
    try {
      const appServices = services();
      const runtime = {
        getService(name: string) {
          return name === "AGENT_SKILLS_SERVICE"
            ? {
                getCatalog: () => new Promise(() => undefined),
                getManagedSkills: () => [],
              }
            : null;
        },
      } as unknown as RuntimeLike;

      const result = getEffectiveSkillHubCatalog(
        runtime,
        appServices,
        false,
        10,
      );
      await vi.advanceTimersByTimeAsync(3_000);

      await expect(result).resolves.toEqual([]);
      expect(appServices.skillsHub.project).toHaveBeenCalledWith({
        installed: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails fast when the bootstrap-critical official service is unavailable", async () => {
    const runtime = {} as RuntimeLike;

    await expect(
      installEffectiveSkill(runtime, "release-checklist"),
    ).rejects.toMatchObject({
      code: "AGENT_SKILLS_SERVICE_UNAVAILABLE",
    });
    await expect(syncEffectiveSkillCatalog(runtime)).rejects.toMatchObject({
      code: "AGENT_SKILLS_SERVICE_UNAVAILABLE",
    });
  });

  it("delegates installation to the official service", async () => {
    const install = vi.fn(async () => true);
    const runtime = {
      getService(name: string) {
        return name === "AGENT_SKILLS_SERVICE" ? { install } : null;
      },
    } as unknown as RuntimeLike;

    await expect(
      installEffectiveSkill(runtime, "release-checklist"),
    ).resolves.toMatchObject({
      available: true,
      installed: true,
      slug: "release-checklist",
    });
    expect(install).toHaveBeenCalledWith("release-checklist");
  });
});
