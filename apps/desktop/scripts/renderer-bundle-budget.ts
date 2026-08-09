import { readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RendererBundleEntry {
  name: string;
  bytes: number;
}

interface BundleBudget {
  label: string;
  pattern: RegExp;
  maxBytes: number;
  required?: boolean;
}

export const MAX_RENDERER_JAVASCRIPT_BYTES = 20_000_000;

export const RENDERER_BUNDLE_BUDGETS: readonly BundleBudget[] = [
  {
    label: "initial renderer entry",
    pattern: /^index-[^.]+\.js$/u,
    maxBytes: 1_000_000,
    required: true,
  },
  {
    label: "chat route",
    pattern: /^ChatPage-[^.]+\.js$/u,
    maxBytes: 180_000,
    required: true,
  },
  {
    label: "orchestration route",
    pattern: /^OrchestrationPage-[^.]+\.js$/u,
    maxBytes: 180_000,
    required: true,
  },
  {
    label: "coding workspace route",
    pattern: /^CodingWorkspacePage-[^.]+\.js$/u,
    maxBytes: 550_000,
    required: true,
  },
];

export function rendererBundleBudgetFailures(
  entries: readonly RendererBundleEntry[],
  budgets: readonly BundleBudget[] = RENDERER_BUNDLE_BUDGETS,
): string[] {
  const failures: string[] = [];
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total > MAX_RENDERER_JAVASCRIPT_BYTES) {
    failures.push(
      `renderer JavaScript total ${total} exceeds ${MAX_RENDERER_JAVASCRIPT_BYTES} bytes`,
    );
  }
  for (const budget of budgets) {
    const matches = entries.filter((entry) => budget.pattern.test(entry.name));
    if (budget.required && matches.length === 0) {
      failures.push(`${budget.label} bundle was not emitted`);
      continue;
    }
    for (const entry of matches) {
      if (entry.bytes > budget.maxBytes) {
        failures.push(
          `${budget.label} ${entry.name} is ${entry.bytes} bytes; limit ${budget.maxBytes}`,
        );
      }
    }
  }
  return failures;
}

function collectJavaScript(directory: string): RendererBundleEntry[] {
  const entries: RendererBundleEntry[] = [];
  const visit = (current: string) => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.isFile() && item.name.endsWith(".js")) {
        entries.push({ name: basename(path), bytes: statSync(path).size });
      }
    }
  };
  visit(directory);
  return entries;
}

function main() {
  const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
  const assetsDir = resolve(desktopRoot, "dist/renderer/assets");
  const entries = collectJavaScript(assetsDir);
  const failures = rendererBundleBudgetFailures(entries);
  if (failures.length > 0) {
    throw new Error(
      `Renderer bundle budget failed:\n- ${failures.join("\n- ")}`,
    );
  }
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(
    `Renderer bundle budget passed: ${entries.length} JavaScript assets, ${(total / 1_000_000).toFixed(2)} MB total.`,
  );
}

if (import.meta.main) main();
