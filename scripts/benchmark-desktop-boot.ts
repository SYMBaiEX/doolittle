import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  type DesktopStartupTimings,
  launchDesktop,
} from "../tests/support/desktop-core";

const { values, positionals } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    warm: { type: "boolean" },
  },
  allowPositionals: true,
});
const runs = Number(values.runs);
if (!Number.isSafeInteger(runs) || runs < 1) {
  throw new Error("--runs must be a positive integer.");
}

const paths = positionals.map((path) => realpathSync(path));
const targets = (paths.length ? paths : [undefined]).map((executable) => ({
  executable,
  samples: [] as DesktopStartupTimings[],
}));

// Alternate launch order so one artifact doesn't always inherit warmer caches.
for (let round = 0; round < runs; round++) {
  for (const target of round % 2 === 0 ? targets : [...targets].reverse()) {
    const desktop = await launchDesktop(target.executable);
    try {
      if (values.warm) await desktop.restart();
      target.samples.push(desktop.startup);
      console.log(
        JSON.stringify({
          target: target.executable ?? "local build",
          profile: values.warm ? "reopened" : "fresh",
          run: round + 1,
          ...desktop.startup,
        }),
      );
    } finally {
      await desktop.dispose();
    }
  }
}

function summarize(samples: number[]): {
  median: number;
  min: number;
  max: number;
} {
  samples.sort((a, b) => a - b);
  const middle = Math.floor(samples.length / 2);
  const upper = samples[middle] ?? 0;
  const lower = samples[middle - 1] ?? upper;
  return {
    median: samples.length % 2 === 0 ? (lower + upper) / 2 : upper,
    min: samples[0] ?? 0,
    max: samples.at(-1) ?? 0,
  };
}

for (const { executable, samples } of targets) {
  console.log(
    `Milliseconds after requesting launch for ${executable ?? "local build"}`,
  );
  console.table({
    "Visible workbench": summarize(samples.map((sample) => sample.workbenchMs)),
    "Worker API ready": summarize(samples.map((sample) => sample.apiReadyMs)),
    "Eliza core ready": summarize(samples.map((sample) => sample.coreReadyMs)),
    "Eliza runtime ready": summarize(
      samples.map((sample) => sample.runtimeReadyMs),
    ),
  });
}
