import type { Finding, Guideline } from "../../shared/audit";
import type { Rewrite, ScanSource, TextItem } from "../../shared/messages";
import type { AuditStatus, ScanStatus } from "../types";
import { FindingGroup } from "./FindingGroup";

type AuditViewProps = {
  appliedNodeIds: Set<string>;
  applyingNodeId: string | null;
  applyError: string;
  auditError: string;
  auditStatus: AuditStatus;
  findings: Finding[];
  guidelines: Guideline[];
  isApplyingAll: boolean;
  items: TextItem[];
  onApplyAll: (rewrites: Rewrite[]) => void;
  onApplyFinding: (finding: Finding) => void;
  onCheckCopy: () => void;
  onRequestScan: () => void;
  onSelectLayer: (nodeId: string) => void;
  scanError: string;
  scanStatus: ScanStatus;
  source: ScanSource;
};

function sourceLabel(source: ScanSource) {
  return source === "selection" ? "selected layers" : "current page";
}

export function AuditView({
  appliedNodeIds,
  applyingNodeId,
  applyError,
  auditError,
  auditStatus,
  findings,
  guidelines,
  isApplyingAll,
  items,
  onApplyAll,
  onApplyFinding,
  onCheckCopy,
  onRequestScan,
  onSelectLayer,
  scanError,
  scanStatus,
  source,
}: AuditViewProps) {
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

  return (
    <>
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
          <button className="secondary-button" onClick={onRequestScan} type="button">
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
                  disabled={applyingNodeId !== null || isApplyingAll}
                  onClick={onCheckCopy}
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
                        onClick={() => onSelectLayer(item.id)}
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
                    Comparing {items.length} {items.length === 1 ? "layer" : "layers"}{" "}
                    against {guidelines.length} guidelines.
                  </p>
                </section>
              )}

              {auditStatus === "error" && (
                <section className="message-state message-state--error" role="alert">
                  <h2>Couldn’t check this copy</h2>
                  <p>{auditError}</p>
                  <button className="secondary-button" onClick={onCheckCopy} type="button">
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
                        {activeFindingCount} {activeFindingCount === 1 ? "issue" : "issues"}{" "}
                        remaining
                      </span>
                      {actionableRewrites.length > 1 && (
                        <button
                          className="apply-all-button"
                          disabled={applyingNodeId !== null || isApplyingAll}
                          onClick={() => onApplyAll(actionableRewrites)}
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

                    return (
                      <FindingGroup
                        applyingNodeId={applyingNodeId}
                        guidelines={guidelines}
                        isApplied={appliedNodeIds.has(item.id)}
                        isApplyingAll={isApplyingAll}
                        item={item}
                        key={item.id}
                        nodeFindings={nodeFindings}
                        onApplyFinding={onApplyFinding}
                        onSelectLayer={onSelectLayer}
                      />
                    );
                  })}
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
