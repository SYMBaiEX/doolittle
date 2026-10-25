import { handleFormsCommand } from "../commands/forms/index";
import { handlePlansCommand } from "../commands/plans/index";
import { handleSettingsThemeCommand } from "../commands/settings-theme-commands";
import type { ChatCommandRouteGroup } from "./types";

export const planningAndSettingsRoutes = [
  ({ trimmed, context }) => handleFormsCommand(trimmed, context),
  ({ trimmed, context }) => handlePlansCommand(trimmed, context),
  ({ trimmed, context }) => handleSettingsThemeCommand(trimmed, context),
] as const satisfies ChatCommandRouteGroup;
