import { describe, expect, it } from "bun:test";
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
      curated: 2,
      generated: 1,
      categories: [
        { name: "browser/research", count: 1 },
        { name: "browser/navigation", count: 1 },
        { name: "generated", count: 1 },
      ],
      roots: [
        { name: "browser", count: 2 },
        { name: "generated", count: 1 },
      ],
    });
  });
});
