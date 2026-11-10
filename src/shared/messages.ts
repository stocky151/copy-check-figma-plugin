export type UiToPluginMessage = {
  type: "ping";
};

export type PluginToUiMessage = {
  type: "pong";
  message: string;
  selectionCount: number;
};

export function isUiToPluginMessage(
  value: unknown,
): value is UiToPluginMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.type === "ping";
}

export function isPluginToUiMessage(
  value: unknown,
): value is PluginToUiMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "pong" &&
    typeof candidate.message === "string" &&
    typeof candidate.selectionCount === "number"
  );
}
