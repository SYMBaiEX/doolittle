import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "../../chat";
import { handleSkillCommand } from ".";

function skillsHubFixture() {
  return {
    exportBundle: async () => ({ bundle: true }),
    generated: () => [],
    installedManifests: () => [],
    manifest: () => null,
    project: () => undefined,
    summary: () => ({ distribution: {} }),
    workspace: () => [],
  };
}

describe("skills command router", () => {
  it("renders skills inventory through the extracted router", async () => {
    const result = await handleSkillCommand("/skills", {
      runtime: {
        getService: (name: string) =>
          name === "AGENT_SKILLS_SERVICE"
            ? {
                getLoadedSkills: () => [],
                getManagedSkills: () => [],
              }
            : null,
      },
      services: {
        skills: {
          list: () => [],
          get: () => null,
        },
        skillsHub: skillsHubFixture(),
      },
    } as unknown as AgentExecutionContext);

    expect(result).toContain("available=");
  });

  it("returns usage guidance for missing catalog and install inputs", async () => {
    const context = {
      runtime: {},
      services: {
        skills: {
          list: () => [],
          get: () => null,
        },
        skillsHub: skillsHubFixture(),
      },
    } as unknown as AgentExecutionContext;

    const search = await handleSkillCommand("/skills catalog search ", context);
    const marketplace = await handleSkillCommand(
      "/skills marketplace search",
      context,
    );
    const install = await handleSkillCommand("/skills install ", context);

    expect(search).toBe("Usage: /skills catalog search <query>");
    expect(marketplace).toBe("Usage: /skills marketplace search <query>");
    expect(install).toBe("Usage: /skills install <catalog-slug>");
  });

  it("fails fast when official lifecycle operations bypass bootstrap", async () => {
    const context = {
      runtime: {},
      services: {
        skills: {
          list: () => [],
          get: () => null,
        },
        skillsHub: skillsHubFixture(),
      },
    } as unknown as AgentExecutionContext;

    await expect(
      handleSkillCommand("/skills sync", context),
    ).rejects.toMatchObject({
      code: "AGENT_SKILLS_SERVICE_UNAVAILABLE",
    });
    await expect(
      handleSkillCommand("/skills install release-checklist", context),
    ).rejects.toMatchObject({
      code: "AGENT_SKILLS_SERVICE_UNAVAILABLE",
    });
  });

  it("renders generated skill details and missing skills cleanly", async () => {
    const context = {
      runtime: {},
      services: {
        skills: {
          list: () => [],
          get: () => null,
        },
        skillsHub: skillsHubFixture(),
        skillSynthesis: {
          getGeneratedSkill: (slug: string) =>
            slug === "release-checklist" ? { slug, ok: true } : null,
          describeGeneratedSkill: (slug: string) => `describe:${slug}`,
        },
      },
    } as unknown as AgentExecutionContext;

    const shown = await handleSkillCommand(
      "/skills generated show release-checklist",
      context,
    );
    const described = await handleSkillCommand(
      "/skills generated describe release-checklist",
      context,
    );
    const missing = await handleSkillCommand("/skills show missing", context);

    expect(shown).toContain('"slug": "release-checklist"');
    expect(described).toBe("describe:release-checklist");
    expect(missing).toBe("Skill not found: missing");
  });

  it("synthesizes a generated skill from the active session", async () => {
    const events: unknown[] = [];
    const context = {
      runtime: {},
      services: {
        skills: {
          list: () => [],
          get: () => null,
        },
        skillsHub: skillsHubFixture(),
        sessions: {
          messagesBySession: () => [
            {
              role: "user",
              text: "Build a repeatable release checklist",
            },
            {
              role: "assistant",
              text: "Implemented the release checklist workflow.",
            },
          ],
        },
        skillSynthesis: {
          maybeAutoSynthesize: () => ({
            path: "/tmp/release-checklist/SKILL.md",
            candidate: {
              title: "Release Checklist",
              slug: "release-checklist",
            },
          }),
        },
        trajectoryEvaluation: {
          recordEvent: (event: unknown) => events.push(event),
        },
      },
    } as unknown as AgentExecutionContext;

    const result = await handleSkillCommand(
      "/skills synthesize latest",
      context,
      { sessionId: "session-1" },
    );

    expect(result).toContain("Release Checklist");
    expect(result).toContain("/tmp/release-checklist/SKILL.md");
    expect(events).toHaveLength(1);
  });
});
