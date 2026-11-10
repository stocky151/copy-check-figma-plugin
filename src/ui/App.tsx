import { useEffect, useState } from "react";
import {
  isPluginToUiMessage,
  type UiToPluginMessage,
} from "../shared/messages";

type ConnectionStatus = "idle" | "waiting" | "connected";

function readPluginMessage(event: MessageEvent<unknown>): unknown {
  if (typeof event.data !== "object" || event.data === null) {
    return undefined;
  }

  const data = event.data as Record<string, unknown>;
  return data.pluginMessage;
}

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [message, setMessage] = useState(
    "Run the connection check to prove both plugin environments can communicate.",
  );
  const [selectionCount, setSelectionCount] = useState<number | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const pluginMessage = readPluginMessage(event);

      if (!isPluginToUiMessage(pluginMessage)) {
        return;
      }

      setStatus("connected");
      setMessage(pluginMessage.message);
      setSelectionCount(pluginMessage.selectionCount);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function checkConnection() {
    const pluginMessage: UiToPluginMessage = { type: "ping" };

    setStatus("waiting");
    setMessage("Waiting for the Figma main thread…");
    parent.postMessage({ pluginMessage }, "https://www.figma.com");
  }

  return (
    <main className="app-shell">
      <header className="intro">
        <p className="eyebrow">Foundation checkpoint</p>
        <h1>Copy Check</h1>
        <p className="lede">Review UI copy without leaving the canvas.</p>
      </header>

      <section className="status-card" aria-live="polite">
        <div className={`status-dot status-dot--${status}`} aria-hidden="true" />
        <div>
          <h2>{status === "connected" ? "Connected" : "Connection test"}</h2>
          <p>{message}</p>
          {selectionCount !== null && (
            <p className="selection-count">
              Selected canvas layers: <strong>{selectionCount}</strong>
            </p>
          )}
        </div>
      </section>

      <button
        className="primary-button"
        disabled={status === "waiting"}
        onClick={checkConnection}
        type="button"
      >
        {status === "waiting" ? "Checking…" : "Check connection"}
      </button>

      <p className="footnote">
        This test does not read or change your document yet.
      </p>
    </main>
  );
}
