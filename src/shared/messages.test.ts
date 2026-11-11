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

  it("accepts a valid guideline save and confirmation", () => {
    const guidelines = [
      { id: "g1", rule: "Use sentence case." },
      { id: "custom-1", rule: "Use plain language." },
    ];

    expect(
      isUiToPluginMessage({ type: "save-guidelines", guidelines }),
    ).toBe(true);
    expect(
      isPluginToUiMessage({ type: "guidelines-saved", guidelines }),
    ).toBe(true);
  });

  it("rejects empty, duplicate, or excessive guideline lists", () => {
    expect(
      isUiToPluginMessage({ type: "save-guidelines", guidelines: [] }),
    ).toBe(false);
    expect(
      isUiToPluginMessage({
        type: "save-guidelines",
        guidelines: [
          { id: "g1", rule: "Use sentence case." },
          { id: "g1", rule: "Duplicate ID." },
        ],
      }),
    ).toBe(false);
    expect(
      isUiToPluginMessage({
        type: "save-guidelines",
        guidelines: Array.from({ length: 21 }, (_, index) => ({
          id: `g${index + 1}`,
          rule: `Rule ${index + 1}`,
        })),
      }),
    ).toBe(false);
  });
});
