import { ContextCompressionService } from "../../context-compression";
import { ContextFilesService } from "../../context-files-service";
import { DeliveryService } from "../../delivery-service";
import { ExecutionApprovalService } from "../../execution-approval/service";
import { FuzzyPatchService } from "../../fuzzy-patch";
import { GatewaySessionService } from "../../gateway-session-service";
import { HooksService } from "../../hooks-service";
import { createLazySlot } from "../../lazy-slot";
import { MediaService } from "../../media";
import { PairingService } from "../../pairing-service";
import { PersonalityService } from "../../personality-service";
import { TerminalService } from "../../terminal/service";
import { TrajectoryService } from "../../trajectory/service";
import { UserProfileService } from "../../user-profile/service";
import { WebService } from "../../web/service";
import { WorkspaceService } from "../../workspace-service/index";
import type {
  RuntimeModelContextResolver,
  ServiceBootstrapState,
} from "../service-bootstrap";
import type { ServiceDirectoryLayout } from "../service-directories";
import type { ServiceConstructionCore } from "./state-core";
import type { ServiceConstructionInput } from "./types";

export function createServiceConstructionLeaves(params: {
  config: ServiceConstructionInput["config"];
  directories: ServiceDirectoryLayout;
  bootstrap: ServiceBootstrapState & {
    resolveModelContext: RuntimeModelContextResolver;
  };
  core: Pick<ServiceConstructionCore, "sessions">;
}) {
  const { config, directories, bootstrap, core } = params;
  const { settings, resolveModelContext, defaultModelConfig } = bootstrap;

  return {
    contextFiles: createLazySlot(
      () => new ContextFilesService(directories.workspaceDir),
    ),
    media: createLazySlot(
      () =>
        new MediaService(
          directories.workspaceDir,
          directories.mediaDir,
          resolveModelContext,
        ),
    ),
    trajectories: createLazySlot(
      () =>
        new TrajectoryService(
          directories.trajectoriesDir,
          core.sessions,
          resolveModelContext,
        ),
    ),
    contextCompression: createLazySlot(
      () =>
        new ContextCompressionService({
          contextWindowTokens: ContextCompressionService.resolveContextWindow(
            defaultModelConfig.defaultModel,
          ),
          threshold: 0.85,
          preserveRecentTurns: 6,
          preserveLeadingTurns: 2,
        }),
    ),
    fuzzyPatch: createLazySlot(
      () =>
        new FuzzyPatchService({
          maxEditDistance: 4,
          contextMatchRatio: 0.6,
        }),
    ),
    delivery: new DeliveryService(directories.gatewayDeliveryDir),
    gatewaySessions: new GatewaySessionService(directories.gatewaySessionDir),
    executionApprovals: new ExecutionApprovalService(
      directories.gatewayApprovalDir,
    ),
    pairing: new PairingService(directories.gatewayPairingDir),
    hooks: new HooksService(directories.hooksDir),
    personalities: new PersonalityService(config.dataDir),
    workspace: new WorkspaceService(directories.workspaceDir),
    terminal: new TerminalService(
      directories.terminalDir,
      directories.workspaceDir,
      () => settings.get(),
    ),
    web: new WebService(
      () => ({
        provider: config.browserProvider,
        command: config.browserCommand,
        cdpUrl: config.browserCdpUrl,
        obeyRobots: config.browserObeyRobots,
      }),
      directories.webDir,
    ),
    userProfiles: new UserProfileService(directories.profilesDir),
  };
}
