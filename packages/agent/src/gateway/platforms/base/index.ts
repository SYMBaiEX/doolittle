export { capabilitiesForPlatform } from "./capabilities";
export {
  describeTransportHealth,
  formatTransportDisplayName,
  trackTransportStart,
} from "./display";
export { buildConfiguredTransportHealth } from "./health";
export {
  createLifecycleHistory,
  nowIso,
} from "./lifecycle";
export type {
  LifecycleHistory,
  PlatformAdapter,
  PlatformCapabilitySet,
  PlatformHealth,
  PlatformLifecycleEvent,
  PlatformMessageHandler,
  PlatformPresenceState,
  TransportHealthInput,
} from "./types";
