import { handleAccountsCommand } from "@/runtime/commands/accounts";
import { handleGatewayRuntimeCommand } from "@/runtime/commands/gateway-runtime";
import { handleOperatorCommand } from "@/runtime/commands/operator-commands";
import { handleRuntimeIntrospectionCommand } from "@/runtime/commands/runtime-introspection-commands";
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
