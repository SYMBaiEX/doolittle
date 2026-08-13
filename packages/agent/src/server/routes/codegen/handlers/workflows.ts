import { json } from "@/server/responses";
import {
  toPublicAutocoderBundle,
  toPublicAutocoderSummary,
  toPublicAutocoderWorkflow,
  toPublicAutocoderWorkflowView,
} from "@/server/routes/codegen/public-dtos";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";
import { parseOpaqueRouteId } from "@/server/routes/parse-opaque-id";

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
    const match = url.pathname.match(
      /^\/codegen\/workflows\/([^/]+)(\/bundle)?$/u,
    );
    if (!match) return null;
    const workflowId = parseOpaqueRouteId(match[1]);
    if (!workflowId) {
      return json({ error: "Autocoder workflow identifier is invalid." }, 400);
    }
    if (request.method === "POST" && match[2] === "/bundle") {
      return json(
        toPublicAutocoderBundle(
          context.services.autocoderPipeline.bundleWorkflow(workflowId),
        ),
      );
    }
    if (request.method === "GET" && !match[2]) {
      return json(
        toPublicAutocoderWorkflowView(
          context.services.autocoderPipeline.workflow(workflowId),
        ),
      );
    }
  }

  return null;
};
