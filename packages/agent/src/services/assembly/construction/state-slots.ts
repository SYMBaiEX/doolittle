import { AutocoderPipelineService } from "../../autocoder-pipeline/service";
import { createToolsDynamicStateResolver } from "../../bootstrap/tools";
import { createLazySlot } from "../../lazy-slot";
import {
  createDiagnosticsServiceSlot,
  createEcosystemServiceSlot,
  createOperatorServiceSlot,
  createSkillsServiceSlot,
} from "../../service-slots";
import { SkillSynthesisService } from "../../skill-synthesis/service";
import { SkillsHubService } from "../../skills-hub/service";
import { ToolsService } from "../../tools/service";
import type {
  RuntimeModelContextResolver,
  ServiceBootstrapState,
} from "../service-bootstrap";
import type { ServiceNativeWiring } from "../service-native";
import type { ServiceConstructionCore } from "./state-core";
import type { ServiceConstructionInput } from "./types";

export function createServiceConstructionSlots(params: {
  config: ServiceConstructionInput["config"];
  runtime: ServiceConstructionInput["runtime"];
  bootstrap: ServiceBootstrapState & {
    resolveModelContext: RuntimeModelContextResolver;
  };
  directories: ServiceConstructionInput["directories"];
  native: ServiceNativeWiring;
  core: ServiceConstructionCore;
}): Pick<
  ReturnType<typeof import("./state").createServiceConstructionState>,
  | "ecosystem"
  | "autocoderPipeline"
  | "diagnostics"
  | "operator"
  | "skills"
  | "skillSynthesis"
  | "skillsHub"
  | "tools"
> {
  const { config, runtime, bootstrap, directories, native, core } = params;
  const { gatewayConfig, settings, nativeOwnership, startupState } = bootstrap;

  const ecosystem = createEcosystemServiceSlot(startupState);
  const autocoderPipeline = createLazySlot(
    () => new AutocoderPipelineService(directories.autocoderDir),
  );
  const diagnostics = createDiagnosticsServiceSlot({
    config,
    gatewayConfig,
    agentSdk: core.agentSdk,
    nativeOwnership,
    ecosystem,
    settings,
    runController: core.runController,
    startupState,
    awareness: core.awareness,
    runtime,
  });
  const operator = createOperatorServiceSlot({
    config,
    diagnostics,
    repository: core.repository,
    autocoderPipeline,
    agentSdk: core.agentSdk,
    nativeOwnership,
    ecosystem,
    startupState,
    runtime: runtime
      ? {
          attachRuntime: (nextRuntime) => {
            void nextRuntime;
          },
        }
      : undefined,
  });
  const skills = createSkillsServiceSlot({
    config,
    agentSdk: core.agentSdk,
    startupState,
  });
  const skillSynthesis = createLazySlot(
    () => new SkillSynthesisService(config.skillsDir),
  );
  const skillsHub = createLazySlot(
    () =>
      new SkillsHubService(
        skills.get(),
        skillSynthesis.get(),
        core.agentSdk,
        config.dataDir,
      ),
  );
  const tools = new ToolsService(
    createToolsDynamicStateResolver({
      mcp: core.mcp,
      acp: core.acp,
      nativePluginCatalog: () =>
        native.nativePluginCatalog.get().map((entry) => ({
          id: entry.id,
          category: entry.category,
          source: entry.source,
          enabled: entry.enabled,
          notes: entry.notes,
        })),
      nativePackageAudit: () => native.nativePackageAudit.get(),
      agentSdk: core.agentSdk,
      skillsHub: {
        summary: () => skillsHub.get().summary(),
      },
      ecosystem: {
        summary: () => ecosystem.get().summary(),
      },
      nativeOwnership,
    }),
  );

  core.setTools(tools);

  return {
    ecosystem,
    autocoderPipeline,
    diagnostics,
    operator,
    skills,
    skillSynthesis,
    skillsHub,
    tools,
  };
}
