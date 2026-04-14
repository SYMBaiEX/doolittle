export function inferCategory(fullText: string): string {
  const categories: Array<[string, RegExp]> = [
    [
      "software-development",
      /\b(?:code|function|class|typescript|javascript|python|rust|go|compile|build|test)\b/iu,
    ],
    [
      "data-science",
      /\b(?:dataset|dataframe|pandas|numpy|analysis|plot|chart|model|train)\b/iu,
    ],
    [
      "operations",
      /\b(?:deploy|docker|kubernetes|ssh|server|nginx|systemd|cron|daemon)\b/iu,
    ],
    [
      "research",
      /\b(?:research|analyse|investigate|compare|benchmark|evaluate|study)\b/iu,
    ],
    [
      "automation",
      /\b(?:automate|script|workflow|pipeline|schedule|batch)\b/iu,
    ],
    [
      "documentation",
      /\b(?:document|readme|wiki|guide|spec|rfc|changelog)\b/iu,
    ],
    ["productivity", /\b(?:task|todo|plan|organize|manage|track|project)\b/iu],
  ];

  for (const [category, pattern] of categories) {
    if (pattern.test(fullText)) {
      return category;
    }
  }
  return "general";
}
