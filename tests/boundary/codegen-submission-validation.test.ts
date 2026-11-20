import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleCodegenWorkflowSubmission } from "../../packages/agent/src/server/routes/codegen/handlers/submissions";

it.each([
  ["/codegen/generate", { projectName: "project", prompt: 42 }],
  ["/codegen/qa", { projectPath: { path: "." } }],
  [
    "/codegen/prd",
    { projectName: "project", description: "Design it", requirements: "all" },
  ],
  ["/github/create", { name: "project", private: "false" }],
  ["/github/delete", { name: "  " }],
])(
  "rejects invalid fields on %s before recording a workflow",
  async (path, body) => {
    const context = {} as AppContext;
    const url = new URL(path, "http://127.0.0.1");
    const response = await handleCodegenWorkflowSubmission(
      context,
      new Request(url, { method: "POST", body: JSON.stringify(body) }),
      url,
    );
    expect(response?.status).toBe(400);
  },
);

it("leaves codegen read routes and unrelated methods available to their own handlers", async () => {
  const context = {} as AppContext;
  const url = new URL("http://127.0.0.1/codegen/runs");
  const request = new Request(url);
  expect(
    await handleCodegenWorkflowSubmission(context, request, url),
  ).toBeNull();
});
