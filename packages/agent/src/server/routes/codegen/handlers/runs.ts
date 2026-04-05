import { json } from "@/server/responses";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenRunsRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "GET") {
    return null;
  }

  if (url.pathname === "/codegen/runs") {
    return json({
      summary: context.services.autocoderPipeline.summary(),
      runs: context.services.autocoderPipeline.list(50),
    });
  }

  if (url.pathname.startsWith("/codegen/runs/")) {
    const id = decodeURIComponent(url.pathname.replace("/codegen/runs/", ""));
    return json({
      run: context.services.autocoderPipeline.get(id),
    });
  }

  return null;
};
