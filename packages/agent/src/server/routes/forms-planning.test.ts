import { DOOLITTLE_OPERATOR_PLANNING_SERVICE } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleFormsPlanningRoutes } from "./forms-planning";

function createContext(): AppContext {
  return {
    runtime: {
      getService: (name: string) => {
        if (name === "doolittle_forms") {
          return {
            listForms: () => [{ id: "form-1", status: "active" }],
            getTemplates: () => ({ intake: { title: "Intake" } }),
            isPersistenceAvailable: () => true,
            createForm: (templateOrForm: unknown, metadata?: unknown) => ({
              id: "form-new",
              templateOrForm,
              metadata,
            }),
            getForm: (id: string) => ({ id, status: "active" }),
            cancelForm: (id: string) => ({ id, status: "cancelled" }),
          };
        }
        if (name === DOOLITTLE_OPERATOR_PLANNING_SERVICE) {
          return {
            listPlans: () => [{ id: "plan-1", taskId: "task-1" }],
            createPlan: (input: unknown) => ({ id: "plan-new", input }),
            getPlan: (id: string) => ({ id, status: "draft" }),
          };
        }
        return undefined;
      },
    },
  } as unknown as AppContext;
}

describe("handleFormsPlanningRoutes", () => {
  function createPlanActionContext(
    planning: Record<string, unknown>,
  ): AppContext {
    return {
      runtime: {
        getService: (name: string) =>
          name === DOOLITTLE_OPERATOR_PLANNING_SERVICE ? planning : undefined,
      },
    } as unknown as AppContext;
  }

  it("returns forms, templates, and planning summaries", async () => {
    const context = createContext();
    const runtimeForms = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/runtime/forms"),
      new URL("http://localhost/runtime/forms"),
    );
    const forms = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms"),
      new URL("http://localhost/forms"),
    );
    const templates = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms/templates"),
      new URL("http://localhost/forms/templates"),
    );
    const plans = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans"),
      new URL("http://localhost/plans"),
    );

    const runtimeFormsBody = await runtimeForms?.json();
    const formsBody = await forms?.json();
    const templatesBody = await templates?.json();
    const plansBody = await plans?.json();

    expect(runtimeFormsBody).toHaveProperty("forms");
    expect(formsBody).toHaveProperty("control");
    expect(formsBody).toHaveProperty("forms");
    expect(templatesBody).toHaveProperty("templates");
    expect(plansBody).toHaveProperty("plans");
  });

  it("validates create payloads", async () => {
    const missingForm = await handleFormsPlanningRoutes(
      createContext(),
      new Request("http://localhost/forms/create", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/forms/create"),
    );
    const missingPlan = await handleFormsPlanningRoutes(
      createContext(),
      new Request("http://localhost/plans/create", {
        method: "POST",
        body: JSON.stringify({ title: "Plan" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/plans/create"),
    );

    expect(missingForm?.status).toBe(400);
    await expect(missingForm?.json()).resolves.toEqual({
      error: "template or form is required",
    });
    expect(missingPlan?.status).toBe(400);
    await expect(missingPlan?.json()).resolves.toEqual({
      error: "title and objective are required",
    });
  });

  it("creates, loads, and cancels forms and plans", async () => {
    const context = createContext();
    const createForm = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms/create", {
        method: "POST",
        body: JSON.stringify({ template: "intake" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/forms/create"),
    );
    const createPlan = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/create", {
        method: "POST",
        body: JSON.stringify({
          title: "Ship cleanup",
          objective: "Finish the refactor",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/plans/create"),
    );
    const getForm = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms/form-1"),
      new URL("http://localhost/forms/form-1"),
    );
    const getPlan = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/plan-1"),
      new URL("http://localhost/plans/plan-1"),
    );
    const cancelForm = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms/form-1/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/forms/form-1/cancel"),
    );

    expect(await createForm?.json()).toHaveProperty("form");
    expect(await createPlan?.json()).toHaveProperty("plan");
    expect(await getForm?.json()).toHaveProperty("form");
    expect(await getPlan?.json()).toHaveProperty("plan");
    expect(await cancelForm?.json()).toHaveProperty("cancelled");
  });

  it("approves drafts without executing a task and rejects reviewed states", async () => {
    let approvals = 0;
    const approved = await handleFormsPlanningRoutes(
      createPlanActionContext({
        approvePlan: () => {
          approvals += 1;
          return {
            kind: "approved",
            plan: {
              id: "plan-1",
              status: "active",
              metadata: { operatorReview: {} },
            },
          };
        },
      }),
      new Request("http://localhost/plans/plan-1/approve", { method: "POST" }),
      new URL("http://localhost/plans/plan-1/approve"),
    );
    const missing = await handleFormsPlanningRoutes(
      createPlanActionContext({ approvePlan: () => ({ kind: "not_found" }) }),
      new Request("http://localhost/plans/missing/approve", { method: "POST" }),
      new URL("http://localhost/plans/missing/approve"),
    );
    const conflict = await handleFormsPlanningRoutes(
      createPlanActionContext({
        approvePlan: () => ({
          kind: "invalid_state",
          plan: { status: "active" },
        }),
      }),
      new Request("http://localhost/plans/plan-1/approve", { method: "POST" }),
      new URL("http://localhost/plans/plan-1/approve"),
    );

    expect(approved?.status).toBe(200);
    expect(approvals).toBe(1);
    expect(missing?.status).toBe(404);
    expect(conflict?.status).toBe(409);
  });

  it("validates bounded steering and reports task linkage conflicts", async () => {
    const requests: Array<[string, string]> = [];
    const context = createPlanActionContext({
      steerPlan: (planId: string, instruction: string) => {
        requests.push([planId, instruction]);
        return { kind: "steered", plan: { id: planId }, taskId: "task-1" };
      },
    });
    const steered = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/plan-1/steer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Keep the change small." }),
      }),
      new URL("http://localhost/plans/plan-1/steer"),
    );
    const invalid = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/plan-1/steer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: " " }),
      }),
      new URL("http://localhost/plans/plan-1/steer"),
    );
    const unlinked = await handleFormsPlanningRoutes(
      createPlanActionContext({ steerPlan: () => ({ kind: "unlinked" }) }),
      new Request("http://localhost/plans/plan-1/steer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Do it." }),
      }),
      new URL("http://localhost/plans/plan-1/steer"),
    );
    const terminalConflict = await handleFormsPlanningRoutes(
      createPlanActionContext({
        steerPlan: () => ({
          kind: "task_not_steerable",
          taskId: "task-1",
          status: "done",
        }),
      }),
      new Request("http://localhost/plans/plan-1/steer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Do it." }),
      }),
      new URL("http://localhost/plans/plan-1/steer"),
    );
    const orchestratorUnavailable = await handleFormsPlanningRoutes(
      createPlanActionContext({
        steerPlan: () => ({ kind: "orchestrator_unavailable" }),
      }),
      new Request("http://localhost/plans/plan-1/steer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: "Do it." }),
      }),
      new URL("http://localhost/plans/plan-1/steer"),
    );

    expect(steered?.status).toBe(200);
    expect(requests).toEqual([["plan-1", "Keep the change small."]]);
    expect(invalid?.status).toBe(400);
    expect(unlinked?.status).toBe(409);
    expect(terminalConflict?.status).toBe(409);
    expect(orchestratorUnavailable?.status).toBe(503);
  });

  it("returns stable 400 responses for malformed planning bodies", async () => {
    const context = createContext();
    const malformedForm = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms/create", {
        method: "POST",
        body: "{",
      }),
      new URL("http://localhost/forms/create"),
    );
    const arrayPlan = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/create", {
        method: "POST",
        body: JSON.stringify([]),
      }),
      new URL("http://localhost/plans/create"),
    );
    const invalidSteer = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/plan-1/steer", {
        method: "POST",
        body: "not-json",
      }),
      new URL("http://localhost/plans/plan-1/steer"),
    );

    expect(malformedForm?.status).toBe(400);
    await expect(malformedForm?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(arrayPlan?.status).toBe(400);
    await expect(arrayPlan?.json()).resolves.toEqual({
      error: "JSON body must be an object",
    });
    expect(invalidSteer?.status).toBe(400);
    await expect(invalidSteer?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
  });

  it("rejects unsafe plan action identifiers before service dispatch", async () => {
    let calls = 0;
    const response = await handleFormsPlanningRoutes(
      createPlanActionContext({
        approvePlan: () => {
          calls += 1;
          return { kind: "approved" };
        },
      }),
      new Request("http://localhost/plans/%2Fetc%2Fpasswd/approve", {
        method: "POST",
      }),
      new URL("http://localhost/plans/%2Fetc%2Fpasswd/approve"),
    );

    expect(response?.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("returns client errors for malformed form and plan ids", async () => {
    const context = createContext();
    const malformedForm = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/forms/%E0%A4"),
      new URL("http://localhost/forms/%E0%A4"),
    );
    const malformedPlan = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/%E0%A4"),
      new URL("http://localhost/plans/%E0%A4"),
    );
    const encodedPlan = await handleFormsPlanningRoutes(
      context,
      new Request("http://localhost/plans/%70lan-1"),
      new URL("http://localhost/plans/%70lan-1"),
    );

    expect(malformedForm?.status).toBe(400);
    expect(malformedPlan?.status).toBe(400);
    expect(await encodedPlan?.json()).toEqual({
      plan: { id: "plan-1", status: "draft" },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleFormsPlanningRoutes(
      createContext(),
      new Request("http://localhost/not-forms"),
      new URL("http://localhost/not-forms"),
    );

    expect(response).toBeNull();
  });
});
