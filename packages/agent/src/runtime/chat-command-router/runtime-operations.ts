import { handleAccountsCommand } from "../commands/accounts/index";
import { handleGatewayRuntimeCommand } from "../commands/gateway-runtime/index";
import { handleOperatorCommand } from "../commands/operator-commands/index";
import { handleRuntimeIntrospectionCommand } from "../commands/runtime-introspection-commands/index";
import type { ChatCommandRouteGroup } from "./types";

export const runtimeOperationsRoutes = [
  ({ input, trimmed, context, hooks }) =>
    handleOperatorCommand(input, trimmed, context, hooks),
  ({ input, trimmed, sessionKey, context }) =>
    handleGatewayRuntimeCommand(input, trimmed, sessionKey, context),
  ({ input, trimmed, context, hooks }) =>
    handleAccountsCommand(input, trimmed, context, hooks),
  ({ trimmed, context }) => handleRuntimeIntrospectionCommand(trimmed, context),
] as const satisfies ChatCommandRouteGroup;
