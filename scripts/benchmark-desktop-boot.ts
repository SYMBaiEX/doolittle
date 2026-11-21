import { existsSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type DesktopStartupTimings,
  launchDesktop,
} from "../tests/support/desktop-core";

const { values, positionals } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    warm: { type: "boolean" },
    profile: { type: "string" },
  },
  allowPositionals: true,
});
const runs = Number(values.runs);
if (!Number.isSafeInteger(runs) || runs < 1) {
  throw new Error("--runs must be a positive integer.");
}
if (values.warm && values.profile) {
  throw new Error("Choose either --warm or --profile.");
}
const profile = values.profile ?? (values.warm ? "reopened" : "fresh");
if (profile !== "fresh" && profile !== "reopened" && profile !== "both") {
  throw new Error("--profile must be fresh, reopened, or both.");
}

const targets = (positionals.length ? positionals : [undefined]).map(
  (input) => {
    const path = input ? realpathSync(input) : undefined;
    const sourceCheckout =
      path && statSync(path).isDirectory() ? path : undefined;
    if (
      sourceCheckout &&
      !["apps/desktop/dist/main/main.mjs", "apps/cli/dist/index.js"].every(
        (file) => existsSync(join(sourceCheckout, file)),
      )
    ) {
      throw new Error(
        `Build the desktop and CLI before benchmarking ${sourceCheckout}.`,
      );
    }
    return {
      label: path ?? "local build",
      executable: sourceCheckout ? undefined : path,
      sourceCheckout,
      samples: {
        fresh: [] as DesktopStartupTimings[],
        reopened: [] as DesktopStartupTimings[],
      },
    };
  },
);

function record(
  target: (typeof targets)[number],
  profile: "fresh" | "reopened",
  run: number,
  timings: DesktopStartupTimings,
) {
  target.samples[profile].push(timings);
  console.log(
    JSON.stringify({ target: target.label, profile, run, ...timings }),
  );
}

// Alternate launch order so one artifact doesn't always inherit warmer caches.
for (let round = 0; round < runs; round++) {
  for (const target of round % 2 === 0 ? targets : [...targets].reverse()) {
    const desktop = await launchDesktop(target.executable, {
      sourceCheckout: target.sourceCheckout,
    });
    try {
      if (profile !== "reopened") {
        record(target, "fresh", round + 1, desktop.startup);
      }
      if (profile !== "fresh") {
        await desktop.restart();
        record(target, "reopened", round + 1, desktop.startup);
      }
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

for (const target of targets) {
  for (const kind of ["fresh", "reopened"] as const) {
    const samples = target.samples[kind];
    if (!samples.length) continue;
    console.log(
      `Milliseconds after launch for ${target.label} (${kind} profile)`,
    );
    console.table({
      "Visible workbench": summarize(
        samples.map((sample) => sample.workbenchMs),
      ),
      "Worker API ready": summarize(samples.map((sample) => sample.apiReadyMs)),
      "Eliza core ready": summarize(
        samples.map((sample) => sample.coreReadyMs),
      ),
      "Eliza runtime hydrated": summarize(
        samples.map((sample) => sample.runtimeReadyMs),
      ),
    });
    const snapshotCount = samples.filter(
      (sample) => sample.apiReadyObservation === "snapshot",
    ).length;
    if (snapshotCount) {
      console.log(
        `Worker API ready before observation in ${snapshotCount}/${samples.length} runs.`,
      );
    }
  }
}
