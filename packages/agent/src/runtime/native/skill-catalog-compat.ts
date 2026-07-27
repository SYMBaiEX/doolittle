import { existsSync, statSync } from "node:fs";
import { relative } from "node:path";
import {
  getCuratedActiveDir,
  getSkillsDir,
  loadSkillEntries,
  type SkillEntry,
} from "@elizaos/skills/index";
import { isUnderPath, stripSkillSuffix } from "@/services/skills/paths";

export interface CatalogSkillVersion {
  version: string;
  createdAt: number;
  changelog: string;
}

export interface CatalogSkillStats {
  comments: number;
  downloads: number;
  installsCurrent: number;
  installsAllTime: number;
  stars: number;
  versions: number;
}

export interface CatalogSkill {
  slug: string;
  displayName: string;
  summary: string | null;
  tags: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  latestVersion: CatalogSkillVersion | null;
  stats: CatalogSkillStats;
}

export interface CatalogSkillSearchSummary {
  slug: string;
  displayName: string;
  summary: string | null;
  score: number;
  latestVersion: string | null;
  downloads: number;
  stars: number;
  installs: number;
}

function localSkillStats(): CatalogSkillStats {
  return {
    comments: 0,
    downloads: 0,
    installsCurrent: 0,
    installsAllTime: 0,
    stars: 0,
    versions: 1,
  };
}

function compactSummary(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function deriveSource(filePath: string | undefined): string {
  if (!filePath) {
    return "local";
  }
  if (isUnderPath(filePath, getSkillsDir())) {
    return "bundled";
  }
  const curatedDir = getCuratedActiveDir();
  if (existsSync(curatedDir) && isUnderPath(filePath, curatedDir)) {
    return "curated";
  }
  return "local";
}

function deriveSlug(entry: SkillEntry): string {
  const filePath = entry.skill.filePath;
  if (filePath) {
    if (isUnderPath(filePath, getSkillsDir())) {
      return stripSkillSuffix(relative(getSkillsDir(), filePath));
    }
    const curatedDir = getCuratedActiveDir();
    if (existsSync(curatedDir) && isUnderPath(filePath, curatedDir)) {
      return stripSkillSuffix(relative(curatedDir, filePath));
    }
  }
  return entry.skill.slug ?? entry.skill.name.trim().toLowerCase();
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function deriveTimestamps(entry: SkillEntry): {
  createdAt: number;
  updatedAt: number;
} {
  const provenanceCreatedAt = parseTimestamp(entry.skill.provenance?.createdAt);
  const filePath = entry.skill.filePath;

  if (filePath && existsSync(filePath)) {
    const stats = statSync(filePath);
    const birthtimeMs =
      Number.isFinite(stats.birthtimeMs) && stats.birthtimeMs > 0
        ? stats.birthtimeMs
        : undefined;
    const mtimeMs =
      Number.isFinite(stats.mtimeMs) && stats.mtimeMs > 0
        ? stats.mtimeMs
        : undefined;
    const createdAt = provenanceCreatedAt ?? birthtimeMs ?? mtimeMs ?? 0;
    const updatedAt = mtimeMs ?? createdAt;
    return { createdAt, updatedAt };
  }

  const createdAt = provenanceCreatedAt ?? 0;
  return { createdAt, updatedAt: createdAt };
}

function deriveLatestVersion(
  entry: SkillEntry,
  createdAt: number,
): CatalogSkillVersion | null {
  const version = entry.skill.version?.trim();
  if (!version) {
    return null;
  }
  return {
    version,
    createdAt,
    changelog: "",
  };
}

function toCatalogSkill(entry: SkillEntry): CatalogSkill {
  const source = deriveSource(entry.skill.filePath);
  const requiredEnv = entry.metadata.requiredEnv?.join(",") ?? "";
  const requiredBins = entry.metadata.requiredBins?.join(",") ?? "";
  const { createdAt, updatedAt } = deriveTimestamps(entry);
  const latestVersion = deriveLatestVersion(entry, createdAt);

  return {
    slug: deriveSlug(entry),
    displayName: entry.skill.name,
    summary: compactSummary(entry.skill.description),
    createdAt,
    updatedAt,
    latestVersion,
    tags: {
      source,
      ...(entry.metadata.primaryEnv
        ? { primaryEnv: entry.metadata.primaryEnv }
        : {}),
      ...(requiredEnv ? { requiredEnv } : {}),
      ...(requiredBins ? { requiredBins } : {}),
      ...(entry.invocation.userInvocable === false
        ? { invocation: "internal" }
        : { invocation: "user" }),
    },
    stats: localSkillStats(),
  };
}

function searchableValues(entry: CatalogSkill): string[] {
  return [
    entry.slug,
    entry.displayName,
    entry.summary ?? "",
    ...Object.keys(entry.tags),
    ...Object.values(entry.tags),
  ];
}

function scoreCatalogSkill(
  entry: CatalogSkill,
  normalizedQuery: string,
): number {
  const slug = entry.slug.toLowerCase();
  const displayName = entry.displayName.toLowerCase();
  const summary = (entry.summary ?? "").toLowerCase();
  const tags = Object.entries(entry.tags).flatMap(([key, value]) => [
    key.toLowerCase(),
    value.toLowerCase(),
    `${key}:${value}`.toLowerCase(),
  ]);

  if (slug === normalizedQuery) {
    return 1;
  }
  if (slug.startsWith(normalizedQuery)) {
    return 0.95;
  }
  if (slug.includes(normalizedQuery)) {
    return 0.9;
  }
  if (displayName.includes(normalizedQuery)) {
    return 0.8;
  }
  if (summary.includes(normalizedQuery)) {
    return 0.7;
  }
  if (tags.some((value) => value.includes(normalizedQuery))) {
    return 0.6;
  }
  return 0;
}

function toCatalogSearchSummary(
  entry: CatalogSkill,
  score: number,
): CatalogSkillSearchSummary {
  return {
    slug: entry.slug,
    displayName: entry.displayName,
    summary: entry.summary,
    score,
    latestVersion: entry.latestVersion?.version ?? null,
    downloads: entry.stats.downloads,
    stars: entry.stats.stars,
    installs: entry.stats.installsCurrent,
  };
}

let cachedCatalog: CatalogSkill[] | undefined;

function loadLocalCatalog(): CatalogSkill[] {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const skillPaths = [getSkillsDir()].filter(existsSync);
  const curatedDir = getCuratedActiveDir();
  if (existsSync(curatedDir)) {
    skillPaths.push(curatedDir);
  }

  const entries = loadSkillEntries({
    cwd: process.cwd(),
    skillPaths,
  });

  cachedCatalog = entries
    .map(toCatalogSkill)
    .sort((left, right) => left.slug.localeCompare(right.slug));
  return cachedCatalog;
}

export async function getCatalogSkills(): Promise<CatalogSkill[]> {
  return loadLocalCatalog();
}

export async function getCatalogSkill(
  slug: string,
): Promise<CatalogSkill | undefined> {
  const normalized = slug.trim().toLowerCase();
  return loadLocalCatalog().find(
    (entry) => entry.slug.toLowerCase() === normalized,
  );
}

export async function getTrendingSkills(limit = 20): Promise<CatalogSkill[]> {
  return loadLocalCatalog().slice(0, Math.max(0, limit));
}

export async function searchCatalogSkills(
  query: string,
  limit = 15,
): Promise<CatalogSkillSearchSummary[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return loadLocalCatalog()
    .filter((entry) =>
      searchableValues(entry).some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    )
    .map((entry) => ({
      entry,
      score: scoreCatalogSkill(entry, normalized),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.slug.localeCompare(right.entry.slug),
    )
    .map(({ entry, score }) => toCatalogSearchSummary(entry, score))
    .slice(0, Math.max(0, limit));
}

export async function searchSkillsMarketplace(
  query: string,
  options: { limit?: number } = {},
): Promise<CatalogSkillSearchSummary[]> {
  return searchCatalogSkills(query, options.limit ?? 15);
}
