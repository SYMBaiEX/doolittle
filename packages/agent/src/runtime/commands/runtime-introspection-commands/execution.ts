import { getNativeExecutionControlPlane } from "@/runtime/native/service-bridge/control-planes";
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
