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
};

export type UiToPluginMessage =
  | { type: "scan" }
  | { type: "select"; nodeId: string }
  | { type: "apply"; nodeId: string; text: string }
  | { type: "apply-all"; rewrites: Rewrite[] };

export type PluginToUiMessage =
  | {
      type: "scan-result";
      items: TextItem[];
      source: ScanSource;
    }
  | { type: "applied"; nodeId: string }
  | { type: "applied-all"; nodeIds: string[] }
  | { type: "error"; message: string };

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
    candidate.text.length <= 2_000
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
    return typeof candidate.message === "string";
  }

  if (candidate.type === "applied") {
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

  return (
    candidate.type === "scan-result" &&
    (candidate.source === "selection" || candidate.source === "page") &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isTextItem)
  );
}
