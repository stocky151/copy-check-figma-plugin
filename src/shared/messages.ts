import type { Guideline } from "./audit";

export type TextItem = {
  id: string;
  name: string;
  text: string;
  editable: boolean;
};

export type ScanSource = "selection" | "page";

export type Rewrite = {
  nodeId: string;
  text: string;
  expectedText: string;
};

export type UiToPluginMessage =
  | { type: "scan" }
  | { type: "select"; nodeId: string }
  | { type: "apply"; nodeId: string; text: string; expectedText: string }
  | { type: "apply-all"; rewrites: Rewrite[] }
  | { type: "save-guidelines"; guidelines: Guideline[] };

export type PluginOperation = UiToPluginMessage["type"] | "unknown";

export type PluginToUiMessage =
  | {
      type: "scan-result";
      items: TextItem[];
      source: ScanSource;
      guidelines: Guideline[];
    }
  | { type: "applied"; nodeId: string }
  | { type: "applied-all"; nodeIds: string[] }
  | { type: "selected"; nodeId: string }
  | { type: "guidelines-saved"; guidelines: Guideline[] }
  | { type: "error"; message: string; operation: PluginOperation };

function isGuideline(value: unknown): value is Guideline {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 100 &&
    typeof candidate.rule === "string" &&
    candidate.rule.trim().length > 0 &&
    candidate.rule.length <= 500
  );
}

export function isGuidelineList(value: unknown): value is Guideline[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 20 ||
    !value.every(isGuideline)
  ) {
    return false;
  }

  const guidelineIds = value.map((guideline) => guideline.id);
  return new Set(guidelineIds).size === guidelineIds.length;
}

function isRewrite(value: unknown): value is Rewrite {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nodeId === "string" &&
    candidate.nodeId.length > 0 &&
    typeof candidate.text === "string" &&
    candidate.text.length > 0 &&
    candidate.text.length <= 2_000 &&
    typeof candidate.expectedText === "string" &&
    candidate.expectedText.length > 0 &&
    candidate.expectedText.length <= 2_000
  );
}

export function isUiToPluginMessage(
  value: unknown,
): value is UiToPluginMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.type === "scan") {
    return true;
  }

  if (candidate.type === "apply") {
    return isRewrite(candidate);
  }

  if (candidate.type === "apply-all") {
    if (
      !Array.isArray(candidate.rewrites) ||
      candidate.rewrites.length === 0 ||
      candidate.rewrites.length > 100 ||
      !candidate.rewrites.every(isRewrite)
    ) {
      return false;
    }

    const nodeIds = candidate.rewrites.map((rewrite) => rewrite.nodeId);
    return new Set(nodeIds).size === nodeIds.length;
  }

  if (candidate.type === "save-guidelines") {
    return isGuidelineList(candidate.guidelines);
  }

  return candidate.type === "select" && typeof candidate.nodeId === "string";
}

function isTextItem(value: unknown): value is TextItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.editable === "boolean"
  );
}

export function isPluginToUiMessage(
  value: unknown,
): value is PluginToUiMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.type === "error") {
    return (
      typeof candidate.message === "string" &&
      (candidate.operation === "scan" ||
        candidate.operation === "select" ||
        candidate.operation === "apply" ||
        candidate.operation === "apply-all" ||
        candidate.operation === "save-guidelines" ||
        candidate.operation === "unknown")
    );
  }

  if (candidate.type === "applied") {
    return typeof candidate.nodeId === "string";
  }

  if (candidate.type === "selected") {
    return typeof candidate.nodeId === "string";
  }

  if (candidate.type === "applied-all") {
    return (
      Array.isArray(candidate.nodeIds) &&
      candidate.nodeIds.length > 0 &&
      candidate.nodeIds.length <= 100 &&
      candidate.nodeIds.every((nodeId) => typeof nodeId === "string") &&
      new Set(candidate.nodeIds).size === candidate.nodeIds.length
    );
  }

  if (candidate.type === "guidelines-saved") {
    return isGuidelineList(candidate.guidelines);
  }

  return (
    candidate.type === "scan-result" &&
    (candidate.source === "selection" || candidate.source === "page") &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isTextItem) &&
    isGuidelineList(candidate.guidelines)
  );
}
