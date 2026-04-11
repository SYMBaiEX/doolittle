import type { getLinkedProviderAccountsSnapshot } from "../../packages/agent/src/runtime/native/account-auth/index";
import { readEnvBase } from "./answers/base-env";
import { createHeadlessAnswers } from "./answers/headless";
import {
  DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
  DEFAULT_ELIZA_CLOUD_LARGE_MODEL,
  DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
  normalizeElizaCloudEmbeddingModel,
  normalizeElizaCloudLargeModel,
  normalizeElizaCloudSmallModel,
} from "./answers/model-normalization";
import { buildNativeOnboardingMirror } from "./answers/native-onboarding";
import { reviewWizardAnswers } from "./answers/review";
import { summarizeAnswers } from "./answers/summary";
import type { ReviewResult, WizardAnswers } from "./types";

export type { NativeOnboardingMirrorResult } from "./answers/types";
export {
  buildNativeOnboardingMirror,
  createHeadlessAnswers,
  DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
  DEFAULT_ELIZA_CLOUD_LARGE_MODEL,
  DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
  normalizeElizaCloudEmbeddingModel,
  normalizeElizaCloudLargeModel,
  normalizeElizaCloudSmallModel,
  readEnvBase,
  summarizeAnswers,
};

export function finalizeWizardAnswers(
  answers: WizardAnswers,
  linkedAccounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): ReviewResult {
  return reviewWizardAnswers(answers, linkedAccounts);
}
