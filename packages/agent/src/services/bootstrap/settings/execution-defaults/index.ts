import type { EnvConfig } from "@/types";
import type { RuntimeSettingsSnapshot, SettingsSetter } from "../types";
import {
  ARRAY_DEFAULTS,
  NUMBER_DEFAULTS,
  STRING_DEFAULTS,
} from "./definitions";

function setStringWhenBlank(
  set: SettingsSetter,
  path: string,
  currentValue: string | undefined,
  nextValue: string | undefined,
): void {
  if (!currentValue && nextValue) {
    set(path, nextValue);
  }
}

function setNumberWhenMissing(
  set: SettingsSetter,
  path: string,
  currentValue: number | undefined,
  nextValue: number | undefined,
): void {
  if (!currentValue && nextValue) {
    set(path, nextValue);
  }
}

function setArrayWhenEmpty(
  set: SettingsSetter,
  path: string,
  currentValue: string[] | undefined,
  nextValue: string[],
): void {
  if (!currentValue?.length && nextValue.length) {
    set(path, nextValue);
  }
}

export function applyMissingExecutionDefaults(
  config: EnvConfig,
  currentSettings: RuntimeSettingsSnapshot,
  set: SettingsSetter,
): void {
  for (const definition of STRING_DEFAULTS) {
    setStringWhenBlank(
      set,
      definition.path,
      definition.current(currentSettings),
      definition.next(config),
    );
  }

  for (const definition of ARRAY_DEFAULTS) {
    setArrayWhenEmpty(
      set,
      definition.path,
      definition.current(currentSettings),
      definition.next(config),
    );
  }

  for (const definition of NUMBER_DEFAULTS) {
    setNumberWhenMissing(
      set,
      definition.path,
      definition.current(currentSettings),
      definition.next(config),
    );
  }

  if (currentSettings.execution.containerReadOnlyRoot === undefined) {
    set("execution.containerReadOnlyRoot", config.containerReadOnlyRoot);
  }

  if (
    !currentSettings.execution.sshStrictHostKeyChecking &&
    config.sshStrictHostKeyChecking
  ) {
    set("execution.sshStrictHostKeyChecking", config.sshStrictHostKeyChecking);
  }
}
