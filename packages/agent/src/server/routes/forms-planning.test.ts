import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleFormsPlanningRoutes } from "./forms-planning";

function createContext(): AppContext {
  return {
    runtime: {
      getService: (name: string) => {
        if (name === "forms") {
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
        if (name === "planning") {
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

  it("returns null for unrelated routes", async () => {
    const response = await handleFormsPlanningRoutes(
      createContext(),
      new Request("http://localhost/not-forms"),
      new URL("http://localhost/not-forms"),
    );

    expect(response).toBeNull();
  });
});
