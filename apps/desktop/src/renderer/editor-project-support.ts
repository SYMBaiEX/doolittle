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

interface MonacoTypeScriptApi {
  javascriptDefaults: MonacoLanguageServiceDefaults;
  typescriptDefaults: MonacoLanguageServiceDefaults;
}

const monacoTypeScript = (
  monaco.languages as unknown as {
    typescript: MonacoTypeScriptApi;
  }
).typescript;

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
  const compilerOptions = compilerOptionsForMonaco(options);
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
  configureMonaco(context.compilerOptions);
  const files = context.supportFiles.map((file) => ({
    path: monaco.Uri.file(file.path).toString(),
    content: file.content,
  }));
  for (const file of files) {
    addSupportFile(file.path, file.content);
  }
  return () => {
    for (const file of files) {
      removeSupportFile(file.path);
    }
  };
}
