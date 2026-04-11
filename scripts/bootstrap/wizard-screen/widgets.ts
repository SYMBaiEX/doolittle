import blessed from "blessed";

export interface WizardScreenWidgets {
  header: blessed.Widgets.BoxElement;
  sidebar: blessed.Widgets.BoxElement;
  detail: blessed.Widgets.BoxElement;
  logBox: blessed.Widgets.BoxElement;
  footer: blessed.Widgets.BoxElement;
}

export function createWizardWidgets(
  screen: blessed.Widgets.Screen,
  chromeTop: number,
  footerContent: string,
): WizardScreenWidgets {
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: chromeTop,
    tags: true,
    style: {
      fg: "white",
      bg: "#ff6a00",
    },
    content: "",
    padding: { left: 1, right: 1 },
  });
  const sidebar = blessed.box({
    parent: screen,
    top: chromeTop,
    left: 0,
    width: 24,
    bottom: 1,
    border: "line",
    label: " Ritual Stages ",
    tags: true,
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: "#ff6a00" },
      fg: "white",
      bg: "#202833",
    },
    content: "",
  });
  const detail = blessed.box({
    parent: screen,
    top: chromeTop,
    left: 24,
    width: "100%-24",
    height: 6,
    border: "line",
    label: " Current Pulse ",
    tags: true,
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: "#55d6ff" },
      fg: "white",
      bg: "#202833",
    },
    content: "",
  });
  const logBox = blessed.box({
    parent: screen,
    top: chromeTop + 6,
    left: 24,
    width: "100%-24",
    bottom: 1,
    border: "line",
    label: " Setup Feed ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      style: { bg: "#3b4757" },
      track: { bg: "#202833" },
    },
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: "#4fd17d" },
      fg: "white",
      bg: "#202833",
    },
    content: "",
  });
  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: "#9dd7ff",
      bg: "#151c24",
    },
    content: footerContent,
  });

  return {
    header,
    sidebar,
    detail,
    logBox,
    footer,
  };
}
