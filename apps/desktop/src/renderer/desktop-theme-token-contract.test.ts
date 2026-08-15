import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RENDERER_ROOT = fileURLToPath(new URL(".", import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const OFFICIAL_STYLE_FILES = [
  join(REPOSITORY_ROOT, "node_modules/@elizaos/ui/styles/base.css"),
  join(REPOSITORY_ROOT, "node_modules/@elizaos/ui/styles/tailwind-theme.css"),
];
const VARIABLE_USE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
const VARIABLE_DECLARATION = /(?:["']|[\s[,])(--[A-Za-z0-9_-]+)(?:["'])?\s*:/g;

function rendererSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return rendererSources(path);
      if (!/\.(?:css|ts|tsx)$/u.test(entry.name)) return [];
      if (/\.test\.(?:ts|tsx)$/u.test(entry.name)) return [];
      return [path];
    });
}

function matches(source: string, expression: RegExp): Set<string> {
  const result = new Set<string>();
  for (const match of source.matchAll(expression)) {
    const variable = match[1];
    if (variable) result.add(variable);
  }
  return result;
}

function unresolvedRendererVariables(): string[] {
  const sources = [
    ...rendererSources(RENDERER_ROOT),
    ...OFFICIAL_STYLE_FILES,
  ].map((path) => readFileSync(path, "utf8"));
  const used = new Set<string>();
  const declared = new Set<string>();
  for (const source of sources) {
    for (const variable of matches(source, VARIABLE_USE)) used.add(variable);
    // This includes root/foundation tokens as well as element-scoped dynamic
    // declarations such as project colours and resizable pane widths.
    for (const variable of matches(source, VARIABLE_DECLARATION)) {
      declared.add(variable);
    }
  }
  return [...used].filter((variable) => !declared.has(variable)).sort();
}

describe("desktop theme token contract", () => {
  it("resolves every renderer and official Eliza custom-property reference", () => {
    expect(unresolvedRendererVariables()).toEqual([]);
  });

  it("keeps compatibility aliases mapped through canonical Doolittle tokens", () => {
    const themeSource = readFileSync(
      join(RENDERER_ROOT, "desktop-theme.ts"),
      "utf8",
    );
    expect(themeSource).toContain('"--text-muted": "var(--muted)"');
    expect(themeSource).toContain('"--border-subtle": "var(--line-subtle)"');
    expect(themeSource).toContain('"--line-strong": "var(--border-strong)"');
    expect(themeSource).toContain('"--text-section": "var(--text)"');
    expect(themeSource).toContain('"--success": "var(--good)"');
    expect(themeSource).toContain('"--warning": "var(--warn)"');
    expect(themeSource).toContain('"--canvas-bg": "#080706"');
    expect(themeSource).toContain('"--canvas-text": "#f4f1eb"');
    expect(themeSource).toContain('"--canvas-text-soft": "#c9c3b9"');
    expect(themeSource).toContain('"--canvas-border": "#3a3630"');
  });
});
