import { win32 } from "node:path";
import type { AppContext } from "../../../../runtime/bootstrap";
import {
  createEffectiveRepository,
  deleteEffectiveRepository,
  generateEffectiveCode,
  generateEffectivePrd,
  performEffectiveCodeQa,
  performEffectiveCodeResearch,
} from "../../../../runtime/native/service-bridge/autocoder";
import {
  invalidJsonObjectBody,
  readJsonObjectBody,
} from "../../../request-body";
import { json } from "../../../responses";
import { runCodegenWorkflow, withAutocoderAbortSignal } from "../run-execution";
import type { CodegenRouteHandler } from "../types";

const SUBMISSIONS = new Set([
  "/codegen/generate",
  "/codegen/prd",
  "/codegen/qa",
  "/codegen/research",
  "/github/create",
  "/github/delete",
]);

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalStringList(value: unknown): boolean {
  return (
    value == null ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

export const handleCodegenWorkflowSubmission: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  const path = url.pathname;
  if (request.method !== "POST" || !SUBMISSIONS.has(path)) return null;

  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) return invalidJsonObjectBody(parsed.reason);
  const body = parsed.value;

  if (path === "/github/create" || path === "/github/delete") {
    return planRepository(context, body, path === "/github/create");
  }

  if (path === "/codegen/qa") {
    const { projectPath } = body;
    if (!nonBlankString(projectPath)) {
      return json({ error: "projectPath is required" }, 400);
    }
    const projectName = win32.basename(projectPath) || undefined;
    return runCodegenWorkflow(
      context,
      {
        title: `QA ${projectName ?? "project"}`,
        objective: `QA ${projectPath}`,
        kind: "qa",
        projectName,
      },
      "system: QA completed",
      async (step) => {
        const { run, result: qa } = await step(
          { kind: "qa", request: { projectPath } },
          () => performEffectiveCodeQa(context.runtime, projectPath),
        );
        return { run, qa };
      },
    );
  }

  if (path === "/codegen/generate") {
    const { projectName, prompt } = body;
    if (!nonBlankString(projectName) || !nonBlankString(prompt)) {
      return json({ error: "projectName and prompt are required" }, 400);
    }
    const payload = { ...body, objective: prompt };
    return runCodegenWorkflow(
      context,
      {
        title: `Generate ${projectName}`,
        objective: prompt,
        kind: "generate",
        projectName,
      },
      "system: code generation completed",
      async (step) => {
        const { run, result: generation } = await step(
          { kind: "generate", request: payload },
          (signal) =>
            generateEffectiveCode(
              context.runtime,
              withAutocoderAbortSignal(payload, signal),
            ),
        );
        return { run, generation };
      },
    );
  }

  return runResearch(context, body, path === "/codegen/prd");
};

function runResearch(
  context: AppContext,
  body: Record<string, unknown>,
  plan: boolean,
): Response | Promise<Response> {
  const { projectName, description, targetType, apis, requirements } = body;
  if (!nonBlankString(projectName) || !nonBlankString(description)) {
    return json({ error: "projectName and description are required" }, 400);
  }
  if (
    (targetType != null && typeof targetType !== "string") ||
    !optionalStringList(apis) ||
    !optionalStringList(requirements)
  ) {
    return json(
      {
        error:
          "targetType must be a string and apis and requirements must be arrays of strings",
      },
      400,
    );
  }
  const payload = {
    projectName,
    description,
    targetType: targetType ?? "plugin",
    apis: apis ?? [],
    requirements: requirements ?? [],
  };
  return runCodegenWorkflow(
    context,
    {
      title: `${plan ? "PRD" : "Research"} ${projectName}`,
      objective: description,
      kind: plan ? "prd" : "research",
      projectName,
    },
    plan ? "system: PRD workflow completed" : "system: research completed",
    async (step) => {
      const { run: researchRun, result: research } = await step(
        { kind: "research", request: payload },
        (signal) =>
          performEffectiveCodeResearch(
            context.runtime,
            withAutocoderAbortSignal(payload, signal),
          ),
      );
      if (!plan) return { run: researchRun, research };
      const { run: prdRun, result: prd } = await step(
        { kind: "prd", request: payload, parentRunId: researchRun.id },
        (signal) =>
          generateEffectivePrd(
            context.runtime,
            withAutocoderAbortSignal(payload, signal),
            research as Record<string, unknown>,
          ),
        { linkedRunIds: [researchRun.id] },
      );
      return { researchRun, prdRun, research, prd };
    },
  );
}

function planRepository(
  context: AppContext,
  body: Record<string, unknown>,
  create: boolean,
): Response | Promise<Response> {
  const { name, private: isPrivate } = body;
  if (!nonBlankString(name)) {
    return json({ error: "name is required" }, 400);
  }
  if (create && isPrivate != null && typeof isPrivate !== "boolean") {
    return json({ error: "private must be a boolean" }, 400);
  }
  const operation = create ? "creation" : "deletion";
  const kind = create ? "github.create" : "github.delete";
  // A GitHub request may produce a plan only. Repository writes remain
  // subject to the normal approval workflow.
  return runCodegenWorkflow(
    context,
    {
      title: `Plan repo ${operation} ${name}`,
      objective: `Plan GitHub repository ${operation} for ${name}`,
      kind,
      repositoryName: name,
    },
    `system: repository ${operation} planned; no mutation executed`,
    async (step) => {
      if (create) {
        const visibility = isPrivate !== false;
        const { run, result: repository } = await step(
          { kind, request: { name, private: visibility } },
          () => createEffectiveRepository(context.runtime, name, visibility),
        );
        return { run, repository };
      }
      const { run, result: deleted } = await step(
        { kind, request: { name } },
        () => deleteEffectiveRepository(context.runtime, name),
      );
      return { run, deleted };
    },
  );
}
