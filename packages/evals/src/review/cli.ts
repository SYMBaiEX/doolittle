import { readFileSync } from "node:fs";
import { reviewReportFile, verifyHumanReviewSidecar } from "./sidecar";

function usage(): never {
  throw new Error(
    "Usage: nub run eval:review -- --report REPORT.json --input REVIEW.json --out SIDECAR.json\n       nub run eval:review -- --verify SIDECAR.json --report REPORT.json",
  );
}

function argumentsFor(argv: string[]): Map<string, string> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !key ||
      !value ||
      !["--report", "--input", "--out", "--verify"].includes(key) ||
      values.has(key)
    )
      usage();
    values.set(key, value);
  }
  return values;
}

try {
  const options = argumentsFor(process.argv.slice(2));
  const report = options.get("--report");
  if (!report) usage();
  if (options.has("--verify")) {
    if (options.size !== 2) usage();
    const sidecar = JSON.parse(
      readFileSync(options.get("--verify") as string, "utf8"),
    ) as unknown;
    verifyHumanReviewSidecar(readFileSync(report), sidecar);
    console.log(
      "Human-review sidecar matches the exact report bytes and task identities.",
    );
  } else {
    if (options.size !== 3 || !options.has("--input") || !options.has("--out"))
      usage();
    reviewReportFile(
      report,
      options.get("--input") as string,
      options.get("--out") as string,
    );
    console.log(
      "Private human-review sidecar saved. This is descriptive evidence, not a quality conclusion.",
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to process human review.",
  );
  process.exitCode = 1;
}
