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

const capsules = {
  brief: { icon: NotebookText, label: "Brief" },
  browser: { icon: Globe2, label: "Browser" },
  diff: { icon: GitCompareArrows, label: "Diff" },
  file: { icon: FileText, label: "Source" },
  plan: { icon: ClipboardList, label: "Plan" },
  review: { icon: MessageSquareText, label: "Review" },
  terminal: { icon: Terminal, label: "Terminal" },
} as const;

export function contextCapsuleLabel(kind: ChatContextCapsule["kind"]): string {
  return capsules[kind]?.label ?? "Source";
}

export function ContextCapsuleIcon({
  kind,
}: {
  kind: ChatContextCapsule["kind"];
}) {
  return <UiIcon icon={capsules[kind]?.icon ?? Link2} size="sm" />;
}
