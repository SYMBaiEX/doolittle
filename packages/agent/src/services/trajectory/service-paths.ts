import { readTrajectoryRecords } from "./bundle-storage";

export function createTrajectoryEvaluationServiceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function readTrajectoryEvaluationServiceRecords(dataPath: string) {
  return readTrajectoryRecords(dataPath);
}
