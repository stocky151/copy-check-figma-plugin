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
});
