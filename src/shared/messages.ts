export type TextItem = {
  id: string;
  name: string;
  text: string;
  editable: boolean;
};

export type ScanSource = "selection" | "page";

export type UiToPluginMessage =
  | { type: "scan" }
  | { type: "select"; nodeId: string }
  | { type: "apply"; nodeId: string; text: string };

export type PluginToUiMessage =
  | {
      type: "scan-result";
      items: TextItem[];
      source: ScanSource;
    }
  | { type: "applied"; nodeId: string }
  | { type: "error"; message: string };

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
    return (
      typeof candidate.nodeId === "string" &&
      candidate.nodeId.length > 0 &&
      typeof candidate.text === "string" &&
      candidate.text.length > 0 &&
      candidate.text.length <= 2_000
    );
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

  return (
    candidate.type === "scan-result" &&
    (candidate.source === "selection" || candidate.source === "page") &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isTextItem)
  );
}
