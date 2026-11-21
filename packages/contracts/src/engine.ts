/** Production shared-engine fleet limits; custom host test overrides may differ. */
export const SHARED_ENGINE_MAX_WORKERS = 64;
export const SHARED_ENGINE_DEFAULT_CONCURRENT_STARTS = 2;
export const SHARED_ENGINE_DEFAULT_BOOT_TIMEOUT_MS = 45_000;
export const SHARED_ENGINE_STOP_CONTROL_TIMEOUT_MS = 45_000;

/** Report the bound private API over the owned desktop child IPC. */
export const DESKTOP_RUNTIME_LISTENING =
  "doolittle-desktop-runtime-listening-v1";

/** Sent over the owned desktop child IPC after the API identity is verified. */
export const DESKTOP_RUNTIME_READY_ACK = "doolittle-desktop-runtime-ready-v1";

// A host may use one bootstrap slot. The final resident can wait through 63
// bounded boots and its own boot; one extra window covers IPC scheduling.
export const SHARED_ENGINE_START_CONTROL_TIMEOUT_MS =
  (SHARED_ENGINE_MAX_WORKERS + 1) * SHARED_ENGINE_DEFAULT_BOOT_TIMEOUT_MS;
