import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSkillRoutes } from "./skills";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      skills: {
        list: () => [{ slug: "voice/tts" }],
      },
      skillsHub: {
        summary: () => ({ total: 1, distribution: { workspace: 1 } }),
        workspace: () => [{ slug: "voice/tts", source: "workspace" }],
        generated: () => [],
        installed: () => [],
        searchCatalog: async (query: string) => [
          { slug: query, source: "search" },
        ],
        catalogEntry: async (slug: string) => ({ slug, source: "catalog" }),
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
  });

  it("routes catalog queries through search", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/skills/catalog?query=voice"),
      new URL("http://localhost/skills/catalog?query=voice"),
    );

    const body = await response?.json();
    expect(Array.isArray(body)).toBe(true);
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

  it("returns null for unrelated routes", async () => {
    const response = await handleSkillRoutes(
      createContext(),
      new Request("http://localhost/not-skills"),
      new URL("http://localhost/not-skills"),
    );

    expect(response).toBeNull();
  });
});
