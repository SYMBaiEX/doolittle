import type { AppContext } from "../../../runtime/bootstrap/index";
import { handleCodegenRunsRoutes } from "./handlers/runs";
import { handleCodegenRuntimeRoutes } from "./handlers/runtime";
import { handleCodegenWorkflowSubmission } from "./handlers/submissions";
import { handleCodegenWorkflowsRoutes } from "./handlers/workflows";
import type { CodegenRouteHandler } from "./types";

const codegenRouteHandlers: Array<CodegenRouteHandler> = [
  handleCodegenRuntimeRoutes,
  handleCodegenWorkflowSubmission,
  handleCodegenRunsRoutes,
  handleCodegenWorkflowsRoutes,
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
