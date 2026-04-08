import { resolve } from "node:path";

export function normalizePath(path: string): string {
  return resolve(path);
}

export function isUnderPath(target: string, root: string): boolean {
  const normalizedTarget = normalizePath(target);
  const normalizedRoot = normalizePath(root);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}/`)
  );
}

export function stripSkillSuffix(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/\/SKILL\.md$/u, "")
    .replace(/\.md$/u, "");
}

export function titleFromPath(path: string): string {
  return path.split("/").at(-2) ?? "Untitled Skill";
}
