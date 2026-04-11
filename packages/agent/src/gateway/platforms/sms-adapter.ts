import type { DeliveryService } from "@/services/delivery-service";
import type { PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import { CommandPlatformAdapter } from "./command-adapter";

export class SmsPlatformAdapter extends CommandPlatformAdapter {
  constructor(
    name: PlatformName,
    config: EnvConfig,
    delivery: DeliveryService,
  ) {
    super(
      name,
      delivery,
      config.smsSendCommand,
      "SMS_SEND_COMMAND is not configured.",
      "SMS send command configured for outbound delivery and threadless continuations.",
    );
  }
}
