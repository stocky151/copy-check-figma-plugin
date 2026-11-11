import { describe, expect, it } from "vitest";
import { isPluginToUiMessage, isUiToPluginMessage } from "./messages";

describe("plugin message validation", () => {
  it("accepts a valid apply request", () => {
    expect(
      isUiToPluginMessage({
        type: "apply",
        nodeId: "1:2",
        text: "Sign in",
      }),
    ).toBe(true);
  });

  it("rejects empty or oversized replacement text", () => {
    expect(
      isUiToPluginMessage({ type: "apply", nodeId: "1:2", text: "" }),
    ).toBe(false);
    expect(
      isUiToPluginMessage({
        type: "apply",
        nodeId: "1:2",
        text: "a".repeat(2_001),
      }),
    ).toBe(false);
  });

  it("accepts an applied confirmation", () => {
    expect(isPluginToUiMessage({ type: "applied", nodeId: "1:2" })).toBe(
      true,
    );
  });

  it("accepts a valid apply-all request and confirmation", () => {
    expect(
      isUiToPluginMessage({
        type: "apply-all",
        rewrites: [
          { nodeId: "1:2", text: "Sign in" },
          { nodeId: "1:3", text: "View account details" },
        ],
      }),
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "applied-all",
        nodeIds: ["1:2", "1:3"],
      }),
    ).toBe(true);
  });

  it("rejects duplicate nodes in an apply-all request", () => {
    expect(
      isUiToPluginMessage({
        type: "apply-all",
        rewrites: [
          { nodeId: "1:2", text: "Sign in" },
          { nodeId: "1:2", text: "Log in" },
        ],
      }),
    ).toBe(false);
  });
});
