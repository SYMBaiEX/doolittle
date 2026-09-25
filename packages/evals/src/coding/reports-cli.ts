#!/usr/bin/env nub

import {
  defaultCodingEvalReportDirectory,
  listCodingEvalReportFiles,
} from "./report";

function reportDirectory(argv: string[]): string {
  const index = argv.indexOf("--report-dir");
  if (index === -1) return defaultCodingEvalReportDirectory();
  const directory = argv[index + 1];
  if (!directory || directory.startsWith("--")) {
    throw new Error("--report-dir requires a directory path.");
  }
  if (argv.filter((argument) => argument === "--report-dir").length > 1) {
    throw new Error("Pass --report-dir only once.");
  }
  return directory;
}

const files = listCodingEvalReportFiles(reportDirectory(process.argv.slice(2)));
if (files.length === 0) {
  console.log("No evaluation reports found.");
} else {
  for (const { path, report } of files) {
    const cohort = report.comparisonReady
      ? `${report.taskSetId} · ${report.fixtureId}`
      : "ad hoc (not comparable)";
    console.log(
      `${report.createdAt} · ${report.suite?.id ?? report.runs[0]?.caseId ?? "coding-eval"} · ${report.summary.pass}/${report.summary.totalRuns} pass · ${cohort}\n  ${path}`,
    );
  }
}
