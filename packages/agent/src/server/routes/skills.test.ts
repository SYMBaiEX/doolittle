import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSkillRoutes } from "./skills";

function createContext(): AppContext {
  return {
    runtime: {
      getService(name: string) {
        if (name !== "AGENT_SKILLS_SERVICE") return null;
        return {
          getLoadedSkills: () => [],
          getManagedSkills: () => [],
          getCatalog: async () => [],
          search: async (query: string) => [{ slug: query, source: "search" }],
          install: async () => true,
        };
      },
    },
    services: {
      skills: {
        list: () => [{ slug: "voice/tts" }],
      },
      skillsHub: {
        summary: () => ({ total: 1, distribution: { workspace: 1 } }),
        workspace: () => [{ slug: "voice/tts", source: "workspace" }],
        generated: () => [],
        installed: () => [],
        project: () => undefined,
        manifest: (slug: string) => ({ slug, source: "manifest" }),
        exportBundle: async (slug: string) => ({ slug, type: "bundle" }),
      },
      skillSynthesis: {
        describeGeneratedSkill: (slug: string) => `generated:${slug}`,
        listGeneratedSkills: () => [],
      },
    },
  } as unknown as AppContext;
}

describe("handleSkillRoutes", () => {
  it("returns the top-level skills summary", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/skills"),
      new URL("http://localhost/skills"),
    );

    expect(response).not.toBeNull();
    const body = await response?.json();
    expect(body).toHaveProperty("skills");
    expect(body).toHaveProperty("hub");
    expect(body).toHaveProperty("workspace");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("installed");
  });

  it("routes catalog queries through search", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/skills/catalog?query=voice"),
      new URL("http://localhost/skills/catalog?query=voice"),
    );

    const body = await response?.json();
    expect(body).toMatchObject({
      available: true,
      source: "@elizaos/plugin-agent-skills",
      query: "voice",
      results: [{ slug: "voice", source: "search" }],
    });
  });

  it("validates generated detail requests", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/skills/generated/detail"),
      new URL("http://localhost/skills/generated/detail"),
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: "slug is required" });
  });

  it("exports bundles and validates install requests", async () => {
    const context = createContext();
    const bundleResponse = await handleSkillRoutes(
      context,
      new Request("http://localhost/skills/export", {
        method: "POST",
        body: JSON.stringify({ bundle: true, slug: "voice" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/export"),
    );
    const installError = await handleSkillRoutes(
      context,
      new Request("http://localhost/skills/install", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/install"),
    );

    expect(await bundleResponse?.json()).toEqual({
      bundle: { slug: "voice", type: "bundle" },
    });
    expect(installError?.status).toBe(400);
    expect(await installError?.json()).toEqual({ error: "slug is required" });
  });

  it("routes installs through the official service", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/skills/install", {
        method: "POST",
        body: JSON.stringify({ slug: "release-checklist" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/install"),
    );

    expect(await response?.json()).toEqual({
      install: {
        available: true,
        source: "@elizaos/plugin-agent-skills",
        slug: "release-checklist",
        installed: true,
      },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/not-skills"),
      new URL("http://localhost/not-skills"),
    );

    expect(response).toBeNull();
  });
});
