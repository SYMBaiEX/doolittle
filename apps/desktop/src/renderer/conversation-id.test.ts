import { describe, expect, it, vi } from "vitest";
import { newConversationId } from "./conversation-id";

describe("newConversationId", () => {
  it("creates a desktop-scoped UUID through the platform crypto API", () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000001");

    expect(newConversationId()).toBe(
      "desktop:00000000-0000-4000-8000-000000000001",
    );

    randomUUID.mockRestore();
  });
});
