import type { DeliveryService } from "@/services/delivery-service";
import type { EnvConfig, PlatformName } from "@/types";
import { CommandPlatformAdapter } from "./command-adapter";

export class SignalPlatformAdapter extends CommandPlatformAdapter {
  constructor(
    name: PlatformName,
    config: EnvConfig,
    delivery: DeliveryService,
  ) {
    super(
      name,
      delivery,
      config.signalCliCommand,
      "SIGNAL_CLI_COMMAND is not configured.",
      "Signal CLI command configured for inbound continuity and outbound delivery.",
    );
  }
}
