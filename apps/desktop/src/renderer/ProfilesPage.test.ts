import { describe, expect, it } from "vitest";
import { normalizePersonalityProfiles } from "./ProfilesPage";

describe("personality profile presentation", () => {
  it("separates the active identity from switchable alternatives", () => {
    expect(
      normalizePersonalityProfiles({
        active: {
          id: "operator",
          name: "Operator",
          description: "Focused execution.",
        },
        available: [
          { id: "operator", name: "Operator" },
          { id: "concise", name: "Concise", summary: "High signal." },
          { id: "teacher", name: "Teacher", description: "Explains why." },
        ],
      }),
    ).toEqual({
      active: {
        id: "operator",
        name: "Operator",
        description: "Focused execution.",
      },
      alternatives: [
        { id: "concise", name: "Concise", description: "High signal." },
        { id: "teacher", name: "Teacher", description: "Explains why." },
      ],
    });
  });

  it("normalizes incomplete runtime entries without duplicating the active row", () => {
    expect(
      normalizePersonalityProfiles({
        active: { id: "autonomous" },
        available: [{ id: "autonomous" }, {}],
      }),
    ).toEqual({
      active: {
        id: "autonomous",
        name: "Autonomous",
        description: "A local Doolittle personality profile.",
      },
      alternatives: [
        {
          id: "profile-1",
          name: "Profile 1",
          description: "A local Doolittle personality profile.",
        },
      ],
    });
  });
});
