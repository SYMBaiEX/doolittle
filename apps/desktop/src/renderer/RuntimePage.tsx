import { Tabs, TabsContent } from "@elizaos/ui/components/ui/tabs";
import { Activity, Box, Cpu, Network, RotateCw } from "lucide-react";
import { useState } from "react";
import type {
  AccountPoolResponse,
  PluginsResponse,
  RuntimeStatus,
} from "../shared/contracts";
import type { NativeAutonomyResponse } from "./components/NativeAutonomyPanel";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { WorkbenchAction } from "./components/workbench/Workbench";
import { type UnknownRecord, useApiResource } from "./lib";
import {
  type GatewayHealthResponse,
  type GatewayRuntimeResponse,
  type RuntimeSection,
  runtimeResourcePolicy,
} from "./runtime/models";
import { RuntimeGateway } from "./runtime/RuntimeGateway";
import { RuntimeInventory } from "./runtime/RuntimeInventory";
import { RuntimeOverview } from "./runtime/RuntimeOverview";
import { DiagnosticWorkspace } from "./runtime-state/DiagnosticWorkspace";
import {
  RuntimeSectionNav,
  type RuntimeSectionOption,
} from "./runtime-state/RuntimeSectionNav";

const RUNTIME_SECTIONS: RuntimeSectionOption<RuntimeSection>[] = [
  {
    id: "overview",
    label: "Overview",
    detail: "Model, accounts, autonomy",
    icon: Activity,
  },
  {
    id: "gateway",
    label: "Gateway",
    detail: "Transports and deliveries",
    icon: Network,
  },
  {
    id: "inventory",
    label: "Inventory",
    detail: "Plugins and ecosystem",
    icon: Box,
  },
];

export function RuntimePage({
  active,
  readOnly = false,
  onOpenProviders,
}: {
  active: boolean;
  readOnly?: boolean;
  onOpenProviders?: () => void;
}) {
  const [section, setSection] = useState<RuntimeSection>("overview");
  const policy = runtimeResourcePolicy(section, active);
  const runtime = useApiResource<RuntimeStatus>(
    policy.runtime ? "/runtime/status" : null,
    [policy.runtime],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    policy.accountPool ? "/runtime/account-pool" : null,
    [policy.accountPool],
  );
  const autonomy = useApiResource<NativeAutonomyResponse>(
    policy.autonomy ? "/autonomy/status" : null,
    [policy.autonomy],
  );
  const gatewayHealth = useApiResource<GatewayHealthResponse>(
    policy.gatewayHealth ? "/gateway/health" : null,
    [policy.gatewayHealth],
  );
  const gatewayRuntime = useApiResource<GatewayRuntimeResponse>(
    policy.gatewayRuntime ? "/gateway/runtime" : null,
    [policy.gatewayRuntime],
  );
  const plugins = useApiResource<PluginsResponse>(
    policy.plugins ? "/runtime/plugins?view=catalog" : null,
    [policy.plugins],
  );
  const ecosystem = useApiResource<UnknownRecord>(
    policy.ecosystem ? "/runtime/ecosystem" : null,
    [policy.ecosystem],
  );
  const insights = useApiResource<UnknownRecord>(
    policy.insights ? "/insights" : null,
    [policy.insights],
  );

  const reloadVisibleSection = () => {
    if (!active) return;
    if (policy.runtime) runtime.reload();
    if (policy.accountPool) accountPool.reload();
    if (policy.autonomy) autonomy.reload();
    if (policy.gatewayHealth) gatewayHealth.reload();
    if (policy.gatewayRuntime) gatewayRuntime.reload();
    if (policy.plugins) plugins.reload();
    if (policy.ecosystem) ecosystem.reload();
    if (policy.insights) insights.reload();
  };

  return (
    <DiagnosticWorkspace
      actions={
        <WorkbenchAction
          disabled={!active}
          icon={RotateCw}
          onClick={reloadVisibleSection}
        >
          Refresh{" "}
          {RUNTIME_SECTIONS.find((entry) => entry.id === section)?.label}
        </WorkbenchAction>
      }
      className="@container/runtime"
      description="Inspect the active model, local services, and gateway."
      icon={Cpu}
      title="Runtime"
      titleHidden
    >
      {!active ? (
        <OfflineRouteState>
          Runtime diagnostics and capability inventory are unavailable until the
          local runtime is ready.
        </OfflineRouteState>
      ) : (
        <Tabs
          className="grid min-h-0 gap-3"
          onValueChange={(value) => setSection(value as RuntimeSection)}
          value={section}
        >
          <RuntimeSectionNav
            ariaLabel="Runtime sections"
            sections={RUNTIME_SECTIONS}
          />

          <TabsContent className="min-h-0" value="overview">
            <RuntimeOverview
              active={active}
              accountPool={accountPool}
              autonomy={autonomy}
              onOpenProviders={onOpenProviders}
              runtime={runtime}
              readOnly={readOnly}
            />
          </TabsContent>
          <TabsContent className="min-h-0" value="gateway">
            <RuntimeGateway
              active={active}
              gatewayHealth={gatewayHealth}
              gatewayRuntime={gatewayRuntime}
            />
          </TabsContent>
          <TabsContent className="min-h-0" value="inventory">
            <RuntimeInventory
              active={active}
              ecosystem={ecosystem}
              insights={insights}
              plugins={plugins}
            />
          </TabsContent>
        </Tabs>
      )}
    </DiagnosticWorkspace>
  );
}
