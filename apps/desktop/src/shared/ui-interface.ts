import type {
  UiHostCommand,
  UiHostEvent,
  UiHostResult,
  UiSnapshot,
  UiTarget,
} from "@doolittle/contracts/ui-host";
import type {
  UiPluginArtifactIdentity,
  UiPluginCapability,
  UiPluginContributionSelection,
  UiPluginManifestV1,
} from "@doolittle/contracts/ui-plugin";

export const uiInterfaceChannels = {
  snapshot: "desktop-ui:snapshot",
  dispatch: "desktop-ui:dispatch",
  subscribe: "desktop-ui:subscribe",
  unsubscribe: "desktop-ui:unsubscribe",
  event: "desktop-ui:event",
  state: "desktop-ui:state",
  stateChanged: "desktop-ui:state-changed",
  install: "desktop-ui:install",
  activate: "desktop-ui:activate",
  restore: "desktop-ui:restore",
  revoke: "desktop-ui:revoke",
  stopAll: "desktop-ui:stop-all",
  surface: "desktop-ui:surface",
  returnToInterface: "desktop-ui:return-to-interface",
  selectContribution: "desktop-ui:select-contribution",
} as const;

export interface InstalledUiInterface {
  identity: UiPluginArtifactIdentity;
  name: string;
  trustTier: UiPluginManifestV1["trustTier"];
  requestedCapabilities: UiPluginCapability[];
  contributions: UiPluginManifestV1["contributions"];
}

export interface UiInterfaceState {
  mode: "default" | "trusted-react" | "community-static";
  active?: InstalledUiInterface;
  /** Approved, digest-bound native protocol URL. Never a renderer-provided path. */
  entryUrl?: string;
  installed: InstalledUiInterface[];
  safeMode: boolean;
  recovery?: string;
  selectedContribution?: UiPluginContributionSelection;
  /** A host-owned surface temporarily covers a renderer without replacing it. */
  hostSurface?: {
    target: UiTarget;
    surface: "details" | "library" | "computer";
  };
}

export interface UiInterfaceActivation {
  identity: UiPluginArtifactIdentity;
  capabilities?: UiPluginCapability[];
  targets?: UiTarget[];
}

/** Main-window only. Community renderers receive the separate minimal broker. */
export interface DesktopUiInterfaceBridge {
  getSnapshot(): Promise<UiSnapshot>;
  dispatch(command: UiHostCommand): Promise<UiHostResult>;
  subscribe(subscriptionId: string, after?: number): Promise<void>;
  unsubscribe(subscriptionId: string): Promise<void>;
  onEvent(
    listener: (event: { subscriptionId: string; value: UiHostEvent }) => void,
  ): () => void;
  getState(): Promise<UiInterfaceState>;
  onState(listener: (state: UiInterfaceState) => void): () => void;
  install(): Promise<UiInterfaceState>;
  activate(request: UiInterfaceActivation): Promise<UiInterfaceState>;
  restore(): Promise<UiInterfaceState>;
  revoke(identity: UiPluginArtifactIdentity): Promise<UiInterfaceState>;
  stopAll(): Promise<void>;
  returnToInterface(): Promise<UiInterfaceState>;
  selectContribution(
    selection?: UiPluginContributionSelection,
  ): Promise<UiInterfaceState>;
  onSurface(
    listener: (request: {
      target: UiTarget;
      surface: "details" | "library" | "computer";
    }) => void,
  ): () => void;
}
