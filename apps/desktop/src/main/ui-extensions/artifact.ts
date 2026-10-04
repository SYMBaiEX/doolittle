import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import {
  parseUiPluginManifestV1,
  type UiPluginArtifactIdentity,
  type UiPluginManifestV1,
} from "@doolittle/contracts/ui-plugin";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 257;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface VerifiedUiArtifact {
  readonly identity: UiPluginArtifactIdentity;
  readonly manifest: UiPluginManifestV1;
  /** Immutable copies, not paths into mutable plugin-controlled storage. */
  readonly assets: ReadonlyMap<string, Buffer>;
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function readRegularFile(path: string, maxBytes: number): Buffer {
  if (!lstatSync(path).isFile())
    throw new Error("UI artifact contains a non-file entry.");
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile() || stats.size > maxBytes || stats.size < 0) {
      throw new Error("UI artifact file exceeds its limit.");
    }
    const bytes = readFileSync(fd);
    if (bytes.byteLength !== stats.size)
      throw new Error("UI artifact file changed during inspection.");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function inspectDirectory(
  root: string,
  directory: string,
  seen: Set<string>,
): void {
  if (!lstatSync(directory).isDirectory())
    throw new Error("UI artifact directory is not regular.");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (!isWithin(root, path) || entry.isSymbolicLink()) {
      throw new Error("UI artifact contains a symlink or escaping path.");
    }
    if (entry.isDirectory()) inspectDirectory(root, path, seen);
    else if (entry.isFile()) {
      const relative = path
        .slice(root.length + 1)
        .split(sep)
        .join("/");
      seen.add(relative);
      if (seen.size > MAX_FILES)
        throw new Error("UI artifact has too many files.");
    } else throw new Error("UI artifact contains an unsupported file type.");
  }
}

/** Read local, prebuilt assets only. No package manager, build, script, or network work. */
export function verifyUiArtifact(directory: string): VerifiedUiArtifact {
  const root = resolve(directory);
  if (!lstatSync(root).isDirectory())
    throw new Error("UI artifact must be a directory.");
  const found = new Set<string>();
  inspectDirectory(root, root, found);
  const manifestBytes = readRegularFile(
    resolve(root, "manifest.json"),
    MAX_MANIFEST_BYTES,
  );
  const manifest = parseUiPluginManifestV1(
    JSON.parse(manifestBytes.toString("utf8")) as unknown,
  );
  if (manifest.assets.some((asset) => asset.path === "manifest.json")) {
    throw new Error("UI manifest cannot list itself as an asset.");
  }
  if (
    process.platform === "win32" &&
    new Set(manifest.assets.map((asset) => asset.path.toLowerCase())).size !==
      manifest.assets.length
  ) {
    throw new Error("UI assets collide on case-insensitive filesystems.");
  }
  const declared = new Set([
    "manifest.json",
    ...manifest.assets.map((asset) => asset.path),
  ]);
  if (
    found.size !== declared.size ||
    [...found].some((path) => !declared.has(path))
  ) {
    throw new Error("UI artifact files do not exactly match the manifest.");
  }
  const assets = new Map<string, Buffer>();
  let total = 0;
  for (const asset of manifest.assets) {
    const path = resolve(root, asset.path);
    if (!isWithin(root, path))
      throw new Error("UI asset escapes artifact root.");
    const bytes = readRegularFile(path, asset.bytes);
    if (bytes.byteLength !== asset.bytes || hash(bytes) !== asset.sha256) {
      throw new Error(`UI asset integrity check failed: ${asset.path}`);
    }
    total += bytes.byteLength;
    if (total > MAX_ARTIFACT_BYTES)
      throw new Error("UI artifact exceeds total size limit.");
    assets.set(asset.path, bytes);
  }
  // The digest binds the reviewed manifest bytes and every listed asset's bytes.
  const digestHasher = createHash("sha256");
  digestHasher.update(manifestBytes);
  for (const asset of [...manifest.assets].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    digestHasher.update("\0");
    digestHasher.update(asset.path);
    digestHasher.update("\0");
    const bytes = assets.get(asset.path);
    if (!bytes) throw new Error("Verified UI asset is missing.");
    digestHasher.update(bytes);
  }
  return {
    identity: {
      pluginId: manifest.id,
      pluginVersion: manifest.pluginVersion,
      digest: digestHasher.digest("hex"),
    },
    manifest,
    assets,
  };
}

function artifactDirectory(
  root: string,
  identity: UiPluginArtifactIdentity,
): string {
  if (
    !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(identity.pluginId) ||
    !SHA256.test(identity.digest)
  ) {
    throw new Error("Invalid UI artifact identity.");
  }
  return resolve(root, "artifacts", identity.pluginId, identity.digest);
}

/** Stage verified bytes; publish by one directory rename. Existing versions remain for rollback. */
export function installUiArtifact(
  root: string,
  sourceDirectory: string,
): VerifiedUiArtifact {
  const verified = verifyUiArtifact(sourceDirectory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!lstatSync(root).isDirectory())
    throw new Error("UI install root is not a regular directory.");
  const destination = artifactDirectory(root, verified.identity);
  if (existsSync(destination)) {
    const existing = verifyUiArtifact(destination);
    if (existing.identity.digest !== verified.identity.digest)
      throw new Error("Installed artifact changed.");
    return existing;
  }
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  for (const directory of [resolve(root, "artifacts"), parent]) {
    if (!lstatSync(directory).isDirectory())
      throw new Error("UI install path contains a symlink.");
  }
  chmodSync(parent, 0o700);
  const stage = resolve(parent, `.stage-${randomUUID()}`);
  mkdirSync(stage, { mode: 0o700 });
  try {
    const manifestBytes = readRegularFile(
      resolve(sourceDirectory, "manifest.json"),
      MAX_MANIFEST_BYTES,
    );
    writeFileSync(resolve(stage, "manifest.json"), manifestBytes, {
      flag: "wx",
      mode: 0o600,
    });
    for (const [path, bytes] of verified.assets) {
      const target = resolve(stage, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
    }
    const staged = verifyUiArtifact(stage);
    if (staged.identity.digest !== verified.identity.digest)
      throw new Error("Staged UI artifact changed.");
    renameSync(stage, destination);
    return staged;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function loadUiArtifact(
  root: string,
  identity: UiPluginArtifactIdentity,
): VerifiedUiArtifact {
  const loaded = verifyUiArtifact(artifactDirectory(root, identity));
  if (
    loaded.identity.pluginVersion !== identity.pluginVersion ||
    loaded.identity.digest !== identity.digest
  ) {
    throw new Error("Installed UI artifact identity changed.");
  }
  return loaded;
}

export function uiAssetMime(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".js") || name.endsWith(".mjs"))
    return "text/javascript; charset=utf-8";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
