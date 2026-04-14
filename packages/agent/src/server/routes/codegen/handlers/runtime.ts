import { getNativeExecutionControlPlane } from "@/runtime/native/service-bridge/control-planes";
import { json } from "@/server/responses";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenRuntimeRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "GET" || url.pathname !== "/runtime/codegen") {
    return null;
  }

  return json({
    execution: getNativeExecutionControlPlane(context.runtime),
  });
};
