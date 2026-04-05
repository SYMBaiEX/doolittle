import { json } from "@/server/responses";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenWorkflowsRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/codegen/workflows") {
    return json({
      summary: context.services.autocoderPipeline.summary(),
      workflows: context.services.autocoderPipeline.listWorkflows(50),
    });
  }

  if (url.pathname.startsWith("/codegen/workflows/")) {
    const suffix = decodeURIComponent(
      url.pathname.replace("/codegen/workflows/", ""),
    );
    if (suffix.endsWith("/bundle")) {
      const workflowId = suffix.replace(/\/bundle$/u, "");
      return json(
        context.services.autocoderPipeline.bundleWorkflow(workflowId),
      );
    }
    return json(context.services.autocoderPipeline.workflow(suffix));
  }

  return null;
};
