import type { AppContext } from "@/runtime/bootstrap";

export type CodegenRouteHandler = (
  context: AppContext,
  request: Request,
  url: URL,
) => Promise<Response | null>;
