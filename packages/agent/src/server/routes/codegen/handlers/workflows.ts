import { json } from "@/server/responses";
import {
  toPublicAutocoderBundle,
  toPublicAutocoderSummary,
  toPublicAutocoderWorkflow,
  toPublicAutocoderWorkflowView,
} from "@/server/routes/codegen/public-dtos";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenWorkflowsRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method === "GET" && url.pathname === "/codegen/workflows") {
    return json({
      summary: toPublicAutocoderSummary(
        context.services.autocoderPipeline.summary(),
      ),
      workflows: context.services.autocoderPipeline
        .listWorkflows(50)
        .map(toPublicAutocoderWorkflow),
    });
  }

  if (url.pathname.startsWith("/codegen/workflows/")) {
    const suffix = decodeURIComponent(
      url.pathname.replace("/codegen/workflows/", ""),
    );
    if (request.method === "POST" && suffix.endsWith("/bundle")) {
      const workflowId = suffix.replace(/\/bundle$/u, "");
      return json(
        toPublicAutocoderBundle(
          context.services.autocoderPipeline.bundleWorkflow(workflowId),
        ),
      );
    }
    if (request.method === "GET" && !suffix.endsWith("/bundle")) {
      return json(
        toPublicAutocoderWorkflowView(
          context.services.autocoderPipeline.workflow(suffix),
        ),
      );
    }
  }

  return null;
};
