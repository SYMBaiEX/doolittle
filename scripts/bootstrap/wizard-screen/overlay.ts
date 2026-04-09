import blessed from "blessed";

export function createWizardOverlay<T>(
  screen: blessed.Widgets.Screen,
  title: string,
  body: string,
  onMount: (
    overlay: blessed.Widgets.BoxElement,
    settle: (value: T) => void,
  ) => void,
  onAfterClose: () => void,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const overlay = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "72%",
      height: "70%",
      border: "line",
      label: ` ${title} `,
      tags: true,
      padding: { top: 1, left: 1, right: 1, bottom: 1 },
      style: {
        border: { fg: "#ffb000" },
        fg: "white",
        bg: "#151c24",
      },
    });
    blessed.box({
      parent: overlay,
      top: 0,
      left: 0,
      width: "100%-2",
      height: 3,
      tags: true,
      content: body,
    });
    onMount(overlay, (value) => {
      overlay.destroy();
      onAfterClose();
      settle(value);
    });
  });
}
