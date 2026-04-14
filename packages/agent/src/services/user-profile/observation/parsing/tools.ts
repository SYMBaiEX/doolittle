const knownTools = [
  "Bun",
  "Docker",
  "Podman",
  "SSH",
  "Lightpanda",
  "Claude",
  "OpenAI",
  "Anthropic",
  "Telegram",
  "Discord",
  "Slack",
  "WhatsApp",
  "Matrix",
  "Signal",
  "Mattermost",
  "Home Assistant",
  "DingTalk",
] as const;

export function detectTools(observation: string): string[] {
  const lower = observation.toLowerCase();
  return knownTools.filter((tool) => lower.includes(tool.toLowerCase()));
}
