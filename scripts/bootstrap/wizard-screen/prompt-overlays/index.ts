import { createPromptYesNoHandler } from "./confirm";
import { createSelectManyHandler } from "./select-many";
import { createSelectOneHandler } from "./select-one";
import type {
  WizardPromptHandlers,
  WizardPromptOverlayDependencies,
} from "./shared";
import { createPromptTextHandler } from "./text";

export type {
  WizardPromptHandlers,
  WizardPromptOverlayDependencies,
} from "./shared";

export function createWizardPromptHandlers(
  deps: WizardPromptOverlayDependencies,
): WizardPromptHandlers {
  return {
    promptText: createPromptTextHandler(deps),
    promptYesNo: createPromptYesNoHandler(deps),
    selectOne: createSelectOneHandler(deps),
    selectMany: createSelectManyHandler(deps),
  };
}
