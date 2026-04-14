import type { AgentExecutionContext } from "../../../chat";
import { stringifyCodegenResponse } from "../support";

const CODEGEN_BUNDLE_PREFIX = "/codegen bundle ";
const CODEGEN_RUNS = "/codegen runs";
const CODEGEN_SHOW_PREFIX = "/codegen show ";
const CODEGEN_WORKFLOW_PREFIX = "/codegen workflow ";
const CODEGEN_WORKFLOWS = "/codegen workflows";

export async function handleCodegenListingCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === CODEGEN_RUNS) {
    return stringifyCodegenResponse({
      summary: context.services.autocoderPipeline.summary(),
      runs: context.services.autocoderPipeline.list(20),
    });
  }

  if (trimmed === CODEGEN_WORKFLOWS) {
    return stringifyCodegenResponse({
      summary: context.services.autocoderPipeline.summary(),
      workflows: context.services.autocoderPipeline.listWorkflows(20),
    });
  }

  if (trimmed.startsWith(CODEGEN_SHOW_PREFIX)) {
    const id = trimmed.replace(CODEGEN_SHOW_PREFIX, "").trim();
    if (!id) {
      return "Usage: /codegen show <run-id>";
    }
    return stringifyCodegenResponse({
      run: context.services.autocoderPipeline.get(id),
    });
  }

  if (trimmed.startsWith(CODEGEN_WORKFLOW_PREFIX)) {
    const id = trimmed.replace(CODEGEN_WORKFLOW_PREFIX, "").trim();
    if (!id) {
      return "Usage: /codegen workflow <workflow-id>";
    }
    return stringifyCodegenResponse(
      context.services.autocoderPipeline.workflow(id),
    );
  }

  if (trimmed.startsWith(CODEGEN_BUNDLE_PREFIX)) {
    const id = trimmed.replace(CODEGEN_BUNDLE_PREFIX, "").trim();
    if (!id) {
      return "Usage: /codegen bundle <workflow-id>";
    }
    return stringifyCodegenResponse(
      context.services.autocoderPipeline.bundleWorkflow(id),
    );
  }

  return undefined;
}
