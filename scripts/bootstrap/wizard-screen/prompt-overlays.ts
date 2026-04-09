import { createPromptYesNoHandler } from "./prompt-overlays/confirm";
import { createSelectManyHandler } from "./prompt-overlays/select-many";
import { createSelectOneHandler } from "./prompt-overlays/select-one";
import type {
  WizardPromptHandlers,
  WizardPromptOverlayDependencies,
} from "./prompt-overlays/shared";
import { createPromptTextHandler } from "./prompt-overlays/text";

export type {
  WizardPromptHandlers,
  WizardPromptOverlayDependencies,
} from "./prompt-overlays/shared";

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
