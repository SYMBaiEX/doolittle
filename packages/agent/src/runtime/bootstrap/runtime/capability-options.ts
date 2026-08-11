import type { AgentRuntime } from "@elizaos/core";

type AgentRuntimeOptions = ConstructorParameters<typeof AgentRuntime>[0];

type DoolittleRuntimeCapabilityOptions = Pick<
  AgentRuntimeOptions,
  | "enableAutonomy"
  | "enableDocuments"
  | "enableExtendedCapabilities"
  | "enableRelationships"
  | "enableSecretsManager"
  | "enableTrajectories"
>;

/**
 * Keep Doolittle's required Eliza capability ownership explicit.
 *
 * Documents, relationships, and trajectories default to enabled in beta.7,
 * but they are bootstrap-critical product dependencies. Declaring them here
 * prevents an upstream default change from silently removing those services.
 * The autonomy surface is mounted separately while its background loop remains
 * an operator opt-in.
 */
export const DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS = {
  enableAutonomy: false,
  enableDocuments: true,
  enableExtendedCapabilities: true,
  enableRelationships: true,
  enableSecretsManager: true,
  enableTrajectories: true,
} as const satisfies DoolittleRuntimeCapabilityOptions;
