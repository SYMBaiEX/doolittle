import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { $ } from "bun";
import type { LocalCodebaseMatch } from "./types";

const SEARCH_ROOT_SUFFIXES = ["dev", "code", "projects"] as const;

function resolveSearchRoots(workspaceDir: string): string[] {
  const home = process.env.HOME ?? workspaceDir;
  return [
    ...SEARCH_ROOT_SUFFIXES.map((suffix) => resolve(home, suffix)),
    resolve(workspaceDir),
  ].filter(
    (root, index, array) => existsSync(root) && array.indexOf(root) === index,
  );
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await $`command -v ${command}`.quiet();
    return true;
  } catch {
    return false;
  }
}

function rankCodebaseMatches(
  query: string,
  paths: string[],
): LocalCodebaseMatch[] {
  const normalizedQuery = basename(query).toLowerCase();
  return paths
    .map((path) => {
      const name = basename(path).toLowerCase();
      return {
        path,
        exactBasenameMatch: name === normalizedQuery,
      };
    })
    .sort((left, right) => {
      if (left.exactBasenameMatch !== right.exactBasenameMatch) {
        return left.exactBasenameMatch ? -1 : 1;
      }
      return left.path.length - right.path.length;
    });
}

async function searchWithFd(
  searchRoots: string[],
  searchTerm: string,
): Promise<string[]> {
  const results = await Promise.all(
    searchRoots.map(async (root) => {
      try {
        const output = await $`fd -HI -t d ${searchTerm} ${root}`
          .quiet()
          .text();
        return output
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}

async function searchWithFind(
  searchRoots: string[],
  searchTerm: string,
): Promise<string[]> {
  const results = await Promise.all(
    searchRoots.map(async (root) => {
      try {
        const output =
          await $`find ${root} -maxdepth 4 -type d ( -name .git -prune -o -iname ${`*${searchTerm}*`} -print )`
            .quiet()
            .text();
        return output
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}

export async function findLocalCodebases(
  query: string,
  workspaceDir: string,
): Promise<LocalCodebaseMatch[]> {
  const sanitizedQuery = query.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
  if (!sanitizedQuery) {
    return [];
  }

  const searchRoots = resolveSearchRoots(workspaceDir);
  if (!searchRoots.length) {
    return [];
  }

  const searchTerm = sanitizedQuery.includes("/")
    ? basename(sanitizedQuery)
    : sanitizedQuery;

  const rawMatches = await ((await commandExists("fd"))
    ? searchWithFd(searchRoots, searchTerm)
    : searchWithFind(searchRoots, searchTerm));

  const unique = [...new Set(rawMatches)].filter((entry) => existsSync(entry));
  return rankCodebaseMatches(searchTerm, unique);
}
