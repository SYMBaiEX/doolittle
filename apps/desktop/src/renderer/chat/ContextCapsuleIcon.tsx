import {
  ClipboardList,
  FileText,
  GitCompareArrows,
  Globe2,
  Link2,
  MessageSquareText,
  NotebookText,
  Terminal,
} from "lucide-react";
import type { ChatContextCapsule } from "../chat-context-handoff";
import { UiIcon } from "../components/UiIcon";

const capsuleIcons = {
  brief: NotebookText,
  browser: Globe2,
  diff: GitCompareArrows,
  file: FileText,
  plan: ClipboardList,
  review: MessageSquareText,
  terminal: Terminal,
} as const;

export function ContextCapsuleIcon({
  kind,
}: {
  kind: ChatContextCapsule["kind"];
}) {
  return <UiIcon icon={capsuleIcons[kind] ?? Link2} size="sm" />;
}
