import { expect, it } from "vitest";
import {
  type BotPermissions,
  isBotPermissions,
} from "../../packages/contracts/src/bots";
import {
  isBotId,
  isUuid,
  isUuidV4,
} from "../../packages/contracts/src/identifiers";

it("shares the bot identifier boundary contract", () => {
  expect(isBotId("worker-one")).toBe(true);
  expect(isBotId("00000000-0000-4000-8000-000000000001")).toBe(true);
  expect(isBotId("Worker-One")).toBe(false);
  expect(isBotId("_worker")).toBe(false);
  expect(isBotId(`a${"b".repeat(64)}`)).toBe(false);
  expect(isBotId(null)).toBe(false);
});

it("separates generic UUID identity from randomUUID v4 capabilities", () => {
  const legacyAgentId = "9f21e797-127f-0eba-b547-92f9b113fb1e";
  const randomId = "00000000-0000-4000-8000-000000000001";
  expect(isUuid(legacyAgentId)).toBe(true);
  expect(isUuidV4(legacyAgentId)).toBe(false);
  expect(isUuid(randomId)).toBe(true);
  expect(isUuidV4(randomId)).toBe(true);
  expect(isUuid("00000000000040008000000000000001")).toBe(false);
  expect(isUuidV4("00000000-0000-1000-8000-000000000001")).toBe(false);
});

it("shares structural bot permission validation with explicit legacy bounds", () => {
  const permissions: BotPermissions = {
    connectionIds: ["connection"],
    workspacePaths: ["/workspace"],
    toolIds: ["READ_FILE"],
    allowMutation: false,
    allowDelegation: true,
  };
  expect(isBotPermissions(permissions)).toBe(true);
  expect(
    isBotPermissions({
      ...permissions,
      connectionIds: [""],
    }),
  ).toBe(false);
  expect(
    isBotPermissions(
      { ...permissions, connectionIds: [""] },
      { allowBlankEntries: true },
    ),
  ).toBe(true);
  expect(isBotPermissions(permissions, { maxEntries: 0 })).toBe(false);
  expect(isBotPermissions(permissions, { maxValueLength: 4 })).toBe(false);
  expect(isBotPermissions({ ...permissions, allowMutation: "false" })).toBe(
    false,
  );
});
