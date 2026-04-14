import type { TrajectoryBenchmarkCaseResult } from "../../../../types/trajectory";
import type { TrajectoryGrade } from "../../../../types/trajectory/shared";

export interface TrajectoryBenchmarkRunSummary {
  averageScore: number;
  bestScore: number;
  worstScore: number;
  grade: TrajectoryGrade;
  findings: string[];
  recommendations: string[];
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function gradeTrajectoryBenchmark(score: number): TrajectoryGrade {
  if (score >= 90) {
    return "A";
  }
  if (score >= 80) {
    return "B";
  }
  if (score >= 70) {
    return "C";
  }
  if (score >= 60) {
    return "D";
  }
  return "F";
}

export function summarizeTrajectoryBenchmarkRun(
  cases: TrajectoryBenchmarkCaseResult[],
): TrajectoryBenchmarkRunSummary {
  const scores = cases.map((entry) => entry.evaluation.score);
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const bestScore = scores.length ? Math.max(...scores) : 0;
  const worstScore = scores.length ? Math.min(...scores) : 0;
  const findings = [
    `Average score: ${averageScore}/100.`,
    `Best score: ${bestScore}/100.`,
    `Worst score: ${worstScore}/100.`,
    ...cases.flatMap((entry) => [
      `${entry.case.label}: ${entry.evaluation.grade} (${entry.evaluation.score}/100)`,
      ...entry.evaluation.findings.slice(0, 2).map((finding) => `- ${finding}`),
    ]),
  ];

  return {
    averageScore,
    bestScore,
    worstScore,
    grade: gradeTrajectoryBenchmark(averageScore),
    findings,
    recommendations: unique(
      cases.flatMap((entry) => entry.evaluation.recommendations),
    ).slice(0, 10),
  };
}
