import type { AppContext } from "@/runtime/bootstrap";
import { handleCodegenGenerateRoutes } from "@/server/routes/codegen/handlers/generate";
import { handleCodegenGithubRoutes } from "@/server/routes/codegen/handlers/github";
import { handleCodegenPRDRoutes } from "@/server/routes/codegen/handlers/prd";
import { handleCodegenQA } from "@/server/routes/codegen/handlers/qa";
import { handleCodegenResearchRoutes } from "@/server/routes/codegen/handlers/research";
import { handleCodegenRunsRoutes } from "@/server/routes/codegen/handlers/runs";
import { handleCodegenRuntimeRoutes } from "@/server/routes/codegen/handlers/runtime";
import { handleCodegenWorkflowsRoutes } from "@/server/routes/codegen/handlers/workflows";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

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
