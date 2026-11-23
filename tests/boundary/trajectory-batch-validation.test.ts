import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleTrajectoryRoutes } from "../../packages/agent/src/server/routes/trajectories";

it.each([
  { prompts: "one prompt" },
  { prompts: ["valid prompt", null] },
  { prompts: [" "] },
])("rejects invalid batch prompts before creating tasks: %j", async (body) => {
  const url = new URL("http://127.0.0.1/trajectories/batch");
  const response = await handleTrajectoryRoutes(
    {} as AppContext,
    new Request(url, { method: "POST", body: JSON.stringify(body) }),
    url,
  );
  expect(response?.status).toBe(400);
});
