import {
  isUiToPluginMessage,
  type PluginToUiMessage,
  type ScanSource,
  type TextItem,
} from "../shared/messages";

figma.showUI(__html__, {
  height: 560,
  themeColors: true,
  width: 360,
});

function collectTextNodes(roots: readonly SceneNode[]): TextNode[] {
  const textNodes = new Map<string, TextNode>();

  function visit(node: SceneNode) {
    if (node.type === "TEXT") {
      if (node.characters.trim().length > 0) {
        textNodes.set(node.id, node);
      }
      return;
    }

    if ("children" in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  for (const root of roots) {
    visit(root);
  }

  return [...textNodes.values()];
}

function toTextItem(node: TextNode): TextItem {
  return {
    id: node.id,
    name: node.name,
    text: node.characters,
    editable: node.fontName !== figma.mixed && !node.hasMissingFont,
  };
}

async function scanCurrentContext(): Promise<{
  items: TextItem[];
  source: ScanSource;
}> {
  await figma.currentPage.loadAsync();

  const selection = figma.currentPage.selection;
  const source: ScanSource = selection.length > 0 ? "selection" : "page";
  const roots = selection.length > 0 ? selection : figma.currentPage.children;
  const items = collectTextNodes(roots).map(toTextItem);

  return { items, source };
}

function isSelectableSceneNode(node: BaseNode): node is SceneNode {
  return node.type !== "DOCUMENT" && node.type !== "PAGE";
}

async function selectNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (node === null || !isSelectableSceneNode(node)) {
    throw new Error("That text layer is no longer available.");
  }

  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

async function applyRewrite(nodeId: string, text: string) {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (node === null || node.type !== "TEXT") {
    throw new Error("That text layer is no longer available.");
  }

  if (node.hasMissingFont) {
    throw new Error("This layer uses a missing font and must be edited manually.");
  }

  if (node.fontName === figma.mixed) {
    throw new Error("This layer uses mixed fonts and must be edited manually.");
  }

  await figma.loadFontAsync(node.fontName);
  node.characters = text;
  figma.commitUndo();

  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

function sendError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Copy Check encountered an error.";
  const response: PluginToUiMessage = { type: "error", message };
  figma.ui.postMessage(response);
}

figma.ui.onmessage = async (message: unknown) => {
  if (!isUiToPluginMessage(message)) {
    sendError(new Error("Copy Check received an unexpected message."));
    return;
  }

  try {
    if (message.type === "scan") {
      const result = await scanCurrentContext();
      const response: PluginToUiMessage = {
        type: "scan-result",
        ...result,
      };
      figma.ui.postMessage(response);
      return;
    }

    if (message.type === "apply") {
      await applyRewrite(message.nodeId, message.text);
      const response: PluginToUiMessage = {
        type: "applied",
        nodeId: message.nodeId,
      };
      figma.ui.postMessage(response);
      return;
    }

    await selectNode(message.nodeId);
  } catch (error) {
    sendError(error);
  }
};
