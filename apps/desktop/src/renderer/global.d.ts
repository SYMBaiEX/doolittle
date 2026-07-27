import type { DoolittleDesktopBridge } from "../shared/contracts";

declare global {
  interface Window {
    doolittle: DoolittleDesktopBridge;
  }
}
