import { getNativeMediaControlPlane } from "@/runtime/native/service-bridge/control-planes";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleMediaRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime media") {
      return undefined;
    }

    return JSON.stringify(getNativeMediaControlPlane(context.config), null, 2);
  };
