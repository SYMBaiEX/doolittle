export { applyOperation, applyOperationsToLines } from "./engine";
export { editDistance, fuzzyMatch, normaliseLine } from "./matching";
export {
  parsePatchOperations,
  parseSearchReplaceBlocks,
  parseUnifiedDiff,
} from "./parsers";
export { FuzzyPatchService, fuzzyPatcher } from "./service";
export type {
  FuzzyPatchOptions,
  PatchOperation,
  PatchResult,
} from "./types";
