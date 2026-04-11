import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handlePlansCommand } from ".";

function createRuntime() {
  const planning = {
    listPlans: () => [{ id: "plan-1", title: "alpha" }],
    createPlan: (input: unknown) => ({
      id: "plan-2",
      ...((input as object) || {}),
    }),
    getPlan: (planId: string) => ({ id: planId }),
  };
  return {
    getService(name: string) {
      if (name === "planning") {
        return planning;
      }
      return undefined;
    },
  };
}

describe("plans command router", () => {
  it("lists native plans and creates new records", async () => {
    const context = {
      runtime: createRuntime(),
    } as unknown as AgentExecutionContext;

    const plans = await handlePlansCommand("/plans list", context);
    const plan = await handlePlansCommand(
      '/plans create Ship it :: Finish stabilization :: {"priority":"high"}',
      context,
    );

    expect(plans).toContain('"plan-1"');
    expect(plan).toContain('"title": "Ship it"');
  });
});
