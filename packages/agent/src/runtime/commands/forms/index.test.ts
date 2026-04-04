import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handleFormsCommand } from ".";

function createRuntime() {
  const forms = {
    listForms: () => [{ id: "form-1", status: "active" }],
    getTemplates: () => ({ intake: { title: "Intake" } }),
    createForm: (templateId: unknown, metadata?: unknown) => ({
      id: "form-2",
      templateId,
      metadata,
    }),
    getForm: (formId: string) => ({ id: formId }),
    cancelForm: (formId: string) => formId,
    isPersistenceAvailable: () => true,
  };
  return {
    getService(name: string) {
      if (name === "forms") {
        return forms;
      }
      return undefined;
    },
  };
}

describe("forms command router", () => {
  it("lists native forms and templates and creates new records", async () => {
    const context = {
      runtime: createRuntime(),
    } as unknown as AgentExecutionContext;

    const forms = await handleFormsCommand("/forms list", context);
    const templates = await handleFormsCommand("/forms templates", context);
    const create = await handleFormsCommand(
      '/forms create intake :: {"source":"cli"}',
      context,
    );

    expect(forms).toContain('"form-1"');
    expect(templates).toContain('"intake"');
    expect(create).toContain('"templateId": "intake"');
  });
});
