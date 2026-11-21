import {
  File,
  FileCode2,
  FileJson,
  FileText,
  Settings2,
  Terminal,
} from "lucide-react";
import { detectCodeLanguage } from "../code-language";
import { UiIcon } from "./UiIcon";

export function WorkspaceFileIcon({ path }: { path: string }) {
  const language = detectCodeLanguage(path);
  const icon =
    language.id === "plaintext"
      ? File
      : language.id === "markdown"
        ? FileText
        : language.id === "json"
          ? FileJson
          : language.id === "shell" || language.id === "powershell"
            ? Terminal
            : ["ini", "yaml", "toml", "dockerfile"].includes(language.id)
              ? Settings2
              : FileCode2;
  return (
    <span
      aria-hidden="true"
      className="workspace-file-icon"
      data-language={language.id}
    >
      <UiIcon icon={icon} size="xs" />
    </span>
  );
}
