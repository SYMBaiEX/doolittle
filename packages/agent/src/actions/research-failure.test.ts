import { describe, expect, it } from "vitest";
import {
  classifyResearchFailure,
  ResearchPreflightError,
  researchFailureText,
} from "./research-failure";

describe("research failure public envelope", () => {
  it("classifies only supported evidence and never copies provider detail", () => {
    const secret = "sk-secret-provider-token https://private.example/question";
    const cases: Array<[unknown, string, number | undefined]> = [
      [
        new ResearchPreflightError("RESEARCH_DISABLED"),
        "RESEARCH_DISABLED",
        undefined,
      ],
      [
        new ResearchPreflightError("RESEARCH_MODEL_UNAVAILABLE"),
        "RESEARCH_MODEL_UNAVAILABLE",
        undefined,
      ],
      [
        Object.assign(new Error(secret), { status: 401, body: secret }),
        "RESEARCH_AUTHENTICATION_FAILED",
        401,
      ],
      [
        { message: secret, response: { status: 403, data: secret } },
        "RESEARCH_AUTHORIZATION_FAILED",
        403,
      ],
      [
        Object.assign(new Error(secret), {
          cause: { status: 429, headers: { authorization: secret } },
        }),
        "RESEARCH_RATE_LIMITED",
        429,
      ],
      [{ status: 408, message: secret }, "RESEARCH_TIMEOUT", 408],
      [{ code: "ETIMEDOUT", message: secret }, "RESEARCH_TIMEOUT", undefined],
      [
        { code: "ECONNRESET", message: secret },
        "RESEARCH_TRANSPORT_FAILED",
        undefined,
      ],
      [{ status: 500, message: secret }, "RESEARCH_PROVIDER_FAILED", 500],
      [
        new Error(`authentication_required ${secret}`),
        "RESEARCH_PROVIDER_FAILED",
        undefined,
      ],
      [
        new Error(`rate limited ${secret}`),
        "RESEARCH_PROVIDER_FAILED",
        undefined,
      ],
    ];
    for (const [error, code, status] of cases) {
      const failure = classifyResearchFailure(error);
      expect(failure.code).toBe(code);
      expect(failure.httpStatus).toBe(status);
      expect(JSON.stringify(failure)).not.toContain(secret);
      expect(researchFailureText(failure)).not.toContain(secret);
    }
  });

  it("only calls a failure cancellation when the request signal actually aborted", () => {
    const controller = new AbortController();
    const error = new DOMException("secret", "AbortError");
    expect(classifyResearchFailure(error, controller.signal).code).toBe(
      "RESEARCH_PROVIDER_FAILED",
    );
    controller.abort(error);
    expect(classifyResearchFailure(error, controller.signal)).toMatchObject({
      code: "RESEARCH_CANCELLED",
      category: "cancellation",
    });
  });

  it("does not call a durable task-service write error a provider failure", () => {
    const secret = "task-write-secret";
    const failure = classifyResearchFailure(
      new Error(secret),
      undefined,
      "task",
    );
    expect(failure).toMatchObject({
      code: "RESEARCH_TASK_RECORD_FAILED",
      category: "execution",
    });
    expect(researchFailureText(failure)).not.toContain(secret);
  });
});
