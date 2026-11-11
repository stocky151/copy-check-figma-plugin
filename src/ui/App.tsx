import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAuditResponse,
  STARTER_GUIDELINES,
  type Finding,
  type Guideline,
} from "../shared/audit";
import {
  isPluginToUiMessage,
  type Rewrite,
  type ScanSource,
  type TextItem,
  type UiToPluginMessage,
} from "../shared/messages";

const AUDIT_ENDPOINT =
  "https://copy-check-api.copy-check-figma-plugin.workers.dev/audit";

type ScanStatus = "loading" | "ready" | "error";
type AuditStatus = "idle" | "loading" | "success" | "error";
type View = "audit" | "guidelines";
type GuidelineSaveStatus = "idle" | "saving" | "saved" | "error";

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
  const [view, setView] = useState<View>("audit");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("loading");
  const [auditStatus, setAuditStatus] = useState<AuditStatus>("idle");
  const [items, setItems] = useState<TextItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>(
    STARTER_GUIDELINES.map((guideline) => ({ ...guideline })),
  );
  const [guidelineSaveStatus, setGuidelineSaveStatus] =
    useState<GuidelineSaveStatus>("idle");
  const [guidelineError, setGuidelineError] = useState("");
  const [source, setSource] = useState<ScanSource>("page");
  const [scanError, setScanError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applyingNodeId, setApplyingNodeId] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [appliedNodeIds, setAppliedNodeIds] = useState<Set<string>>(new Set());
  const pendingApply = useRef<{ nodeId: string; text: string } | null>(null);
  const pendingApplyAll = useRef<Rewrite[] | null>(null);
  const pendingGuidelineSave = useRef(false);

  const requestScan = useCallback(() => {
    setScanStatus("loading");
    setAuditStatus("idle");
    setFindings([]);
    setScanError("");
    setAuditError("");
    setApplyError("");
    setApplyingNodeId(null);
    setIsApplyingAll(false);
    setAppliedNodeIds(new Set());
    pendingApply.current = null;
    pendingApplyAll.current = null;
    pendingGuidelineSave.current = false;
    setGuidelineSaveStatus("idle");
    setGuidelineError("");
    sendToPlugin({ type: "scan" });
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const pluginMessage = readPluginMessage(event);

      if (!isPluginToUiMessage(pluginMessage)) {
        return;
      }

      if (pluginMessage.type === "error") {
        if (pendingApply.current !== null || pendingApplyAll.current !== null) {
          setApplyError(pluginMessage.message);
          setApplyingNodeId(null);
          setIsApplyingAll(false);
          pendingApply.current = null;
          pendingApplyAll.current = null;
          return;
        }

        if (pendingGuidelineSave.current) {
          setGuidelineError(pluginMessage.message);
          setGuidelineSaveStatus("error");
          pendingGuidelineSave.current = false;
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
            item.id === applied.nodeId
              ? {
                  ...item,
                  name: item.name === item.text ? applied.text : item.name,
                  text: applied.text,
                }
              : item,
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

      if (pluginMessage.type === "applied-all") {
        const appliedRewrites = pendingApplyAll.current;
        const expectedNodeIds = appliedRewrites?.map((rewrite) => rewrite.nodeId);
        if (
          appliedRewrites === null ||
          expectedNodeIds === undefined ||
          expectedNodeIds.length !== pluginMessage.nodeIds.length ||
          expectedNodeIds.some((nodeId, index) => nodeId !== pluginMessage.nodeIds[index])
        ) {
          setApplyError("Copy Check received an unexpected batch confirmation.");
          setIsApplyingAll(false);
          pendingApplyAll.current = null;
          return;
        }

        const replacementByNodeId = new Map(
          appliedRewrites.map((rewrite) => [rewrite.nodeId, rewrite.text] as const),
        );
        setItems((currentItems) =>
          currentItems.map((item) => {
            const replacement = replacementByNodeId.get(item.id);
            if (replacement === undefined) {
              return item;
            }

            return {
              ...item,
              name: item.name === item.text ? replacement : item.name,
              text: replacement,
            };
          }),
        );
        setAppliedNodeIds((currentIds) => {
          const nextIds = new Set(currentIds);
          for (const nodeId of pluginMessage.nodeIds) {
            nextIds.add(nodeId);
          }
          return nextIds;
        });
        setApplyError("");
        setIsApplyingAll(false);
        pendingApplyAll.current = null;
        return;
      }

      if (pluginMessage.type === "guidelines-saved") {
        setGuidelines(pluginMessage.guidelines);
        setGuidelineError("");
        setGuidelineSaveStatus("saved");
        pendingGuidelineSave.current = false;
        return;
      }

      setItems(pluginMessage.items);
      setSource(pluginMessage.source);
      setGuidelines(pluginMessage.guidelines);
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

  function applyAll(rewrites: Rewrite[]) {
    pendingApplyAll.current = rewrites;
    setApplyError("");
    setIsApplyingAll(true);
    sendToPlugin({ type: "apply-all", rewrites });
  }

  function invalidateAuditAfterGuidelineChange() {
    setAuditStatus("idle");
    setFindings([]);
    setAppliedNodeIds(new Set());
    setApplyError("");
    setGuidelineSaveStatus("idle");
    setGuidelineError("");
  }

  function updateGuideline(id: string, rule: string) {
    setGuidelines((currentGuidelines) =>
      currentGuidelines.map((guideline) =>
        guideline.id === id ? { ...guideline, rule } : guideline,
      ),
    );
    invalidateAuditAfterGuidelineChange();
  }

  function addGuideline() {
    if (guidelines.length >= 20) {
      return;
    }

    const existingIds = new Set(guidelines.map((guideline) => guideline.id));
    let index = 1;
    while (existingIds.has(`custom-${index}`)) {
      index += 1;
    }

    setGuidelines((currentGuidelines) => [
      ...currentGuidelines,
      { id: `custom-${index}`, rule: "" },
    ]);
    invalidateAuditAfterGuidelineChange();
  }

  function removeGuideline(id: string) {
    if (guidelines.length === 1) {
      return;
    }

    setGuidelines((currentGuidelines) =>
      currentGuidelines.filter((guideline) => guideline.id !== id),
    );
    invalidateAuditAfterGuidelineChange();
  }

  function restoreDefaultGuidelines() {
    setGuidelines(STARTER_GUIDELINES.map((guideline) => ({ ...guideline })));
    invalidateAuditAfterGuidelineChange();
  }

  function saveGuidelines() {
    if (guidelines.some((guideline) => guideline.rule.trim().length === 0)) {
      setGuidelineError("Every guideline needs text before you can save.");
      setGuidelineSaveStatus("error");
      return;
    }

    pendingGuidelineSave.current = true;
    setGuidelineError("");
    setGuidelineSaveStatus("saving");
    sendToPlugin({ type: "save-guidelines", guidelines });
  }

  async function checkCopy() {
    setAuditStatus("loading");
    setAuditError("");
    setApplyError("");
    setIsApplyingAll(false);
    setAppliedNodeIds(new Set());
    pendingApplyAll.current = null;
    setFindings([]);

    try {
      const response = await fetch(AUDIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          guidelines,
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
  const itemById = new Map(items.map((item) => [item.id, item] as const));
  const actionableRewriteByNodeId = new Map<string, Rewrite>();
  for (const finding of findings) {
    const item = itemById.get(finding.nodeId);
    if (
      appliedNodeIds.has(finding.nodeId) ||
      item?.editable !== true ||
      actionableRewriteByNodeId.has(finding.nodeId)
    ) {
      continue;
    }

    actionableRewriteByNodeId.set(finding.nodeId, {
      nodeId: finding.nodeId,
      text: finding.suggestion,
    });
  }
  const actionableRewrites = [...actionableRewriteByNodeId.values()];
  const busy =
    scanStatus === "loading" ||
    auditStatus === "loading" ||
    applyingNodeId !== null ||
    isApplyingAll ||
    guidelineSaveStatus === "saving";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">
            {view === "audit" ? "UX writing audit" : "Writing standards"}
          </p>
          <h1>Copy Check</h1>
        </div>
        {view === "audit" && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={requestScan}
            type="button"
          >
            Refresh
          </button>
        )}
      </header>

      <nav className="view-tabs" aria-label="Copy Check views">
        <button
          aria-selected={view === "audit"}
          className={view === "audit" ? "view-tab view-tab--active" : "view-tab"}
          onClick={() => setView("audit")}
          role="tab"
          type="button"
        >
          Audit
        </button>
        <button
          aria-selected={view === "guidelines"}
          className={
            view === "guidelines" ? "view-tab view-tab--active" : "view-tab"
          }
          onClick={() => setView("guidelines")}
          role="tab"
          type="button"
        >
          Guidelines
          <span>{guidelines.length}</span>
        </button>
      </nav>

      {view === "audit" && scanStatus === "loading" && (
        <section className="message-state" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Scanning text layers…</h2>
          <p>Reading the current selection from Figma.</p>
        </section>
      )}

      {view === "audit" && scanStatus === "error" && (
        <section className="message-state message-state--error" role="alert">
          <h2>Couldn’t scan this selection</h2>
          <p>{scanError}</p>
          <button className="secondary-button" onClick={requestScan} type="button">
            Try again
          </button>
        </section>
      )}

      {view === "audit" && scanStatus === "ready" && (
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
                  disabled={applyingNodeId !== null || isApplyingAll}
                  onClick={checkCopy}
                  type="button"
                >
                  {auditStatus === "success" ? "Check again" : "Check copy"}
                </button>
              )}

              {auditStatus === "idle" && (
                <section className="results" aria-label="Scanned text layers">
                  <p className="section-label">
                    Ready to check against {guidelines.length} guidelines
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
                    {" "}against {guidelines.length} guidelines.
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
                  <p>This copy follows all {guidelines.length} guidelines.</p>
                </section>
              )}

              {auditStatus === "success" && findings.length > 0 && (
                <section className="findings" aria-label="Copy findings">
                  <div className="findings-heading">
                    <p className="section-label">Findings</p>
                    <div className="findings-actions">
                      <span className="finding-count">
                        {activeFindingCount}{" "}
                        {activeFindingCount === 1 ? "issue" : "issues"} remaining
                      </span>
                      {actionableRewrites.length > 1 && (
                        <button
                          className="apply-all-button"
                          disabled={applyingNodeId !== null || isApplyingAll}
                          onClick={() => applyAll(actionableRewrites)}
                          type="button"
                        >
                          {isApplyingAll
                            ? "Applying all…"
                            : `Apply all (${actionableRewrites.length})`}
                        </button>
                      )}
                    </div>
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
                          const guideline = guidelines.find(
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
                                    disabled={applyingNodeId !== null || isApplyingAll}
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

      {view === "guidelines" && (
        <section className="guidelines-view" aria-label="Guideline editor">
          <div className="guidelines-intro">
            <h2>Your guidelines</h2>
            <p>
              Edit the rules Gemini uses during an audit. They are saved locally
              for this Figma plugin.
            </p>
          </div>

          <div className="guideline-list">
            {guidelines.map((guideline, index) => (
              <div className="guideline-editor" key={guideline.id}>
                <div className="guideline-editor-header">
                  <label htmlFor={`guideline-${index}`}>Rule {index + 1}</label>
                  <button
                    aria-label={`Remove rule ${index + 1}`}
                    className="remove-guideline-button"
                    disabled={guidelines.length === 1}
                    onClick={() => removeGuideline(guideline.id)}
                    title={
                      guidelines.length === 1
                        ? "Copy Check needs at least one guideline"
                        : "Remove guideline"
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  id={`guideline-${index}`}
                  maxLength={500}
                  onChange={(event) =>
                    updateGuideline(guideline.id, event.target.value)
                  }
                  rows={3}
                  value={guideline.rule}
                />
                <span className="character-count">{guideline.rule.length}/500</span>
              </div>
            ))}
          </div>

          <div className="guideline-list-footer">
            <button
              className="add-guideline-button"
              disabled={guidelines.length >= 20}
              onClick={addGuideline}
              type="button"
            >
              + Add guideline
            </button>
            <span>{guidelines.length}/20 rules</span>
          </div>

          {guidelineSaveStatus === "saved" && (
            <div className="inline-success" role="status">
              Guidelines saved on this device.
            </div>
          )}

          {guidelineSaveStatus === "error" && (
            <div className="inline-error" role="alert">
              {guidelineError}
            </div>
          )}

          <div className="guideline-actions">
            <button
              className="secondary-button"
              disabled={guidelineSaveStatus === "saving"}
              onClick={restoreDefaultGuidelines}
              type="button"
            >
              Restore defaults
            </button>
            <button
              className="save-guidelines-button"
              disabled={guidelineSaveStatus === "saving"}
              onClick={saveGuidelines}
              type="button"
            >
              {guidelineSaveStatus === "saving" ? "Saving…" : "Save guidelines"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
