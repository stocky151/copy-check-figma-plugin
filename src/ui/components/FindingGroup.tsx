import type { Finding, Guideline } from "../../shared/audit";
import type { TextItem } from "../../shared/messages";

type FindingGroupProps = {
  applyingNodeId: string | null;
  guidelines: Guideline[];
  isApplied: boolean;
  isApplyingAll: boolean;
  item: TextItem;
  nodeFindings: Finding[];
  onApplyFinding: (finding: Finding) => void;
  onSelectLayer: (nodeId: string) => void;
};

export function FindingGroup({
  applyingNodeId,
  guidelines,
  isApplied,
  isApplyingAll,
  item,
  nodeFindings,
  onApplyFinding,
  onSelectLayer,
}: FindingGroupProps) {
  return (
    <article className={`finding-group${isApplied ? " finding-group--applied" : ""}`}>
      <button
        className="finding-target"
        onClick={() => onSelectLayer(item.id)}
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
      ) : (
        nodeFindings.map((finding) => {
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
                    onClick={() => onApplyFinding(finding)}
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
        })
      )}
    </article>
  );
}
