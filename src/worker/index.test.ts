import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditRequest } from "../shared/audit";
import worker from "./index";

const validRequest: AuditRequest = {
  items: [
    {
      id: "1:2",
      name: "Button",
      text: "Click here",
      editable: true,
    },
  ],
  guidelines: [
    {
      id: "g4",
      rule: 'Link text names its destination. Never "click here".',
    },
  ],
};

function auditRequest(body: unknown) {
  return new Request("https://copy-check.test/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rateLimiter(success = true) {
  return {
    limit: vi.fn().mockResolvedValue({ success }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Copy Check Worker", () => {
  it("reports that the service is healthy", async () => {
    const response = await worker.fetch(
      new Request("https://copy-check.test/health"),
      {},
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("answers CORS preflight requests", async () => {
    const response = await worker.fetch(
      new Request("https://copy-check.test/audit", { method: "OPTIONS" }),
      {},
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects malformed requests before calling Gemini", async () => {
    const response = await worker.fetch(auditRequest({ items: [] }), {
      GEMINI_API_KEY: "test-key",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid audit request.",
    });
  });

  it("rejects request bodies larger than 64 KiB", async () => {
    const response = await worker.fetch(
      new Request("https://copy-check.test/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "x".repeat(64 * 1_024 + 1),
      }),
      {
        GEMINI_API_KEY: "test-key",
        AUDIT_RATE_LIMITER: rateLimiter(),
      },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body is too large.",
    });
  });

  it("rate-limits audit requests by their Cloudflare client IP", async () => {
    const limiter = rateLimiter(false);
    const request = auditRequest(validRequest);
    request.headers.set("CF-Connecting-IP", "203.0.113.10");

    const response = await worker.fetch(request, {
      GEMINI_API_KEY: "test-key",
      AUDIT_RATE_LIMITER: limiter,
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Too many audit requests. Please try again shortly.",
    });
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(limiter.limit).toHaveBeenCalledWith({ key: "203.0.113.10" });
  });

  it("rejects requests with more than 100 text items", async () => {
    const oversizedRequest: AuditRequest = {
      ...validRequest,
      items: Array.from({ length: 101 }, (_, index) => ({
        id: `1:${index + 1}`,
        name: `Layer ${index + 1}`,
        text: `Text ${index + 1}`,
        editable: true,
      })),
    };

    const response = await worker.fetch(auditRequest(oversizedRequest), {
      GEMINI_API_KEY: "test-key",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid audit request.",
    });
  });

  it("requires the server-side API key", async () => {
    const response = await worker.fetch(auditRequest(validRequest), {});

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The model service is not configured.",
    });
  });

  it("falls back after retries, validates findings, and drops invented IDs", async () => {
    const modelOutput = {
      findings: [
        {
          nodeId: "1:2",
          guidelineId: "g4",
          issue: "The label does not name a destination.",
          suggestion: "View account details",
        },
        {
          nodeId: "invented-node",
          guidelineId: "g4",
          issue: "Invented finding.",
          suggestion: "Ignore this",
        },
      ],
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(
        new Response("Still unavailable", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("Fallback unavailable", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("Second fallback unavailable", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("Third fallback unavailable", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: JSON.stringify(modelOutput) }],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const response = await worker.fetch(auditRequest(validRequest), {
      GEMINI_API_KEY: "test-key",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      findings: [modelOutput.findings[0]],
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("x-goog-api-key")).toBe("test-key");

    const primaryBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const fallbackBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    const secondFallbackBody = JSON.parse(
      String(fetchMock.mock.calls[3]?.[1]?.body),
    );
    const thirdFallbackBody = JSON.parse(
      String(fetchMock.mock.calls[4]?.[1]?.body),
    );
    const finalFallbackBody = JSON.parse(
      String(fetchMock.mock.calls[5]?.[1]?.body),
    );
    expect(primaryBody.model).toBe("gemini-3.1-flash-lite");
    expect(retryBody.model).toBe("gemini-3.1-flash-lite");
    expect(fallbackBody.model).toBe("gemini-3.5-flash");
    expect(secondFallbackBody.model).toBe("gemini-3.6-flash");
    expect(thirdFallbackBody.model).toBe("gemini-3.7-flash");
    expect(finalFallbackBody.model).toBe("gemini-3.8-flash");
  });

  it("rejects malformed Gemini output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "not JSON" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await worker.fetch(auditRequest(validRequest), {
      GEMINI_API_KEY: "test-key",
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "The model service returned malformed JSON.",
    });
  });

  it("drops deterministic false positives for unedited starter rules", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    findings: [
                      {
                        nodeId: "1:2",
                        guidelineId: "g3",
                        issue: "The label is supposedly too long.",
                        suggestion: "Sign in",
                      },
                      {
                        nodeId: "1:2",
                        guidelineId: "g8",
                        issue: "The button supposedly cannot use an exclamation mark.",
                        suggestion: "Sign in now",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await worker.fetch(
      auditRequest({
        items: [
          {
            id: "1:2",
            name: "Button",
            text: "SIGN IN NOW!",
            editable: true,
          },
        ],
        guidelines: [
          {
            id: "g3",
            rule: "Keep button labels to three words or fewer.",
          },
          {
            id: "g8",
            rule: "No exclamation marks in errors or warnings.",
          },
        ],
      }),
      { GEMINI_API_KEY: "test-key" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ findings: [] });
  });

  it("leaves edited rules model-driven instead of applying a starter-rule check", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    findings: [
                      {
                        nodeId: "1:2",
                        guidelineId: "g3",
                        issue: "This custom rule requires a shorter label.",
                        suggestion: "Sign in",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await worker.fetch(
      auditRequest({
        items: [
          {
            id: "1:2",
            name: "Button",
            text: "SIGN IN NOW!",
            editable: true,
          },
        ],
        guidelines: [
          {
            id: "g3",
            rule: "Button labels must contain no more than two words.",
          },
        ],
      }),
      { GEMINI_API_KEY: "test-key" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      findings: [
        {
          nodeId: "1:2",
          guidelineId: "g3",
          issue: "This custom rule requires a shorter label.",
          suggestion: "Sign in",
        },
      ],
    });
  });
});
