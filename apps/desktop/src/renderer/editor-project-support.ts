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
  javascriptDisposable: monaco.IDisposable;
  typescriptDisposable: monaco.IDisposable;
};

const supportFiles = new Map<string, SupportFileRegistryEntry>();

function configureMonaco(options: EditorProjectCompilerOptions): void {
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
  monacoTypeScript.javascriptDefaults.setCompilerOptions(compilerOptions);
  monacoTypeScript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monacoTypeScript.javascriptDefaults.setDiagnosticsOptions(diagnostics);
  monacoTypeScript.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  monacoTypeScript.javascriptDefaults.setEagerModelSync(true);
  monacoTypeScript.typescriptDefaults.setEagerModelSync(true);
}

function addSupportFile(path: string, content: string): void {
  const existing = supportFiles.get(path);
  if (existing) {
    existing.count += 1;
    return;
  }
  supportFiles.set(path, {
    count: 1,
    javascriptDisposable: monacoTypeScript.javascriptDefaults.addExtraLib(
      content,
      path,
    ),
    typescriptDisposable: monacoTypeScript.typescriptDefaults.addExtraLib(
      content,
      path,
    ),
  });
}

function removeSupportFile(path: string): void {
  const existing = supportFiles.get(path);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count > 0) return;
  existing.javascriptDisposable.dispose();
  existing.typescriptDisposable.dispose();
  supportFiles.delete(path);
}

export function acquireMonacoProjectSupport(
  context: EditorProjectContextResult,
): () => void {
  const files = context.supportFiles.map((file) => ({
    path: monaco.Uri.file(file.path).toString(),
    content: file.content,
  }));
  for (const file of files) {
    addSupportFile(file.path, file.content);
  }
  // Register declarations before changing compiler options. Monaco otherwise
  // recomputes diagnostics while its worker is still receiving extra libs,
  // which can leave stale "Cannot find module" markers until the next edit.
  configureMonaco(context.compilerOptions);
  return () => {
    for (const file of files) {
      removeSupportFile(file.path);
    }
  };
}
