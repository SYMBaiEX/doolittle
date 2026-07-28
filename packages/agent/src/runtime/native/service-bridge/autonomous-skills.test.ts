import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import { getEffectiveSkillsSummary } from "./autonomous-skills";
import type { RuntimeLike } from "./runtime";

describe("getEffectiveSkillsSummary", () => {
  it("derives a workspace summary when the service does not expose summary()", () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      skills: {
        list: () => [
          { slug: "browser/research" },
          { slug: "browser/navigation" },
          { slug: "generated/queue-one" },
        ],
      },
    } as unknown as AppServices;

    expect(getEffectiveSkillsSummary(runtime, services)).toEqual({
      total: 3,
      curated: 0,
      generated: 1,
      workspace: 3,
      bundled: 0,
      managed: 0,
      project: 0,
      plugin: 0,
      extra: 0,
      invocable: 3,
      categories: [
        { name: "browser/research", count: 1 },
        { name: "browser/navigation", count: 1 },
        { name: "generated", count: 1 },
      ],
      roots: [
        { name: "browser", count: 2 },
        { name: "generated", count: 1 },
      ],
      sources: [{ name: "workspace", count: 3 }],
    });
  });

  it("projects the official service contract onto the product skill shape", () => {
    const runtime = {
      getService(name: string) {
        if (name !== "AGENT_SKILLS_SERVICE") return null;
        return {
          getLoadedSkills: () => [
            {
              slug: "release-checklist",
              name: "Release Checklist",
              description: "Ship safely.",
              path: "/managed/release-checklist",
              content: "# Release Checklist",
              source: "managed",
              sourceDir: "/managed",
              precedence: 80,
            },
          ],
        };
      },
    } as unknown as RuntimeLike;
    const services = {
      skills: {
        list: () => [],
      },
    } as unknown as AppServices;

    expect(getEffectiveSkillsSummary(runtime, services)).toMatchObject({
      total: 1,
      managed: 1,
    });
  });
});
