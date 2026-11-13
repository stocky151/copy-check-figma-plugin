import {
  isGuidelineList,
  isUiToPluginMessage,
  type PluginOperation,
  type PluginToUiMessage,
  type Rewrite,
  type ScanSource,
  type TextItem,
} from "../shared/messages";
import { STARTER_GUIDELINES, type Guideline } from "../shared/audit";

const GUIDELINES_STORAGE_KEY = "copy-check-guidelines-v1";

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
  guidelines: Guideline[];
}> {
  await figma.currentPage.loadAsync();

  const selection = figma.currentPage.selection;
  const source: ScanSource = selection.length > 0 ? "selection" : "page";
  const roots = selection.length > 0 ? selection : figma.currentPage.children;
  const items = collectTextNodes(roots).map(toTextItem);
  const storedGuidelines: unknown = await figma.clientStorage.getAsync(
    GUIDELINES_STORAGE_KEY,
  );
  const guidelines = isGuidelineList(storedGuidelines)
    ? storedGuidelines
    : STARTER_GUIDELINES.map((guideline) => ({ ...guideline }));

  return { items, source, guidelines };
}

async function saveGuidelines(guidelines: Guideline[]) {
  const normalizedGuidelines = guidelines.map((guideline) => ({
    ...guideline,
    rule: guideline.rule.trim(),
  }));
  await figma.clientStorage.setAsync(
    GUIDELINES_STORAGE_KEY,
    normalizedGuidelines,
  );
  return normalizedGuidelines;
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

type PreparedRewrite = {
  node: TextNode;
  originalText: string;
  replacementText: string;
};

async function prepareRewrite(rewrite: Rewrite): Promise<PreparedRewrite> {
  const node = await figma.getNodeByIdAsync(rewrite.nodeId);

  if (node === null || node.type !== "TEXT") {
    throw new Error("That text layer is no longer available.");
  }

  if (node.characters !== rewrite.expectedText) {
    throw new Error(
      `“${node.name}” changed after this audit. Refresh and check the copy again before applying its rewrite.`,
    );
  }

  if (node.hasMissingFont) {
    throw new Error(`“${node.name}” uses a missing font and must be edited manually.`);
  }

  if (node.fontName === figma.mixed) {
    throw new Error(`“${node.name}” uses mixed fonts and must be edited manually.`);
  }

  return {
    node,
    originalText: node.characters,
    replacementText: rewrite.text,
  };
}

async function applyRewrites(rewrites: Rewrite[]) {
  const preparedRewrites = await Promise.all(rewrites.map(prepareRewrite));

  await Promise.all(
    preparedRewrites.map(({ node }) => {
      if (node.fontName === figma.mixed) {
        throw new Error(`“${node.name}” uses mixed fonts and must be edited manually.`);
      }

      return figma.loadFontAsync(node.fontName);
    }),
  );

  try {
    for (const rewrite of preparedRewrites) {
      rewrite.node.characters = rewrite.replacementText;
    }
  } catch (error) {
    for (const rewrite of preparedRewrites) {
      rewrite.node.characters = rewrite.originalText;
    }
    throw error;
  }

  figma.commitUndo();

  const nodes = preparedRewrites.map(({ node }) => node);
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
}

function sendError(error: unknown, operation: PluginOperation) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Copy Check encountered an error.";
  const response: PluginToUiMessage = { type: "error", message, operation };
  figma.ui.postMessage(response);
}

figma.ui.onmessage = async (message: unknown) => {
  if (!isUiToPluginMessage(message)) {
    sendError(new Error("Copy Check received an unexpected message."), "unknown");
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
      await applyRewrites([
        {
          nodeId: message.nodeId,
          text: message.text,
          expectedText: message.expectedText,
        },
      ]);
      const response: PluginToUiMessage = {
        type: "applied",
        nodeId: message.nodeId,
      };
      figma.ui.postMessage(response);
      return;
    }

    if (message.type === "apply-all") {
      await applyRewrites(message.rewrites);
      const response: PluginToUiMessage = {
        type: "applied-all",
        nodeIds: message.rewrites.map((rewrite) => rewrite.nodeId),
      };
      figma.ui.postMessage(response);
      return;
    }

    if (message.type === "save-guidelines") {
      const guidelines = await saveGuidelines(message.guidelines);
      const response: PluginToUiMessage = {
        type: "guidelines-saved",
        guidelines,
      };
      figma.ui.postMessage(response);
      return;
    }

    await selectNode(message.nodeId);
    const response: PluginToUiMessage = {
      type: "selected",
      nodeId: message.nodeId,
    };
    figma.ui.postMessage(response);
  } catch (error) {
    sendError(error, message.type);
  }
};
