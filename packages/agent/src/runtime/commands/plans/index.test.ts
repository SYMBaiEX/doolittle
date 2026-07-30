import { DOOLITTLE_OPERATOR_PLANNING_SERVICE } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
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
      if (name === DOOLITTLE_OPERATOR_PLANNING_SERVICE) {
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

  it("supports Doolittle-native todo aliases on top of native plans", async () => {
    const context = {
      runtime: createRuntime(),
    } as unknown as AgentExecutionContext;

    const todos = await handlePlansCommand("/todo list", context);
    const todo = await handlePlansCommand(
      "/todo add Operator loop :: Make retry and undo feel first-class",
      context,
    );
    const shown = await handlePlansCommand("/todo show plan-2", context);

    expect(todos).toContain('"plan-1"');
    expect(todo).toContain('"title": "Operator loop"');
    expect(shown).toContain('"id": "plan-2"');
  });
});
