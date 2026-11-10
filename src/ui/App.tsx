import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAuditResponse,
  STARTER_GUIDELINES,
  type Finding,
} from "../shared/audit";
import {
  isPluginToUiMessage,
  type ScanSource,
  type TextItem,
  type UiToPluginMessage,
} from "../shared/messages";

const AUDIT_ENDPOINT =
  "https://copy-check-api.copy-check-figma-plugin.workers.dev/audit";

type ScanStatus = "loading" | "ready" | "error";
type AuditStatus = "idle" | "loading" | "success" | "error";

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

function auditErrorMessage(status: number, payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    if (status === 502) {
      return "The writing service is temporarily busy. Please try again.";
    }

    return payload.error;
  }

  return "Copy Check could not complete the audit. Please try again.";
}

export function App() {
  const [scanStatus, setScanStatus] = useState<ScanStatus>("loading");
  const [auditStatus, setAuditStatus] = useState<AuditStatus>("idle");
  const [items, setItems] = useState<TextItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [source, setSource] = useState<ScanSource>("page");
  const [scanError, setScanError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applyingNodeId, setApplyingNodeId] = useState<string | null>(null);
  const [appliedNodeIds, setAppliedNodeIds] = useState<Set<string>>(new Set());
  const pendingApply = useRef<{ nodeId: string; text: string } | null>(null);

  const requestScan = useCallback(() => {
    setScanStatus("loading");
    setAuditStatus("idle");
    setFindings([]);
    setScanError("");
    setAuditError("");
    setApplyError("");
    setApplyingNodeId(null);
    setAppliedNodeIds(new Set());
    pendingApply.current = null;
    sendToPlugin({ type: "scan" });
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const pluginMessage = readPluginMessage(event);

      if (!isPluginToUiMessage(pluginMessage)) {
        return;
      }

      if (pluginMessage.type === "error") {
        if (pendingApply.current !== null) {
          setApplyError(pluginMessage.message);
          setApplyingNodeId(null);
          pendingApply.current = null;
          return;
        }

        setScanStatus("error");
        setScanError(pluginMessage.message);
        return;
      }

      if (pluginMessage.type === "applied") {
        const applied = pendingApply.current;
        if (applied === null || applied.nodeId !== pluginMessage.nodeId) {
          setApplyError("Copy Check received an unexpected edit confirmation.");
          setApplyingNodeId(null);
          pendingApply.current = null;
          return;
        }

        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === applied.nodeId ? { ...item, text: applied.text } : item,
          ),
        );
        setAppliedNodeIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.add(applied.nodeId);
          return nextIds;
        });
        setApplyError("");
        setApplyingNodeId(null);
        pendingApply.current = null;
        return;
      }

      setItems(pluginMessage.items);
      setSource(pluginMessage.source);
      setScanStatus("ready");
    }

    window.addEventListener("message", handleMessage);
    requestScan();

    return () => window.removeEventListener("message", handleMessage);
  }, [requestScan]);

  function selectLayer(nodeId: string) {
    sendToPlugin({ type: "select", nodeId });
  }

  function applyFinding(finding: Finding) {
    pendingApply.current = {
      nodeId: finding.nodeId,
      text: finding.suggestion,
    };
    setApplyError("");
    setApplyingNodeId(finding.nodeId);
    sendToPlugin({
      type: "apply",
      nodeId: finding.nodeId,
      text: finding.suggestion,
    });
  }

  async function checkCopy() {
    setAuditStatus("loading");
    setAuditError("");
    setApplyError("");
    setAppliedNodeIds(new Set());
    setFindings([]);

    try {
      const response = await fetch(AUDIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          guidelines: STARTER_GUIDELINES,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(auditErrorMessage(response.status, payload));
      }

      if (!isAuditResponse(payload)) {
        throw new Error("Copy Check received an invalid audit response.");
      }

      setFindings(payload.findings);
      setAuditStatus("success");
    } catch (error) {
      setAuditError(
        error instanceof Error
          ? error.message
          : "Copy Check could not complete the audit.",
      );
      setAuditStatus("error");
    }
  }

  const findingsByNodeId = new Map<string, Finding[]>();
  for (const finding of findings) {
    const nodeFindings = findingsByNodeId.get(finding.nodeId) ?? [];
    nodeFindings.push(finding);
    findingsByNodeId.set(finding.nodeId, nodeFindings);
  }

  const activeFindingCount = findings.filter(
    (finding) => !appliedNodeIds.has(finding.nodeId),
  ).length;
  const busy =
    scanStatus === "loading" ||
    auditStatus === "loading" ||
    applyingNodeId !== null;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">UX writing audit</p>
          <h1>Copy Check</h1>
        </div>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={requestScan}
          type="button"
        >
          Refresh
        </button>
      </header>

      {scanStatus === "loading" && (
        <section className="message-state" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Scanning text layers…</h2>
          <p>Reading the current selection from Figma.</p>
        </section>
      )}

      {scanStatus === "error" && (
        <section className="message-state message-state--error" role="alert">
          <h2>Couldn’t scan this selection</h2>
          <p>{scanError}</p>
          <button className="secondary-button" onClick={requestScan} type="button">
            Try again
          </button>
        </section>
      )}

      {scanStatus === "ready" && (
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
            <>
              {auditStatus !== "loading" && (
                <button
                  className="primary-button"
                  disabled={applyingNodeId !== null}
                  onClick={checkCopy}
                  type="button"
                >
                  {auditStatus === "success" ? "Check again" : "Check copy"}
                </button>
              )}

              {auditStatus === "idle" && (
                <section className="results" aria-label="Scanned text layers">
                  <p className="section-label">
                    Ready to check against {STARTER_GUIDELINES.length} guidelines
                  </p>
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

              {auditStatus === "loading" && (
                <section className="message-state audit-state" aria-live="polite">
                  <div className="spinner" aria-hidden="true" />
                  <h2>Checking your copy…</h2>
                  <p>
                    Comparing {items.length} {items.length === 1 ? "layer" : "layers"}
                    {" "}against {STARTER_GUIDELINES.length} guidelines.
                  </p>
                </section>
              )}

              {auditStatus === "error" && (
                <section className="message-state message-state--error" role="alert">
                  <h2>Couldn’t check this copy</h2>
                  <p>{auditError}</p>
                  <button className="secondary-button" onClick={checkCopy} type="button">
                    Try again
                  </button>
                </section>
              )}

              {auditStatus === "success" && findings.length === 0 && (
                <section className="message-state message-state--success" aria-live="polite">
                  <span className="success-icon" aria-hidden="true">
                    ✓
                  </span>
                  <h2>No issues found</h2>
                  <p>This copy follows all {STARTER_GUIDELINES.length} guidelines.</p>
                </section>
              )}

              {auditStatus === "success" && findings.length > 0 && (
                <section className="findings" aria-label="Copy findings">
                  <div className="findings-heading">
                    <p className="section-label">Findings</p>
                    <span className="finding-count">
                      {activeFindingCount}{" "}
                      {activeFindingCount === 1 ? "issue" : "issues"} remaining
                    </span>
                  </div>

                  {applyError.length > 0 && (
                    <div className="inline-error" role="alert">
                      {applyError}
                    </div>
                  )}

                  {items.map((item) => {
                    const nodeFindings = findingsByNodeId.get(item.id);
                    if (nodeFindings === undefined) {
                      return null;
                    }

                    const isApplied = appliedNodeIds.has(item.id);

                    return (
                      <article
                        className={`finding-group${isApplied ? " finding-group--applied" : ""}`}
                        key={item.id}
                      >
                        <button
                          className="finding-target"
                          onClick={() => selectLayer(item.id)}
                          type="button"
                        >
                          <span className="result-content">
                            <span className="layer-name">{item.name}</span>
                            <span className="layer-copy">{item.text}</span>
                          </span>
                          <span className="chevron" aria-hidden="true">
                            ›
                          </span>
                        </button>

                        {isApplied ? (
                          <div className="applied-confirmation" aria-live="polite">
                            <span className="applied-check" aria-hidden="true">
                              ✓
                            </span>
                            <div>
                              <strong>Rewrite applied</strong>
                              <p>Use Figma’s Undo command to reverse this change.</p>
                            </div>
                          </div>
                        ) : nodeFindings.map((finding) => {
                          const guideline = STARTER_GUIDELINES.find(
                            (candidate) => candidate.id === finding.guidelineId,
                          );

                          return (
                            <div
                              className="finding-detail"
                              key={`${finding.nodeId}:${finding.guidelineId}`}
                            >
                              <p className="rule-label">
                                {finding.guidelineId.toUpperCase()}
                                {guideline === undefined ? "" : ` · ${guideline.rule}`}
                              </p>
                              <p className="finding-issue">{finding.issue}</p>
                              <div className="suggestion">
                                <div>
                                  <span>Suggested rewrite</span>
                                  <p>{finding.suggestion}</p>
                                </div>
                                {item.editable ? (
                                  <button
                                    className="apply-button"
                                    disabled={applyingNodeId !== null}
                                    onClick={() => applyFinding(finding)}
                                    type="button"
                                  >
                                    {applyingNodeId === item.id ? "Applying…" : "Apply"}
                                  </button>
                                ) : (
                                  <span className="manual-badge">Apply manually</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </article>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
