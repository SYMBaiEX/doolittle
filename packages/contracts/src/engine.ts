/** Production shared-engine fleet limits; custom host test overrides may differ. */
export const SHARED_ENGINE_MAX_WORKERS = 64;
export const SHARED_ENGINE_DEFAULT_CONCURRENT_STARTS = 2;
export const SHARED_ENGINE_DEFAULT_BOOT_TIMEOUT_MS = 45_000;
export const SHARED_ENGINE_STOP_CONTROL_TIMEOUT_MS = 45_000;

// A host may use one bootstrap slot. The final resident can wait through 63
// bounded boots and its own boot; one extra window covers IPC scheduling.
export const SHARED_ENGINE_START_CONTROL_TIMEOUT_MS =
  (SHARED_ENGINE_MAX_WORKERS + 1) * SHARED_ENGINE_DEFAULT_BOOT_TIMEOUT_MS;
