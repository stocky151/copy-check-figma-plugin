import type { Guideline } from "../../shared/audit";
import type { GuidelineSaveStatus } from "../types";

type GuidelinesViewProps = {
  guidelineError: string;
  guidelines: Guideline[];
  saveStatus: GuidelineSaveStatus;
  onAddGuideline: () => void;
  onRemoveGuideline: (id: string) => void;
  onRestoreDefaults: () => void;
  onSave: () => void;
  onUpdateGuideline: (id: string, rule: string) => void;
};

export function GuidelinesView({
  guidelineError,
  guidelines,
  saveStatus,
  onAddGuideline,
  onRemoveGuideline,
  onRestoreDefaults,
  onSave,
  onUpdateGuideline,
}: GuidelinesViewProps) {
  return (
    <section className="guidelines-view" aria-label="Guideline editor">
      <div className="guidelines-intro">
        <h2>Your guidelines</h2>
        <p>
          Edit the rules Gemini uses during an audit. They are saved locally for this
          Figma plugin.
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
                onClick={() => onRemoveGuideline(guideline.id)}
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
              onChange={(event) => onUpdateGuideline(guideline.id, event.target.value)}
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
          onClick={onAddGuideline}
          type="button"
        >
          + Add guideline
        </button>
        <span>{guidelines.length}/20 rules</span>
      </div>

      {saveStatus === "saved" && (
        <div className="inline-success" role="status">
          Guidelines saved on this device.
        </div>
      )}

      {saveStatus === "error" && (
        <div className="inline-error" role="alert">
          {guidelineError}
        </div>
      )}

      <div className="guideline-actions">
        <button
          className="secondary-button"
          disabled={saveStatus === "saving"}
          onClick={onRestoreDefaults}
          type="button"
        >
          Restore defaults
        </button>
        <button
          className="save-guidelines-button"
          disabled={saveStatus === "saving"}
          onClick={onSave}
          type="button"
        >
          {saveStatus === "saving" ? "Saving…" : "Save guidelines"}
        </button>
      </div>
    </section>
  );
}
