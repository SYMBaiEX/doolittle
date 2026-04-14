import type {
  ExecutionBodySelectionResult,
  ExecutionBodyTargetSelectionResult,
} from "./types";

export function assembleExecutionBodySelection(
  backend: ExecutionBodySelectionResult["backend"],
  browser: ExecutionBodySelectionResult["browser"],
  targets: ExecutionBodyTargetSelectionResult,
): ExecutionBodySelectionResult {
  return {
    backend,
    browser,
    ...targets,
  };
}
