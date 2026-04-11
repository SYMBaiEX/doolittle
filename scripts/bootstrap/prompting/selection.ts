import { bootstrapColor, paint } from "../core/output";
import { requireReadline } from "./readline";
import {
  clearRenderedMenu,
  readMenuKeypress,
  supportsInteractiveMenus,
  withRawMenuInput,
} from "./terminal-menu";
import type {
  PromptHandle,
  PromptRuntime,
  SelectManyOption,
  SelectOneOption,
} from "./types";

export async function chooseOne<T extends string>(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  optionsList: SelectOneOption<T>[],
  defaultValue: T,
  options?: { onHighlight?: (value: T) => void },
): Promise<T> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.selectOne(prompt, optionsList, defaultValue, options);
  }

  const promptInterface = requireReadline(rl);
  if (supportsInteractiveMenus()) {
    return chooseOneInteractive(prompt, optionsList, defaultValue, options);
  }

  console.log(paint(prompt, bootstrapColor.cyan + bootstrapColor.bold));
  optionsList.forEach((item, index) => {
    const selected = item.value === defaultValue ? "●" : "○";
    console.log(`  ${selected} ${index + 1}. ${item.label}`);
    if (item.detail) {
      runtime.info(item.detail);
    }
  });
  while (true) {
    const answer = (
      await promptInterface.question(
        paint(
          `Select [1-${optionsList.length}] (${optionsList.findIndex((item) => item.value === defaultValue) + 1}): `,
          bootstrapColor.amber,
        ),
      )
    ).trim();
    if (!answer) {
      return defaultValue;
    }
    const numeric = Number(answer);
    if (
      Number.isInteger(numeric) &&
      numeric >= 1 &&
      numeric <= optionsList.length
    ) {
      const selected = optionsList[numeric - 1];
      if (selected) {
        return selected.value;
      }
    }
    const direct = optionsList.find((item) => item.value === answer);
    if (direct) {
      return direct.value;
    }
    runtime.warn("Pick one of the listed options.");
  }
}

export async function chooseMany<T extends string>(
  runtime: PromptRuntime,
  rl: PromptHandle,
  prompt: string,
  optionsList: SelectManyOption<T>[],
  defaults: T[],
): Promise<T[]> {
  const wizardScreen = runtime.getWizardScreen();
  if (wizardScreen) {
    return wizardScreen.selectMany(prompt, optionsList, defaults);
  }

  const promptInterface = requireReadline(rl);
  if (supportsInteractiveMenus()) {
    return chooseManyInteractive(prompt, optionsList, defaults);
  }

  console.log(paint(prompt, bootstrapColor.cyan + bootstrapColor.bold));
  optionsList.forEach((item, index) => {
    const selected = defaults.includes(item.value) ? "●" : "○";
    console.log(`  ${selected} ${index + 1}. ${item.label}`);
  });
  runtime.info(
    "Use comma-separated numbers like 1,3,5. Leave blank to keep the defaults.",
  );
  while (true) {
    const answer = (
      await promptInterface.question(paint("Select: ", bootstrapColor.amber))
    ).trim();
    if (!answer) {
      return defaults;
    }
    const values = answer
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter(
        (value) =>
          Number.isInteger(value) && value >= 1 && value <= optionsList.length,
      )
      .map((value) => optionsList[value - 1]?.value)
      .filter((value): value is T => Boolean(value));
    if (values.length > 0) {
      return [...new Set(values)];
    }
    runtime.warn("Enter one or more valid option numbers.");
  }
}

async function chooseOneInteractive<T extends string>(
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
      const rendered = `${lines.join("\n")}\n`;
      process.stdout.write(rendered);
      renderedLines = rendered.split("\n").length - 1;
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
      const numeric = Number.parseInt(key, 10);
      if (
        Number.isInteger(numeric) &&
        numeric >= 1 &&
        numeric <= optionsList.length
      ) {
        selectedIndex = numeric - 1;
        render();
      }
    }
  });
}

async function chooseManyInteractive<T extends string>(
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
      const rendered = `${lines.join("\n")}\n`;
      process.stdout.write(rendered);
      renderedLines = rendered.split("\n").length - 1;
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
      const numeric = Number.parseInt(key, 10);
      if (
        Number.isInteger(numeric) &&
        numeric >= 1 &&
        numeric <= optionsList.length
      ) {
        cursorIndex = numeric - 1;
        toggleOption(active, optionsList[cursorIndex]);
        render();
      }
    }
  });
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
  } else {
    active.add(option.value);
  }
}
