import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleCodegenWorkflowSubmission } from "../../packages/agent/src/server/routes/codegen/handlers/submissions";
import { runCodegenWorkflow } from "../../packages/agent/src/server/routes/codegen/run-execution";

vi.mock("../../packages/agent/src/server/routes/codegen/run-execution", () => ({
  runCodegenWorkflow: vi.fn(),
}));

it.each([
  ["C:\\Users\\me\\my-app", "my-app"],
  ["C:\\Users\\me\\my-app\\", "my-app"],
  ["C:\\Users\\me\\my-app\\\\", "my-app"],
  ["/home/me/my-app", "my-app"],
  ["/home/me/my-app/", "my-app"],
  ["/home/me/my-app///", "my-app"],
  ["my-app", "my-app"],
  ["/", undefined],
])("derives the QA project name from %s", async (projectPath, projectName) => {
  const context = {} as AppContext;
  const url = new URL("http://127.0.0.1/codegen/qa");
  const response = new Response();
  vi.mocked(runCodegenWorkflow).mockResolvedValueOnce(response);

  expect(
    await handleCodegenWorkflowSubmission(
      context,
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ projectPath }),
      }),
      url,
    ),
  ).toBe(response);
  expect(runCodegenWorkflow).toHaveBeenLastCalledWith(
    context,
    {
      title: `QA ${projectName ?? "project"}`,
      objective: `QA ${projectPath}`,
      kind: "qa",
      projectName,
    },
    "system: QA completed",
    expect.any(Function),
  );
});

it.each([
  ["/codegen/generate", { projectName: "project", prompt: 42 }],
  ["/codegen/qa", { projectPath: { path: "." } }],
  ["/codegen/qa", { projectPath: "" }],
  ["/codegen/qa", { projectPath: "   " }],
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
