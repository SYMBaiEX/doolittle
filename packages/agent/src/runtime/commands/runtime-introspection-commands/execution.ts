import { getNativeExecutionControlPlane } from "../../native/service-bridge/control-planes/index";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleExecutionRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime e2b" && trimmed !== "/runtime sandboxes") {
      return undefined;
    }

    return JSON.stringify(
      getNativeExecutionControlPlane(context.runtime).e2b,
      null,
      2,
    );
  };
