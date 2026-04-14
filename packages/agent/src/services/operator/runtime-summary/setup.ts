import { existsSync } from "node:fs";
import { getTransportRequirementRecords } from "@/gateway/transport";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import {
  createNativeServiceRegistry,
  describeNativeServiceRegistry,
} from "../../native-service-registry";
import { buildOperatorCondensedSummary } from "../summary";
import { resolveOwnership } from "./ownership";
import { buildProviderSummaries } from "./providers";
import { buildSetupReadinessSummary } from "./readiness";
import { describeTransportSummary } from "./transports";
import type { OperatorRuntimeSummaryDependencies } from "./types";

export async function buildOperatorSetupSummary(
  dependencies: OperatorRuntimeSummaryDependencies,
) {
  const linkedAccounts = getLinkedProviderAccountsSnapshot();
  const ecosystem = dependencies.agentSdk
    ? await dependencies.agentSdk.overview()
    : undefined;
  const ownership = resolveOwnership(dependencies);
  const transportControl = ownership?.transportControl;
  const pipeline = dependencies.autocoderPipeline?.summary();
  const workspaceEcosystem = dependencies.ecosystemService?.summary();
  const condensed = buildOperatorCondensedSummary({
    ownership,
    ecosystem,
    workspaceEcosystem,
    pipeline,
  });
  const directories = [
    {
      label: "workspace",
      path: dependencies.config.workspaceDir,
      exists: existsSync(dependencies.config.workspaceDir),
    },
    {
      label: "data",
      path: dependencies.config.dataDir,
      exists: existsSync(dependencies.config.dataDir),
    },
    {
      label: "skills",
      path: dependencies.config.skillsDir,
      exists: existsSync(dependencies.config.skillsDir),
    },
    {
      label: "gateway",
      path: dependencies.config.gatewayDataDir,
      exists: existsSync(dependencies.config.gatewayDataDir),
    },
  ];
  const providers = buildProviderSummaries(dependencies.config, linkedAccounts);
  const transports = getTransportRequirementRecords(
    dependencies.config,
    dependencies.diagnostics.currentGatewayConfig(),
  ).map((requirement) =>
    describeTransportSummary(
      requirement.platform,
      requirement.label,
      transportControl?.transportInventory,
      requirement.configured,
      requirement.summary,
    ),
  );
  const readiness = buildSetupReadinessSummary({
    directories,
    providers,
    transports,
    condensed,
  });

  return {
    readiness,
    version: dependencies.version(),
    directories,
    providers,
    transports,
    transportControl,
    transportInventory: transportControl?.transportInventory,
    nativeServices: describeNativeServiceRegistry(
      createNativeServiceRegistry(),
    ),
    ownership: condensed.ownership,
    ecosystem: condensed.ecosystem,
    pluginManager: condensed.pluginManager,
    pipeline: condensed.pipeline,
    checklist: await dependencies.diagnostics.setupChecklist(),
  };
}
