import { bootstrapColor, paint } from "../core/output";
import type { PromptRuntime, SelectManyOption, SelectOneOption } from "./types";

export async function chooseOneFallback<T extends string>(
  runtime: PromptRuntime,
  question: (query: string) => Promise<string>,
  prompt: string,
  optionsList: SelectOneOption<T>[],
  defaultValue: T,
): Promise<T> {
  console.log(paint(prompt, bootstrapColor.cyan + bootstrapColor.bold));
  optionsList.forEach((item, index) => {
    const selected = item.value === defaultValue ? "●" : "○";
    console.log(`  ${selected} ${index + 1}. ${item.label}`);
    if (item.detail) {
      runtime.info(item.detail);
    }
  });

  const defaultIndex =
    optionsList.findIndex((item) => item.value === defaultValue) + 1;
  while (true) {
    const answer = (
      await question(
        paint(
          `Select [1-${optionsList.length}] (${defaultIndex}): `,
          bootstrapColor.amber,
        ),
      )
    ).trim();
    const selection = resolveOneSelection(answer, optionsList, defaultValue);
    if (selection) {
      return selection;
    }
    runtime.warn("Pick one of the listed options.");
  }
}

export async function chooseManyFallback<T extends string>(
  runtime: PromptRuntime,
  question: (query: string) => Promise<string>,
  prompt: string,
  optionsList: SelectManyOption<T>[],
  defaults: T[],
): Promise<T[]> {
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
      await question(paint("Select: ", bootstrapColor.amber))
    ).trim();
    const selection = resolveManySelection(answer, optionsList, defaults);
    if (selection.length > 0) {
      return selection;
    }
    runtime.warn("Enter one or more valid option numbers.");
  }
}

function resolveOneSelection<T extends string>(
  answer: string,
  optionsList: SelectOneOption<T>[],
  defaultValue: T,
): T | null {
  if (!answer) {
    return defaultValue;
  }

  const numeric = Number(answer);
  if (
    Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= optionsList.length
  ) {
    return optionsList[numeric - 1]?.value ?? null;
  }

  return optionsList.find((item) => item.value === answer)?.value ?? null;
}

function resolveManySelection<T extends string>(
  answer: string,
  optionsList: SelectManyOption<T>[],
  defaults: T[],
): T[] {
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

  return [...new Set(values)];
}
