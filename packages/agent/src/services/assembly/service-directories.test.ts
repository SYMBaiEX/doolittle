import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types";
import { createServiceDirectoryLayout } from "./service-directories";

type ServiceDirectoryConfig = Pick<
  EnvConfig,
  "dataDir" | "workspaceDir" | "gatewayDataDir" | "hooksDir"
> & {
  webDir?: string;
};

describe("createServiceDirectoryLayout", () => {
  it("resolves canonical service directories", () => {
    const config = {
      dataDir: "/tmp/doolittle/data",
      workspaceDir: "/tmp/doolittle/workspace",
      gatewayDataDir: "/tmp/doolittle/gateway",
      hooksDir: "/tmp/doolittle/hooks",
      webDir: "/tmp/doolittle/web",
    } as ServiceDirectoryConfig;

    const layout = createServiceDirectoryLayout(config);

    expect(layout).toEqual({
      apiDir: "/tmp/doolittle/data/api",
      workspaceDir: "/tmp/doolittle/workspace",
      gatewayPairingDir: "/tmp/doolittle/gateway/pairing",
      gatewaySessionDir: "/tmp/doolittle/gateway/sessions",
      gatewayApprovalDir: "/tmp/doolittle/gateway/approvals",
      gatewayDeliveryDir: "/tmp/doolittle/gateway/delivery",
      autocoderDir: "/tmp/doolittle/data/autocoder",
      cronDir: "/tmp/doolittle/data/cron",
      delegationDir: "/tmp/doolittle/data/delegation",
      hooksDir: "/tmp/doolittle/hooks",
      terminalDir: "/tmp/doolittle/data/terminal",
      webDir: "/tmp/doolittle/web",
      mediaDir: "/tmp/doolittle/data/media",
      trajectoriesDir: "/tmp/doolittle/data/trajectories",
      profilesDir: "/tmp/doolittle/data/profiles",
      personalityDir: "/tmp/doolittle/data",
      traitsDir: "/tmp/doolittle/workspace",
      settingsDir: "/tmp/doolittle/data",
    });
  });

  it("falls back to data/web directory when webDir is unset", () => {
    const config: ServiceDirectoryConfig = {
      dataDir: "/tmp/data",
      workspaceDir: "/tmp/workspace",
      gatewayDataDir: "/tmp/gateway",
      hooksDir: "/tmp/hooks",
      webDir: undefined,
    };

    const layout = createServiceDirectoryLayout(config);

    expect(layout.webDir).toBe("/tmp/data/web");
  });
});
