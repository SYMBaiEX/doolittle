import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiResource, UnknownRecord } from "../lib";
import { OperationsTracePanel } from "./OperationsTracePanel";

const readyResource = <T,>(data: T): ApiResource<T> => ({
  data,
  error: "",
  loading: false,
  reload: () => undefined,
});

describe("OperationsTracePanel", () => {
  it("keeps secondary operational history bounded", () => {
    const deliveryEntries: UnknownRecord[] = Array.from(
      { length: 13 },
      (_, index) => ({ id: `delivery-${index}`, platform: `channel-${index}` }),
    );
    const commandEntries: UnknownRecord[] = Array.from(
      { length: 13 },
      (_, index) => ({ command: `command-${index}`, ok: true }),
    );
    const html = renderToStaticMarkup(
      <OperationsTracePanel
        commandEntries={commandEntries}
        deliveries={readyResource({ deliveries: deliveryEntries })}
        deliveryEntries={deliveryEntries}
        terminalHistory={readyResource({ commands: commandEntries })}
      />,
    );

    expect(html).toContain("channel-11");
    expect(html).not.toContain("channel-12");
    expect(html).toContain("command-11");
    expect(html).not.toContain("command-12");
  });
});
