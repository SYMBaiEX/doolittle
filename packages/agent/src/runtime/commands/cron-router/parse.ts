import type { CronJobRuntimeOverrides } from "@/types/runtime";
import type { ParsedCronSegments } from "./types";

export function parseCronSegments(raw: string): ParsedCronSegments | null {
  const [left, prompt] = raw.split("::").map((part) => part.trim());
  if (!left || !prompt) {
    return null;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const [schedule, ...rawOptions] = segments;
  const options = rawOptions.reduce<Record<string, string>>(
    (accumulator, segment) => {
      const separator = segment.indexOf(":");
      if (separator === -1) {
        return accumulator;
      }
      const key = segment.slice(0, separator).trim().toLowerCase();
      const value = segment.slice(separator + 1).trim();
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {},
  );

  return {
    schedule,
    prompt,
    options,
  };
}

export function parseCronRuntimeOptions(
  options: Record<string, string>,
): CronJobRuntimeOverrides | undefined {
  const runtime: CronJobRuntimeOverrides = {};

  if (options.provider) {
    runtime.provider = options.provider;
  }
  if (options.model) {
    runtime.model = options.model;
  }
  if (options.base || options.baseurl) {
    runtime.baseUrl = options.base ?? options.baseurl;
  }
  if (options.temperature) {
    const temperature = Number(options.temperature);
    if (!Number.isNaN(temperature)) {
      runtime.temperature = temperature;
    }
  }
  if (options.maxtokens) {
    const maxTokens = Number(options.maxtokens);
    if (!Number.isNaN(maxTokens)) {
      runtime.maxTokens = maxTokens;
    }
  }
  if (options.personality) {
    runtime.personalityId = options.personality;
  }

  return Object.keys(runtime).length ? runtime : undefined;
}

export function parseCronSkills(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const skills = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return skills.length ? skills : [];
}

export function parseCronDelivery(
  value?: string,
): "origin" | "local" | "home" | undefined {
  if (value === "origin" || value === "local" || value === "home") {
    return value;
  }
  return undefined;
}
