import type { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { ReviewResult, WizardAnswers } from "../types";
import { readEnvBase } from "./base-env";
import { createHeadlessAnswers } from "./headless";
import {
  DEFAULT_ELIZA_CLOUD_EMBEDDING_MODEL,
  DEFAULT_ELIZA_CLOUD_LARGE_MODEL,
  DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
  normalizeElizaCloudEmbeddingModel,
  normalizeElizaCloudLargeModel,
  normalizeElizaCloudSmallModel,
} from "./model-normalization";
import { reviewWizardAnswers } from "./review";
import { summarizeAnswers } from "./summary";

export {
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
