import { readFileSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type { DesktopLifecycleState } from "./desktop-lifecycle";
import { DEFAULT_DESKTOP_LIFECYCLE_STATE } from "./desktop-lifecycle";

export class DesktopPreferences {
  private state: DesktopLifecycleState = { ...DEFAULT_DESKTOP_LIFECYCLE_STATE };
  constructor(private readonly path: string) {
    try {
      const value = JSON.parse(
        readFileSync(path, "utf8"),
      ) as Partial<DesktopLifecycleState>;
      if (typeof value.keepRunningInBackground === "boolean")
        this.state.keepRunningInBackground = value.keepRunningInBackground;
    } catch {
      /* A missing or invalid preference file uses the conservative default. */
    }
  }
  getState = (): DesktopLifecycleState => ({ ...this.state });
  setBackgroundMode(enabled: boolean): DesktopLifecycleState {
    this.state = { keepRunningInBackground: enabled };
    writeJsonAtomicSync(this.path, this.state, { indent: 0 });
    return this.getState();
  }
}
