import { asString, desktopRequest } from "../lib";
import type { RegistryEntry } from "./registry-model";

/** Called after the Registry page confirms this exact package selection. */
export async function installRegistryPackage(
  entry: RegistryEntry,
): Promise<string> {
  const { installed } = await desktopRequest<{
    installed?: {
      name?: string;
      version?: string;
      requiresRestart?: boolean;
    };
  }>(
    "/runtime/registry/install",
    "POST",
    {
      name: entry.name,
      packageName: entry.packageName,
      version: entry.version,
      approved: true,
    },
    undefined,
    120_000,
  );
  const name = asString(installed?.name, entry.name);
  const version = asString(installed?.version, entry.version);
  const restart = installed?.requiresRestart
    ? " Restart the local runtime to activate it."
    : "";
  return `${name} ${version} installed through Eliza.${restart}`;
}
