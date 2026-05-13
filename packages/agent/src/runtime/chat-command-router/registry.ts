import { lifecycleAndIdentityRoutes } from "./lifecycle-and-identity";
import { planningAndSettingsRoutes } from "./planning-and-settings";
import { runtimeOperationsRoutes } from "./runtime-operations";
import type { ChatCommandRouteGroup } from "./types";
import { workflowAndToolingRoutes } from "./workflow-and-tooling";

export const CHAT_COMMAND_ROUTE_GROUPS = [
  lifecycleAndIdentityRoutes,
  workflowAndToolingRoutes,
  runtimeOperationsRoutes,
  planningAndSettingsRoutes,
] as const satisfies readonly ChatCommandRouteGroup[];
