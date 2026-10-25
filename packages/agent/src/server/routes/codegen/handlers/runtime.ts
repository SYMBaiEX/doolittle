import { getNativeExecutionControlPlane } from "../../../../runtime/native/service-bridge/control-planes/index";
import { json } from "../../../responses";
import type { CodegenRouteHandler } from "../types";

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
