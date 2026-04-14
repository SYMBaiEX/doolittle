import { installBlessedTextboxGuard } from "@/cli/blessed-guards";

type BlessedModule = Parameters<typeof installBlessedTextboxGuard>[0];

interface CliRuntimeInitDeps {
  importBlessed?: () => Promise<unknown>;
  installBlessedTextboxGuard?: typeof installBlessedTextboxGuard;
}

let cliRuntimeInitialized = false;

function resolveBlessedModule(module: unknown): BlessedModule {
  if (typeof module === "object" && module !== null && "default" in module) {
    return (module as { default: BlessedModule }).default;
  }
  return module as BlessedModule;
}

export async function ensureCliRuntimeInitialized(
  deps: CliRuntimeInitDeps = {},
): Promise<void> {
  if (cliRuntimeInitialized) {
    return;
  }

  const importBlessed =
    deps.importBlessed ?? (async () => await import("blessed"));
  const installGuard =
    deps.installBlessedTextboxGuard ?? installBlessedTextboxGuard;

  const blessedModule = resolveBlessedModule(await importBlessed());
  installGuard(blessedModule);
  cliRuntimeInitialized = true;
}

export function resetCliRuntimeInitializationForTests(): void {
  cliRuntimeInitialized = false;
}
