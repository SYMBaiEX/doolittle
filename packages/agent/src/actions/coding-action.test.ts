import { resolveSubActions } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  createCodingAction,
  DOOLITTLE_CODING_ACTION,
  DOOLITTLE_CODING_SUBACTIONS,
} from "./coding-action";

describe("Doolittle coding action", () => {
  it("declares a context-gated native sub-planner over coding tools", () => {
    const parent = createCodingAction();
    const children = DOOLITTLE_CODING_SUBACTIONS.map((name) => ({
      name,
      description: `${name} test action`,
      validate: async () => true,
      handler: async () => ({ success: true }),
    }));

    expect(parent.name).toBe(DOOLITTLE_CODING_ACTION);
    expect(parent.contexts).toEqual(["code", "files"]);
    expect(DOOLITTLE_CODING_SUBACTIONS[0]).toBe("TASKS_SPAWN_AGENT");
    expect(parent.description).toContain(
      "delegate the complete implementation once to TASKS_SPAWN_AGENT",
    );
    expect(parent.description).toContain("Run production builds before");
    expect(parent.description).toContain(
      "The delegated agent must not run a production build or start the app",
    );
    expect(parent.description).toContain(
      "Do not delegate the same workspace again",
    );
    expect(parent.subPlanner).toMatchObject({
      name: "Doolittle coding planner",
      description: expect.stringContaining(
        "The delegated coding agent must not run a production build or start the dev server",
      ),
    });
    expect(
      resolveSubActions({ actions: children }, parent).map(({ name }) => name),
    ).toEqual(DOOLITTLE_CODING_SUBACTIONS);
  });

  it("fails closed when invoked outside the SDK sub-planner path", async () => {
    const result = await createCodingAction().handler(
      {} as never,
      {} as never,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: false,
      error: "CODING_SUBPLANNER_REQUIRED",
      data: { actionName: DOOLITTLE_CODING_ACTION },
    });
  });
});
