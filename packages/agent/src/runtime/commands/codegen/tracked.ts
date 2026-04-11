import {
  generateEffectiveCode,
  generateEffectivePrd,
  performEffectiveCodeQa,
  performEffectiveCodeResearch,
} from "@/runtime/native/service-bridge/index";
import type { AgentExecutionContext } from "../../chat";
import {
  CODEGEN_PRD_USAGE,
  CODEGEN_RESEARCH_USAGE,
  parseCodegenDescriptor,
} from "./parsers";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "./support";

export async function handleTrackedCodegenCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/codegen generate ")) {
    const payload = trimmed.replace("/codegen generate ", "").trim();
    const [namePart, promptPart] = payload
      .split("::")
      .map((part) => part.trim());
    if (!namePart || !promptPart) {
      return "Usage: /codegen generate <project-name> :: <prompt>";
    }
    const request = {
      projectName: namePart,
      prompt: promptPart,
      objective: promptPart,
    };
    return withAutocoderWorkflow(
      context,
      {
        title: `Generate ${namePart}`,
        objective: promptPart,
        kind: "generate",
        projectName: namePart,
      },
      "system: code generation completed",
      async (workflow) => {
        const generation = await generateEffectiveCode(
          context.runtime,
          request,
        );
        const run = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "generate",
          projectName: namePart,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request,
          result: generation,
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          generation,
        });
      },
    );
  }

  if (trimmed.startsWith("/codegen research ")) {
    const parsed = parseCodegenDescriptor(
      trimmed.replace("/codegen research ", "").trim(),
    );
    if (!parsed) {
      return CODEGEN_RESEARCH_USAGE;
    }
    const request = {
      projectName: parsed.projectName,
      targetType: parsed.targetType,
      description: parsed.description,
      apis: parsed.apis,
      requirements: parsed.requirements,
    };
    return withAutocoderWorkflow(
      context,
      {
        title: `Research ${parsed.projectName}`,
        objective: parsed.description,
        kind: "research",
        projectName: parsed.projectName,
      },
      "system: research completed",
      async (workflow) => {
        const research = await performEffectiveCodeResearch(
          context.runtime,
          request,
        );
        const run = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "research",
          projectName: parsed.projectName,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request,
          result: research,
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          research,
        });
      },
    );
  }

  if (trimmed.startsWith("/codegen prd ")) {
    const parsed = parseCodegenDescriptor(
      trimmed.replace("/codegen prd ", "").trim(),
    );
    if (!parsed) {
      return CODEGEN_PRD_USAGE;
    }
    const request = {
      projectName: parsed.projectName,
      targetType: parsed.targetType,
      description: parsed.description,
      apis: parsed.apis,
      requirements: parsed.requirements,
    };
    return withAutocoderWorkflow(
      context,
      {
        title: `PRD ${parsed.projectName}`,
        objective: parsed.description,
        kind: "prd",
        projectName: parsed.projectName,
      },
      "system: PRD workflow completed",
      async (workflow) => {
        const research = await performEffectiveCodeResearch(
          context.runtime,
          request,
        );
        const researchRun = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "research",
          projectName: parsed.projectName,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request,
          result: research,
        });
        const prd = await generateEffectivePrd(
          context.runtime,
          request,
          research as Record<string, unknown>,
        );
        const prdRun = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "prd",
          projectName: parsed.projectName,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request,
          result: prd,
          linkedRunIds: [researchRun.id],
          parentRunId: researchRun.id,
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          researchRun,
          prdRun,
          research,
          prd,
        });
      },
    );
  }

  if (trimmed.startsWith("/codegen qa ")) {
    const projectPath = trimmed.replace("/codegen qa ", "").trim();
    if (!projectPath) {
      return "Usage: /codegen qa <project-path>";
    }
    const projectName = projectPath.split("/").filter(Boolean).at(-1);
    return withAutocoderWorkflow(
      context,
      {
        title: `QA ${projectName ?? "project"}`,
        objective: `QA ${projectPath}`,
        kind: "qa",
        projectName,
      },
      "system: QA completed",
      async (workflow) => {
        const qa = await performEffectiveCodeQa(context.runtime, projectPath);
        const run = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "qa",
          projectName,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: { projectPath },
          result: qa,
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          qa,
        });
      },
    );
  }

  if (trimmed === "/codegen runs") {
    return stringifyCodegenResponse({
      summary: context.services.autocoderPipeline.summary(),
      runs: context.services.autocoderPipeline.list(20),
    });
  }

  if (trimmed === "/codegen workflows") {
    return stringifyCodegenResponse({
      summary: context.services.autocoderPipeline.summary(),
      workflows: context.services.autocoderPipeline.listWorkflows(20),
    });
  }

  if (trimmed.startsWith("/codegen show ")) {
    const id = trimmed.replace("/codegen show ", "").trim();
    if (!id) {
      return "Usage: /codegen show <run-id>";
    }
    return stringifyCodegenResponse({
      run: context.services.autocoderPipeline.get(id),
    });
  }

  if (trimmed.startsWith("/codegen workflow ")) {
    const id = trimmed.replace("/codegen workflow ", "").trim();
    if (!id) {
      return "Usage: /codegen workflow <workflow-id>";
    }
    return stringifyCodegenResponse(
      context.services.autocoderPipeline.workflow(id),
    );
  }

  if (trimmed.startsWith("/codegen bundle ")) {
    const id = trimmed.replace("/codegen bundle ", "").trim();
    if (!id) {
      return "Usage: /codegen bundle <workflow-id>";
    }
    return stringifyCodegenResponse(
      context.services.autocoderPipeline.bundleWorkflow(id),
    );
  }

  return undefined;
}
