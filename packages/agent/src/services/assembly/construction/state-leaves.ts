import { join } from "node:path";
import { ContextCompressionService } from "../../context-compression";
import { ContextFilesService } from "../../context-files-service";
import { DeliveryService } from "../../delivery-service";
import { ExecutionApprovalService } from "../../execution-approval/service";
import { FuzzyPatchService } from "../../fuzzy-patch";
import { GatewayPairingProjection } from "../../gateway-pairing";
import { GatewaySessionService } from "../../gateway-session-service";
import { HooksService } from "../../hooks-service";
import { createLazySlot } from "../../lazy-slot";
import { MediaService } from "../../media";
import { PersonalityService } from "../../personality-service";
import { TerminalService } from "../../terminal/service";
import { TrajectoryService } from "../../trajectory/service";
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
  core: Pick<ServiceConstructionCore, "sessions" | "runController">;
}) {
  const { config, directories, bootstrap, core } = params;
  const { settings, resolveModelContext, defaultModelConfig, gatewayConfig } =
    bootstrap;

  return {
    contextFiles: createLazySlot(
      () => new ContextFilesService(() => config.workspaceDir),
    ),
    media: createLazySlot(
      () =>
        new MediaService(
          () => config.workspaceDir,
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
          core.runController,
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
    pairing: new GatewayPairingProjection(
      Object.keys(gatewayConfig.platforms) as Array<
        keyof ServiceBootstrapState["gatewayConfig"]["platforms"]
      >,
      join(directories.gatewayPairingDir, "pairing.json"),
    ),
    hooks: new HooksService(directories.hooksDir),
    personalities: new PersonalityService(config.dataDir),
    workspace: new WorkspaceService(() => config.workspaceDir),
    terminal: new TerminalService(
      directories.terminalDir,
      () => config.workspaceDir,
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
  };
}
