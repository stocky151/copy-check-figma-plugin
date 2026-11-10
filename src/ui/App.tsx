import { useCallback, useEffect, useState } from "react";
import {
  isPluginToUiMessage,
  type ScanSource,
  type TextItem,
  type UiToPluginMessage,
} from "../shared/messages";

type ScanStatus = "loading" | "ready" | "error";

function readPluginMessage(event: MessageEvent<unknown>): unknown {
  if (typeof event.data !== "object" || event.data === null) {
    return undefined;
  }

  const data = event.data as Record<string, unknown>;
  return data.pluginMessage;
}

function sendToPlugin(pluginMessage: UiToPluginMessage) {
  parent.postMessage({ pluginMessage }, "https://www.figma.com");
}

function sourceLabel(source: ScanSource) {
  return source === "selection" ? "selected layers" : "current page";
}

export function App() {
  const [status, setStatus] = useState<ScanStatus>("loading");
  const [items, setItems] = useState<TextItem[]>([]);
  const [source, setSource] = useState<ScanSource>("page");
  const [errorMessage, setErrorMessage] = useState("");

  const requestScan = useCallback(() => {
    setStatus("loading");
    setErrorMessage("");
    sendToPlugin({ type: "scan" });
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const pluginMessage = readPluginMessage(event);

      if (!isPluginToUiMessage(pluginMessage)) {
        return;
      }

      if (pluginMessage.type === "error") {
        setStatus("error");
        setErrorMessage(pluginMessage.message);
        return;
      }

      setItems(pluginMessage.items);
      setSource(pluginMessage.source);
      setStatus("ready");
    }

    window.addEventListener("message", handleMessage);
    requestScan();

    return () => window.removeEventListener("message", handleMessage);
  }, [requestScan]);

  function selectLayer(nodeId: string) {
    sendToPlugin({ type: "select", nodeId });
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Text scan</p>
          <h1>Copy Check</h1>
        </div>
        <button
          className="secondary-button"
          disabled={status === "loading"}
          onClick={requestScan}
          type="button"
        >
          Refresh
        </button>
      </header>

      {status === "loading" && (
        <section className="message-state" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Scanning text layers…</h2>
          <p>Reading the current selection from Figma.</p>
        </section>
      )}

      {status === "error" && (
        <section className="message-state message-state--error" role="alert">
          <h2>Couldn’t scan this selection</h2>
          <p>{errorMessage}</p>
          <button className="secondary-button" onClick={requestScan} type="button">
            Try again
          </button>
        </section>
      )}

      {status === "ready" && (
        <>
          <section className="scan-summary" aria-live="polite">
            <div>
              <strong>{items.length}</strong>
              <span>{items.length === 1 ? "text layer" : "text layers"}</span>
            </div>
            <p>Found in {sourceLabel(source)}</p>
          </section>

          {items.length === 0 ? (
            <section className="message-state">
              <h2>No copy found</h2>
              <p>Select a frame containing text, then press Refresh.</p>
            </section>
          ) : (
            <section className="results" aria-label="Scanned text layers">
              <p className="section-label">Click a layer to find it on the canvas</p>
              <div className="result-list">
                {items.map((item) => (
                  <button
                    className="result-row"
                    key={item.id}
                    onClick={() => selectLayer(item.id)}
                    type="button"
                  >
                    <span className="result-content">
                      <span className="layer-name">{item.name}</span>
                      <span className="layer-copy">{item.text}</span>
                      {!item.editable && (
                        <span className="manual-badge">Apply manually</span>
                      )}
                    </span>
                    <span className="chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
