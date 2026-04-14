import { handleFormsCommand } from "@/runtime/commands/forms";
import { handlePlansCommand } from "@/runtime/commands/plans";
import { handleSettingsThemeCommand } from "@/runtime/commands/settings-theme-commands";
import type { ChatCommandRouteGroup } from "./types";

export const planningAndSettingsRoutes = [
  ({ trimmed, context }) => handleFormsCommand(trimmed, context),
  ({ trimmed, context }) => handlePlansCommand(trimmed, context),
  ({ trimmed, context }) => handleSettingsThemeCommand(trimmed, context),
] as const satisfies ChatCommandRouteGroup;
