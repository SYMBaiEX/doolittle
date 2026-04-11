import { arch, hostname, platform, release } from "node:os";

interface PersonalitySnapshot {
  name: string;
  description: string;
  systemAddendum: string;
}

interface SettingsSnapshot {
  execution: {
    backend: string;
  };
  model: {
    provider: string;
    model: string;
  };
}

function renderHostEnvironment(settings: SettingsSnapshot): string {
  return [
    `- os=${platform()} ${release()}`,
    `- arch=${arch()}`,
    `- hostname=${hostname()}`,
    `- executionBackend=${settings.execution.backend}`,
    `- modelProvider=${settings.model.provider}`,
    `- model=${settings.model.model}`,
    "- terminal=available via local terminal service and /terminal run",
  ].join("\n");
}

export function renderIdentitySections(
  personality: PersonalitySnapshot,
  settings: SettingsSnapshot,
): string[] {
  return [
    "ACTIVE PERSONALITY",
    `${personality.name}: ${personality.description}`,
    personality.systemAddendum,
    "",
    "HOST ENVIRONMENT",
    renderHostEnvironment(settings),
  ];
}
