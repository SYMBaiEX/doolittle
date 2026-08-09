export { default, localSandboxPlugin } from "./plugin";
export { LocalSandboxService } from "./service";
export type {
  E2BExecutionResult,
  E2BSandboxOptions,
  E2BSandboxRecord,
  LocalSandboxServiceOptions,
  SandboxOwnerRecord,
  SupportedSandboxTemplate,
} from "./types";
export {
  SandboxCleanupVerificationError,
  SandboxClosingError,
  SandboxNotFoundError,
  SandboxOwnershipError,
  UnsupportedSandboxTemplateError,
} from "./types";
