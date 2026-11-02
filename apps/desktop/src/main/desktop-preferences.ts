import { readOptionalJson } from "@doolittle/storage";

import { writeJsonAtomicSync } from "@elizaos/core";
import type { DesktopLifecycleState } from "./desktop-lifecycle";
import { DEFAULT_DESKTOP_LIFECYCLE_STATE } from "./desktop-lifecycle";

export class DesktopPreferences {
  private state: DesktopLifecycleState = { ...DEFAULT_DESKTOP_LIFECYCLE_STATE };
  constructor(private readonly path: string) {
    const value = readOptionalJson<Partial<DesktopLifecycleState>>(path);
    if (typeof value?.keepRunningInBackground === "boolean")
      this.state.keepRunningInBackground = value.keepRunningInBackground;
  }
  getState = (): DesktopLifecycleState => ({ ...this.state });
  setBackgroundMode(enabled: boolean): DesktopLifecycleState {
    this.state = { keepRunningInBackground: enabled };
    writeJsonAtomicSync(this.path, this.state, { indent: 0 });
    return this.getState();
  }
}
