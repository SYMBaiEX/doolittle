import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { UiIcon } from "../components/UiIcon";

export function ChatNotice({
  action,
  children,
  tone = "neutral",
}: {
  action?: { label: string; invoke: () => void; disabled?: boolean };
  children: ReactNode;
  tone?: "neutral" | "warning" | "error";
}) {
  return (
    <div
      className="chat-notice"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <UiIcon icon={tone === "neutral" ? Info : CircleAlert} />
      <span>{children}</span>
      {action ? (
        <button
          disabled={action.disabled}
          onClick={action.invoke}
          type="button"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
