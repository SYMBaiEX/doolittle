import { expect, it } from "vitest";
import {
  normalizeSessions,
  sessionMessageCountLabel,
} from "../../apps/desktop/src/renderer/dashboard-helpers";

it("omits transcript role markers from session card copy", () => {
  const [session] = normalizeSessions([
    {
      sessionId: "session",
      messageCount: 1,
      participants: ["user", "assistant"],
      preview: ["[user] Make a simple html, css and js game"],
      startedAt: "2026-11-24T12:00:00.000Z",
    },
  ]);

  expect(session.title).toBe("Make a simple html, css and js game");
  expect(session.preview).toBe("Make a simple html, css and js game");
});

it("uses singular and plural message count labels", () => {
  expect(sessionMessageCountLabel(1)).toBe("1 message");
  expect(sessionMessageCountLabel(2)).toBe("2 messages");
});
