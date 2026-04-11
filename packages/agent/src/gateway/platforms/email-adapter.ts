import type { DeliveryService } from "@/services/delivery-service";
import type { PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import { CommandPlatformAdapter } from "./command-adapter";

export class EmailPlatformAdapter extends CommandPlatformAdapter {
  constructor(
    name: PlatformName,
    config: EnvConfig,
    delivery: DeliveryService,
  ) {
    super(
      name,
      delivery,
      config.emailSendCommand,
      "EMAIL_SEND_COMMAND is not configured.",
      "Email send command configured for outbound delivery and mirrored thread handling.",
    );
  }
}
