import * as monaco from "monaco-editor";
import type {
  EditorProjectCompilerOptions,
  EditorProjectContextResult,
} from "../shared/contracts";
import { compilerOptionsForMonaco } from "./editor-project-compiler-options";

interface MonacoLanguageServiceDefaults {
  addExtraLib(content: string, filePath?: string): monaco.IDisposable;
  setCompilerOptions(options: Record<string, unknown>): void;
  setDiagnosticsOptions(options: Record<string, unknown>): void;
  setEagerModelSync(value: boolean): void;
}

const monacoTypeScript = {
  javascriptDefaults: monaco.typescript
    .javascriptDefaults as MonacoLanguageServiceDefaults,
  typescriptDefaults: monaco.typescript
    .typescriptDefaults as MonacoLanguageServiceDefaults,
};

type SupportFileRegistryEntry = {
  count: number;
  disposable: monaco.IDisposable;
};

const supportFiles = new Map<string, SupportFileRegistryEntry>();
export type MonacoProjectLanguage = "javascript" | "typescript";

function defaultsFor(language: MonacoProjectLanguage) {
  return language === "javascript"
    ? monacoTypeScript.javascriptDefaults
    : monacoTypeScript.typescriptDefaults;
}

function configureMonaco(
  options: EditorProjectCompilerOptions,
  language: MonacoProjectLanguage,
): void {
  const diagnostics = {
    noSemanticValidation: false,
    noSuggestionDiagnostics: false,
    noSyntaxValidation: false,
    onlyVisible: false,
  };
  // Monaco's TypeScript worker keys models and extra libraries by URI string.
  // Translate every absolute compiler path into that same namespace; plain
  // filesystem paths otherwise miss `file:///...` models during resolution.
  const compilerOptions = compilerOptionsForMonaco(options, (path) =>
    monaco.Uri.file(path).toString(),
  );
  const defaults = defaultsFor(language);
  defaults.setCompilerOptions(compilerOptions);
  defaults.setDiagnosticsOptions(diagnostics);
  defaults.setEagerModelSync(true);
}

function supportKey(language: MonacoProjectLanguage, path: string): string {
  return `${language}:${path}`;
}

function addSupportFile(
  language: MonacoProjectLanguage,
  path: string,
  content: string,
): void {
  const key = supportKey(language, path);
  const existing = supportFiles.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  supportFiles.set(key, {
    count: 1,
    disposable: defaultsFor(language).addExtraLib(content, path),
  });
}

function removeSupportFile(
  language: MonacoProjectLanguage,
  path: string,
): void {
  const key = supportKey(language, path);
  const existing = supportFiles.get(key);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count > 0) return;
  existing.disposable.dispose();
  supportFiles.delete(key);
}

export function acquireMonacoProjectSupport(
  context: EditorProjectContextResult,
  language: MonacoProjectLanguage,
): () => void {
  const files = context.supportFiles.map((file) => ({
    path: monaco.Uri.file(file.path).toString(),
    content: file.content,
  }));
  for (const file of files) {
    addSupportFile(language, file.path, file.content);
  }
  // Register declarations before changing compiler options. Monaco otherwise
  // recomputes diagnostics while its worker is still receiving extra libs,
  // which can leave stale "Cannot find module" markers until the next edit.
  configureMonaco(context.compilerOptions, language);
  return () => {
    for (const file of files) {
      removeSupportFile(language, file.path);
    }
  };
}
