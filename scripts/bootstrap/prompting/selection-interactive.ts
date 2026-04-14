import { bootstrapColor, paint } from "../core/output";
import {
  clearRenderedMenu,
  readMenuKeypress,
  withRawMenuInput,
} from "./terminal-menu";
import type { SelectManyOption, SelectOneOption } from "./types";

export async function chooseOneInteractive<T extends string>(
  prompt: string,
  optionsList: SelectOneOption<T>[],
  defaultValue: T,
  options?: { onHighlight?: (value: T) => void },
): Promise<T> {
  return withRawMenuInput(async () => {
    let selectedIndex = Math.max(
      0,
      optionsList.findIndex((item) => item.value === defaultValue),
    );
    let renderedLines = 0;

    const render = () => {
      clearRenderedMenu(renderedLines);
      options?.onHighlight?.(optionsList[selectedIndex]?.value ?? defaultValue);
      const lines = [
        paint(prompt, bootstrapColor.cyan + bootstrapColor.bold),
        paint(
          "Use ↑/↓ to move, Enter to confirm, or press a number key.",
          bootstrapColor.dim,
        ),
      ];
      optionsList.forEach((item, index) => {
        const selected = index === selectedIndex ? "●" : "○";
        lines.push(`  ${selected} ${index + 1}. ${item.label}`);
        if (item.detail) {
          lines.push(`    ${item.detail}`);
        }
      });
      renderedLines = writeRenderedLines(lines);
    };

    render();
    while (true) {
      const key = await readMenuKeypress();
      if (key === "\u0003") {
        throw new Error("Installer interrupted.");
      }
      if (key === "\r" || key === "\n" || key === " ") {
        clearRenderedMenu(renderedLines);
        return optionsList[selectedIndex]?.value ?? defaultValue;
      }
      if (key === "\u001b[A") {
        selectedIndex =
          selectedIndex === 0 ? optionsList.length - 1 : selectedIndex - 1;
        render();
        continue;
      }
      if (key === "\u001b[B") {
        selectedIndex =
          selectedIndex === optionsList.length - 1 ? 0 : selectedIndex + 1;
        render();
        continue;
      }

      const numericIndex = toNumericIndex(key, optionsList.length);
      if (numericIndex !== null) {
        selectedIndex = numericIndex;
        render();
      }
    }
  });
}

export async function chooseManyInteractive<T extends string>(
  prompt: string,
  optionsList: SelectManyOption<T>[],
  defaults: T[],
): Promise<T[]> {
  return withRawMenuInput(async () => {
    const active = new Set(defaults);
    let cursorIndex = 0;
    let renderedLines = 0;

    const render = () => {
      clearRenderedMenu(renderedLines);
      const lines = [
        paint(prompt, bootstrapColor.cyan + bootstrapColor.bold),
        paint(
          "Use ↑/↓ to move, Space to toggle, Enter to confirm.",
          bootstrapColor.dim,
        ),
      ];
      optionsList.forEach((item, index) => {
        const cursor = index === cursorIndex ? "›" : " ";
        const selected = active.has(item.value) ? "●" : "○";
        lines.push(`  ${cursor} ${selected} ${index + 1}. ${item.label}`);
      });
      renderedLines = writeRenderedLines(lines);
    };

    render();
    while (true) {
      const key = await readMenuKeypress();
      if (key === "\u0003") {
        throw new Error("Installer interrupted.");
      }
      if (key === "\r" || key === "\n") {
        clearRenderedMenu(renderedLines);
        return optionsList
          .filter((item) => active.has(item.value))
          .map((item) => item.value);
      }
      if (key === " ") {
        toggleOption(active, optionsList[cursorIndex]);
        render();
        continue;
      }
      if (key === "\u001b[A") {
        cursorIndex =
          cursorIndex === 0 ? optionsList.length - 1 : cursorIndex - 1;
        render();
        continue;
      }
      if (key === "\u001b[B") {
        cursorIndex =
          cursorIndex === optionsList.length - 1 ? 0 : cursorIndex + 1;
        render();
        continue;
      }

      const numericIndex = toNumericIndex(key, optionsList.length);
      if (numericIndex !== null) {
        cursorIndex = numericIndex;
        toggleOption(active, optionsList[cursorIndex]);
        render();
      }
    }
  });
}

function writeRenderedLines(lines: string[]): number {
  const rendered = `${lines.join("\n")}\n`;
  process.stdout.write(rendered);
  return rendered.split("\n").length - 1;
}

function toNumericIndex(key: string, optionCount: number): number | null {
  const numeric = Number.parseInt(key, 10);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > optionCount) {
    return null;
  }
  return numeric - 1;
}

function toggleOption<T extends string>(
  active: Set<T>,
  option: SelectManyOption<T> | undefined,
): void {
  if (!option) {
    return;
  }
  if (active.has(option.value)) {
    active.delete(option.value);
    return;
  }
  active.add(option.value);
}
