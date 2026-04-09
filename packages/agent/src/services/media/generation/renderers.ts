function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderGenerationSvg(
  prompt: string,
  size: string,
  notes: string[] = [],
): string {
  const excerpt = prompt.replace(/\s+/gu, " ").slice(0, 220);
  const width = 1200;
  const height = 700;
  const lines = [
    "Doolittle Image Concept",
    `Prompt: ${excerpt}`,
    `Size: ${size}`,
    ...(notes.length
      ? notes
      : ["Generated from the configured image pipeline or offline fallback."]),
  ];
  const rows = lines
    .map(
      (line, index) =>
        `<text x="32" y="${80 + index * 42}" fill="#e5eefc" font-family="ui-monospace, SFMono-Regular, monospace" font-size="20">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="24" fill="rgba(15, 23, 42, 0.72)" stroke="#60a5fa" stroke-width="2"/>
  <text x="32" y="52" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="700">Doolittle Browserless Image Concept</text>
  ${rows}
</svg>`;
}

export function renderSpeechSvg(
  text: string,
  voice: string,
  speed?: number,
): string {
  const excerpt = text.replace(/\s+/gu, " ").slice(0, 220);
  const rows = [
    `Voice: ${voice}`,
    speed ? `Speed: ${speed}` : "Speed: default",
    `Narration: ${excerpt}`,
    "Generated from the configured speech pipeline or offline fallback.",
  ]
    .map(
      (line, index) =>
        `<text x="32" y="${90 + index * 44}" fill="#e5eefc" font-family="ui-monospace, SFMono-Regular, monospace" font-size="20">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#081120"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="700" fill="url(#bg)"/>
  <rect x="24" y="24" width="1152" height="652" rx="24" fill="rgba(15, 23, 42, 0.76)" stroke="#7dd3fc" stroke-width="2"/>
  <text x="32" y="52" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="700">Doolittle Speech Concept</text>
  ${rows}
</svg>`;
}
