import type { GatewayConfig, WizardAnswers } from "../types";
import { REMOTE_TRANSPORTS } from "./defaults";

export function buildBootstrapGateway(
  gateway: GatewayConfig,
  answers: WizardAnswers,
): GatewayConfig {
  const nextGateway = {
    ...gateway,
    allowAllUsers: answers.allowAllUsers,
    platforms: { ...gateway.platforms },
  } satisfies GatewayConfig;

  nextGateway.platforms.api.enabled = true;
  nextGateway.platforms.api.pairingMode = "allow";
  nextGateway.platforms.api.allowAllUsers = true;
  nextGateway.platforms.cli.enabled = true;
  nextGateway.platforms.cli.pairingMode = "allow";
  nextGateway.platforms.cli.allowAllUsers = true;

  for (const platform of REMOTE_TRANSPORTS) {
    nextGateway.platforms[platform].enabled =
      answers.transports.includes(platform);
    nextGateway.platforms[platform].pairingMode = answers.pairingMode;
    nextGateway.platforms[platform].allowAllUsers = answers.allowAllUsers
      ? true
      : undefined;
  }

  return nextGateway;
}
