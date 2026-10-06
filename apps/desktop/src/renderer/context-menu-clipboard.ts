import type { ToastInput } from "./components/ToastRegion";

const NOTICE_EVENT = "doolittle:context-menu-copy";
type CopyResult = "copied" | "failed";

/** Copies only the explicit menu target; never includes its content in notices. */
export async function copyContextText(text: string): Promise<void> {
  let result: CopyResult = "failed";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      result = "copied";
    }
  } catch {
    // Clipboard denial is recoverable through the ordinary native Copy menu.
  }
  window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: result }));
}

export function observeContextMenuCopy(
  pushToast: (toast: ToastInput) => string,
): () => void {
  const onCopy = (event: Event) => {
    const result: unknown = (event as CustomEvent<unknown>).detail;
    if (result !== "copied" && result !== "failed") return;
    pushToast({
      tone: result === "copied" ? "success" : "error",
      message:
        result === "copied"
          ? "Copied to clipboard."
          : "Could not copy. Try the standard Copy command.",
    });
  };
  window.addEventListener(NOTICE_EVENT, onCopy);
  return () => window.removeEventListener(NOTICE_EVENT, onCopy);
}
