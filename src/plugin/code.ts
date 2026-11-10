import {
  isUiToPluginMessage,
  type PluginToUiMessage,
} from "../shared/messages";

figma.showUI(__html__, {
  height: 440,
  themeColors: true,
  width: 360,
});

figma.ui.onmessage = (message: unknown) => {
  if (!isUiToPluginMessage(message)) {
    figma.notify("Copy Check received an unexpected message.", { error: true });
    return;
  }

  const response: PluginToUiMessage = {
    type: "pong",
    message: "React and the Figma main thread are connected.",
    selectionCount: figma.currentPage.selection.length,
  };

  figma.ui.postMessage(response);
};
