import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

type DesktopOutputChunk = {
  type: "chunk";
  fileName: string;
  code: string;
  modules: Record<string, { renderedLength: number }>;
};

type DesktopOutputAsset = {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
};

export type DesktopOutputBundle = Record<
  string,
  DesktopOutputChunk | DesktopOutputAsset
>;

export type DesktopBuildSurface = "main" | "preload" | "renderer";

export type DesktopInventoryPackage = {
  name: string;
  version: string;
  renderedBytes: number;
};

export type DesktopInventoryOutput = {
  path: string;
  bytes: number;
  sha256: string;
};

export type DesktopBuildInventory = {
  schemaVersion: 1;
  surface: DesktopBuildSurface;
  outputs: DesktopInventoryOutput[];
  packages: DesktopInventoryPackage[];
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function outputBytes(
  output: DesktopOutputChunk | DesktopOutputAsset,
): Uint8Array {
  if (output.type === "chunk") return Buffer.from(output.code);
  return typeof output.source === "string"
    ? Buffer.from(output.source)
    : Buffer.from(output.source);
}

function packageNameFromModuleId(id: string): string | undefined {
  const portable = id.replaceAll("\\", "/").split("?")[0] ?? id;
  const marker = "/node_modules/";
  const index = portable.lastIndexOf(marker);
  if (index === -1) return undefined;
  const segments = portable.slice(index + marker.length).split("/");
  const first = segments[0];
  if (!first || first.startsWith(".")) return undefined;
  return first.startsWith("@") && segments[1]
    ? `${first}/${segments[1]}`
    : first;
}

function packageDirectoryFromModuleId(
  id: string,
  packageName: string,
): string | undefined {
  const portable = id.replaceAll("\\", "/").split("?")[0] ?? id;
  const suffix = `/node_modules/${packageName}/`;
  const index = portable.lastIndexOf(suffix);
  if (index === -1) return undefined;
  return portable
    .slice(0, index + suffix.length - 1)
    .split("/")
    .join(sep);
}

function inventoryPackage(
  id: string,
  renderedBytes: number,
): DesktopInventoryPackage | undefined {
  if (renderedBytes <= 0) return undefined;
  const name = packageNameFromModuleId(id);
  if (!name) return undefined;
  const directory = packageDirectoryFromModuleId(id, name);
  if (!directory) return undefined;
  const manifestPath = resolve(directory, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Desktop build package manifest is missing: ${manifestPath}`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    name?: unknown;
    version?: unknown;
  };
  if (
    typeof manifest.name !== "string" ||
    !manifest.name ||
    typeof manifest.version !== "string" ||
    !manifest.version
  ) {
    throw new Error(
      `Desktop build package identity is invalid: ${manifestPath}`,
    );
  }
  // npm aliases intentionally have a node_modules path name that differs from
  // the published package identity (for example @typescript/old ->
  // typescript). The artifact boundary follows the manifest identity.
  return { name: manifest.name, version: manifest.version, renderedBytes };
}

function stablePackages(
  bundle: DesktopOutputBundle,
): DesktopInventoryPackage[] {
  const totals = new Map<string, DesktopInventoryPackage>();
  for (const output of Object.values(bundle)) {
    if (output.type !== "chunk") continue;
    for (const [id, module] of Object.entries(output.modules)) {
      const entry = inventoryPackage(id, module.renderedLength);
      if (!entry) continue;
      const key = `${entry.name}\0${entry.version}`;
      const prior = totals.get(key);
      totals.set(key, {
        ...entry,
        renderedBytes: (prior?.renderedBytes ?? 0) + entry.renderedBytes,
      });
    }
  }
  return [...totals.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version),
  );
}

export function createDesktopBuildInventory(
  surface: DesktopBuildSurface,
  bundle: DesktopOutputBundle,
): DesktopBuildInventory {
  const outputs = Object.values(bundle)
    .map((output) => {
      const bytes = outputBytes(output);
      return {
        path: output.fileName,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      };
    })
    .filter((output) => output.bytes > 0)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (outputs.length === 0) {
    throw new Error(`Desktop ${surface} build emitted no non-empty outputs.`);
  }
  return {
    schemaVersion: 1,
    surface,
    outputs,
    packages: stablePackages(bundle),
  };
}

function createDesktopBuildInventoryFromDisk(
  surface: DesktopBuildSurface,
  bundle: DesktopOutputBundle,
  outputRoot: string,
): DesktopBuildInventory {
  const outputs = Object.values(bundle)
    .map((output) => {
      const path = resolve(outputRoot, output.fileName);
      if (!existsSync(path) || !statSync(path).isFile()) {
        throw new Error(
          `Desktop ${surface} output is missing after write: ${output.fileName}`,
        );
      }
      const contents = readFileSync(path);
      return {
        path: output.fileName,
        bytes: contents.byteLength,
        sha256: sha256(contents),
      };
    })
    .filter((output) => output.bytes > 0)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (outputs.length === 0) {
    throw new Error(`Desktop ${surface} build emitted no non-empty outputs.`);
  }
  return {
    schemaVersion: 1,
    surface,
    outputs,
    packages: stablePackages(bundle),
  };
}

export function validateDesktopBuildInventory(
  value: unknown,
  expectedSurface: DesktopBuildSurface,
  outputRoot: string,
): DesktopBuildInventory {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Desktop ${expectedSurface} build inventory is invalid.`);
  }
  const inventory = value as Partial<DesktopBuildInventory>;
  if (
    inventory.schemaVersion !== 1 ||
    inventory.surface !== expectedSurface ||
    !Array.isArray(inventory.outputs) ||
    inventory.outputs.length === 0 ||
    !Array.isArray(inventory.packages)
  ) {
    throw new Error(`Desktop ${expectedSurface} build inventory is invalid.`);
  }
  const outputs = inventory.outputs as DesktopInventoryOutput[];
  const packages = inventory.packages as DesktopInventoryPackage[];
  for (const [index, output] of outputs.entries()) {
    const prior = outputs[index - 1];
    if (
      !output.path ||
      output.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(output.sha256) ||
      (prior ? prior.path.localeCompare(output.path) >= 0 : false)
    ) {
      throw new Error(
        `Desktop ${expectedSurface} output inventory is unstable.`,
      );
    }
    const absolutePath = resolve(outputRoot, output.path);
    if (
      relative(outputRoot, absolutePath).startsWith("..") ||
      !existsSync(absolutePath)
    ) {
      throw new Error(
        `Desktop ${expectedSurface} output is missing: ${output.path}`,
      );
    }
    if (
      statSync(absolutePath).size !== output.bytes ||
      sha256(readFileSync(absolutePath)) !== output.sha256
    ) {
      throw new Error(
        `Desktop ${expectedSurface} output was tampered with: ${output.path}`,
      );
    }
  }
  for (const [index, entry] of packages.entries()) {
    const prior = packages[index - 1];
    const order = prior
      ? prior.name.localeCompare(entry.name) ||
        prior.version.localeCompare(entry.version)
      : -1;
    if (
      !entry.name ||
      !entry.version ||
      entry.renderedBytes <= 0 ||
      order >= 0
    ) {
      throw new Error(
        `Desktop ${expectedSurface} package inventory is unstable.`,
      );
    }
  }
  return inventory as DesktopBuildInventory;
}

export function desktopBuildInventoryPlugin({
  surface,
  desktopRoot,
}: {
  surface: DesktopBuildSurface;
  desktopRoot: string;
}): Plugin {
  let outputRoot: string | undefined;
  return {
    name: `doolittle-desktop-${surface}-inventory`,
    configResolved(config) {
      outputRoot = resolve(config.root, config.build.outDir);
    },
    writeBundle(_options, bundle) {
      if (!outputRoot) {
        throw new Error(
          `Desktop ${surface} build output directory was not resolved.`,
        );
      }
      const inventory = createDesktopBuildInventoryFromDisk(
        surface,
        bundle as unknown as DesktopOutputBundle,
        outputRoot,
      );
      const path = resolve(
        desktopRoot,
        "build/desktop-inventory",
        `${surface}.json`,
      );
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    },
  };
}
