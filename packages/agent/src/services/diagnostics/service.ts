import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { DiagnosticCheck, EnvConfig, GatewayConfig } from "@/types";
import type { AgentSdkService } from "../agent-sdk-service";
import type { AwarenessService } from "../awareness-service";
import type { EcosystemService } from "../ecosystem-service";
import type { RunControllerService } from "../run-controller-service";
import type { SettingsService } from "../settings-service";
import type { StartupStateService } from "../startup-state-service";
import {
  buildDiagnosticsFilesystemChecks,
  buildDiagnosticsInventoryChecks,
} from "./base-checks";
import { buildDiagnosticsProviderOwnershipChecks } from "./provider-ownership";
import { buildDiagnosticsRuntimeServiceChecks } from "./runtime-service-checks";
import { buildDiagnosticsSetupChecklist } from "./setup";
import type { DiagnosticsRunInput } from "./types";

export class DiagnosticsService {
  private runtime?: RuntimeLike;

  constructor(
    private readonly config: EnvConfig,
    private readonly gatewayConfig: GatewayConfig,
    private readonly agentSdk?: AgentSdkService,
    private readonly nativeOwnership?: NativeOwnershipCache,
    private readonly ecosystemService?: EcosystemService,
    private readonly settings?: SettingsService,
    private readonly runController?: RunControllerService,
    private readonly startupState?: StartupStateService,
    private readonly awareness?: AwarenessService,
  ) {}

  attachRuntime(runtime: RuntimeLike): void {
    this.runtime = runtime;
  }

  currentGatewayConfig(): GatewayConfig {
    return this.gatewayConfig;
  }

  async run(input: DiagnosticsRunInput): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    checks.push(
      ...(await buildDiagnosticsFilesystemChecks(
        this.config,
        this.isWritable.bind(this),
      )),
    );
    const {
      checks: providerOwnershipChecks,
      integrationControl,
      runtimeExecutionControl,
    } = await buildDiagnosticsProviderOwnershipChecks({
      config: this.config,
      gatewayConfig: this.gatewayConfig,
      runtime: this.runtime,
      nativeOwnership: this.nativeOwnership,
      agentSdk: this.agentSdk,
      ecosystemService: this.ecosystemService,
      gatewayTransportOverview: input.gatewayTransportOverview,
    });
    checks.push(...providerOwnershipChecks);
    checks.push(
      ...buildDiagnosticsInventoryChecks(
        this.config,
        this.gatewayConfig,
        input,
      ),
      ...buildDiagnosticsRuntimeServiceChecks({
        config: this.config,
        runtime: this.runtime,
        settings: this.settings,
        runController: this.runController,
        startupState: this.startupState,
        awareness: this.awareness,
        runtimeExecutionControl,
        integrationControl,
      }),
    );

    return checks;
  }

  async setupChecklist(): Promise<string[]> {
    return buildDiagnosticsSetupChecklist(this.config, this.gatewayConfig);
  }

  private async isWritable(path: string): Promise<boolean> {
    try {
      await access(path, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
