/**
 * Acceptance fixture entrypoint: boots the real CLI while injecting foreign
 * stdout writes the way a noisy dependency would — each logical line is split
 * across several process.stdout.write chunks. The cockpit's interception must
 * reassemble the complete line before it reaches the Ops Stream.
 *
 * Writes only start once the trigger file named by DOOLITTLE_FOREIGN_TRIGGER
 * exists. The accepting test creates that file after the cockpit is fully
 * booted, so every emitted line is guaranteed to exercise the live TUI
 * foreign-output routing path — never the pre-boot capture window, which is
 * covered separately by boundary tests. The writes repeat with a generation
 * counter so tests can tell stale generations apart from freshly routed ones.
 */
import { existsSync } from "node:fs";

const MARKER_HEAD = "ZxQvSplitHead";
const MARKER_TAIL = "ZxQvSplitTail";

const triggerPath = process.env.DOOLITTLE_FOREIGN_TRIGGER;

let generation = 0;
setInterval(() => {
  if (!triggerPath || !existsSync(triggerPath)) {
    return;
  }
  generation += 1;
  // Three separate chunks, no newline until the final one. Shredded routing
  // shows up as individual fragment lines in the Ops Stream; correct line
  // buffering produces exactly one line containing head+tail contiguously.
  process.stdout.write(MARKER_HEAD);
  process.stdout.write("-mid-");
  process.stdout.write(`${MARKER_TAIL}-G${generation}\n`);
}, 500).unref();

await import("../../apps/cli/src/index");
