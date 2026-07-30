import { AgentSkillsService } from "@elizaos/plugin-agent-skills";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime";
import { AGENT_SKILLS_SERVICE } from "../runtime-contracts";
import {
  getEffectiveSkillHubCatalog,
  installEffectiveSkill,
  syncEffectiveSkillCatalog,
} from ".";

function services(): AppServices {
  return {
    skills: {
      get: () => undefined,
    },
    skillsHub: {
      catalog: async () => [],
      manifest: () => undefined,
    },
  } as unknown as AppServices;
}

describe("official Agent Skills bridge", () => {
  it("uses the official runtime service key", () => {
    expect(AGENT_SKILLS_SERVICE).toBe(AgentSkillsService.serviceType);
  });

  it("projects the official service catalog into the product catalog shape", async () => {
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
      getEffectiveSkillHubCatalog(runtime, services(), true, 10),
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
