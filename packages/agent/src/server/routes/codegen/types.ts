import type { AppContext } from "../../../runtime/bootstrap/index";

export type CodegenRouteHandler = (
  context: AppContext,
  request: Request,
  url: URL,
) => Promise<Response | null>;
