import {
  createEffectiveRepository,
  deleteEffectiveRepository,
} from "@/runtime/native/service-bridge/autocoder";
import type { AgentExecutionContext } from "../../chat";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "./support";

export async function handleCodegenGithubCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/github create ")) {
    const payload = trimmed.replace("/github create ", "").trim();
    if (!payload) {
      return "Usage: /github create <repo-name> [| private:false]";
    }
    const [name, ...flags] = payload.split("|").map((part) => part.trim());
    const privateFlag = flags.find((part) => part.startsWith("private:"));
    const isPrivate = privateFlag
      ? privateFlag.replace("private:", "").trim() !== "false"
      : true;
    return withAutocoderWorkflow(
      context,
      {
        title: `Plan repo creation ${name}`,
        objective: `Plan GitHub repository creation for ${name}`,
        kind: "github.create",
        repositoryName: name,
      },
      "system: repository creation planned; no mutation executed",
      async (workflow) => {
        const repository = await createEffectiveRepository(
          context.runtime,
          name,
          isPrivate,
        );
        const run = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "github.create",
          repositoryName: name,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: { name, private: isPrivate },
          result: repository,
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          repository,
        });
      },
    );
  }

  if (trimmed.startsWith("/github delete ")) {
    const name = trimmed.replace("/github delete ", "").trim();
    if (!name) {
      return "Usage: /github delete <repo-name>";
    }
    return withAutocoderWorkflow(
      context,
      {
        title: `Plan repo deletion ${name}`,
        objective: `Plan GitHub repository deletion for ${name}`,
        kind: "github.delete",
        repositoryName: name,
      },
      "system: repository deletion planned; no mutation executed",
      async (workflow) => {
        const deleted = await deleteEffectiveRepository(context.runtime, name);
        const run = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "github.delete",
          repositoryName: name,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: { name },
          result: deleted,
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          deleted,
        });
      },
    );
  }

  return undefined;
}
