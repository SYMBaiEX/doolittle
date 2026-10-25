import type { AppContext } from "../../../runtime/bootstrap/index";
import { handleCodegenGenerateRoutes } from "./handlers/generate";
import { handleCodegenGithubRoutes } from "./handlers/github";
import { handleCodegenPRDRoutes } from "./handlers/prd";
import { handleCodegenQA } from "./handlers/qa";
import { handleCodegenResearchRoutes } from "./handlers/research";
import { handleCodegenRunsRoutes } from "./handlers/runs";
import { handleCodegenRuntimeRoutes } from "./handlers/runtime";
import { handleCodegenWorkflowsRoutes } from "./handlers/workflows";
import type { CodegenRouteHandler } from "./types";

const codegenRouteHandlers: Array<CodegenRouteHandler> = [
  handleCodegenRuntimeRoutes,
  handleCodegenGenerateRoutes,
  handleCodegenRunsRoutes,
  handleCodegenWorkflowsRoutes,
  handleCodegenResearchRoutes,
  handleCodegenPRDRoutes,
  handleCodegenQA,
  handleCodegenGithubRoutes,
];

export async function handleCodegenRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  for (const handler of codegenRouteHandlers) {
    const response = await handler(context, request, url);
    if (response) {
      return response;
    }
  }

  return null;
}
