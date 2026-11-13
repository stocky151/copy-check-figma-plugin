import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
import { AuditView } from "./components/AuditView";
import { GuidelinesView } from "./components/GuidelinesView";
import type { AuditStatus, GuidelineSaveStatus, ScanStatus } from "./types";

const AUDIT_ENDPOINT =
  "https://copy-check-api.copy-check-figma-plugin.workers.dev/audit";

type View = "audit" | "guidelines";

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
  const [selectionError, setSelectionError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applyingNodeId, setApplyingNodeId] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [appliedNodeIds, setAppliedNodeIds] = useState<Set<string>>(new Set());
  const pendingApply = useRef<Rewrite | null>(null);
  const pendingApplyAll = useRef<Rewrite[] | null>(null);
  const pendingSelection = useRef<string | null>(null);
  const pendingGuidelineSave = useRef(false);

  const requestScan = useCallback(() => {
    setScanStatus("loading");
    setAuditStatus("idle");
    setFindings([]);
    setScanError("");
    setSelectionError("");
    setAuditError("");
    setApplyError("");
    setApplyingNodeId(null);
    setIsApplyingAll(false);
    setAppliedNodeIds(new Set());
    pendingApply.current = null;
    pendingApplyAll.current = null;
    pendingSelection.current = null;
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
        if (
          pluginMessage.operation === "apply" ||
          pluginMessage.operation === "apply-all"
        ) {
          setApplyError(pluginMessage.message);
          setApplyingNodeId(null);
          setIsApplyingAll(false);
          pendingApply.current = null;
          pendingApplyAll.current = null;
          return;
        }

        if (pluginMessage.operation === "save-guidelines") {
          setGuidelineError(pluginMessage.message);
          setGuidelineSaveStatus("error");
          pendingGuidelineSave.current = false;
          return;
        }

        if (pluginMessage.operation === "select") {
          setSelectionError(pluginMessage.message);
          pendingSelection.current = null;
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

      if (pluginMessage.type === "selected") {
        if (pendingSelection.current !== pluginMessage.nodeId) {
          setSelectionError(
            "Copy Check received an unexpected layer-selection confirmation.",
          );
        } else {
          setSelectionError("");
        }
        pendingSelection.current = null;
        return;
      }

      setItems(pluginMessage.items);
      setSource(pluginMessage.source);
      setGuidelines(pluginMessage.guidelines);
      setScanStatus("ready");
      setSelectionError("");
      pendingSelection.current = null;
    }

    window.addEventListener("message", handleMessage);
    requestScan();

    return () => window.removeEventListener("message", handleMessage);
  }, [requestScan]);

  function selectLayer(nodeId: string) {
    if (pendingSelection.current !== null) {
      return;
    }

    pendingSelection.current = nodeId;
    setSelectionError("");
    sendToPlugin({ type: "select", nodeId });
  }

  function applyFinding(finding: Finding) {
    const item = items.find((candidate) => candidate.id === finding.nodeId);
    if (item === undefined) {
      setApplyError(
        "That audited layer is no longer available. Refresh before applying a rewrite.",
      );
      return;
    }

    const rewrite: Rewrite = {
      nodeId: finding.nodeId,
      text: finding.suggestion,
      expectedText: item.text,
    };
    pendingApply.current = rewrite;
    setApplyError("");
    setApplyingNodeId(finding.nodeId);
    sendToPlugin({ type: "apply", ...rewrite });
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

  const busy =
    scanStatus === "loading" ||
    auditStatus === "loading" ||
    applyingNodeId !== null ||
    isApplyingAll ||
    guidelineSaveStatus === "saving";

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextView: View | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextView = view === "audit" ? "guidelines" : "audit";
    } else if (event.key === "Home") {
      nextView = "audit";
    } else if (event.key === "End") {
      nextView = "guidelines";
    }

    if (nextView === null) {
      return;
    }

    event.preventDefault();
    setView(nextView);
    document.getElementById(`${nextView}-tab`)?.focus();
  }

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

      <div className="view-tabs" aria-label="Copy Check views" role="tablist">
        <button
          aria-controls="audit-panel"
          aria-selected={view === "audit"}
          className={view === "audit" ? "view-tab view-tab--active" : "view-tab"}
          id="audit-tab"
          onClick={() => setView("audit")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={view === "audit" ? 0 : -1}
          type="button"
        >
          Audit
        </button>
        <button
          aria-controls="guidelines-panel"
          aria-selected={view === "guidelines"}
          className={
            view === "guidelines" ? "view-tab view-tab--active" : "view-tab"
          }
          id="guidelines-tab"
          onClick={() => setView("guidelines")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={view === "guidelines" ? 0 : -1}
          type="button"
        >
          Guidelines
          <span>{guidelines.length}</span>
        </button>
      </div>

      <div
        aria-labelledby="audit-tab"
        className="view-panel"
        hidden={view !== "audit"}
        id="audit-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {view === "audit" && (
          <AuditView
            appliedNodeIds={appliedNodeIds}
            applyingNodeId={applyingNodeId}
            applyError={applyError}
            auditError={auditError}
            auditStatus={auditStatus}
            findings={findings}
            guidelines={guidelines}
            isApplyingAll={isApplyingAll}
            items={items}
            onApplyAll={applyAll}
            onApplyFinding={applyFinding}
            onCheckCopy={checkCopy}
            onRequestScan={requestScan}
            onSelectLayer={selectLayer}
            scanError={scanError}
            scanStatus={scanStatus}
            selectionError={selectionError}
            source={source}
          />
        )}
      </div>

      <div
        aria-labelledby="guidelines-tab"
        className="view-panel"
        hidden={view !== "guidelines"}
        id="guidelines-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {view === "guidelines" && (
          <GuidelinesView
            guidelineError={guidelineError}
            guidelines={guidelines}
            onAddGuideline={addGuideline}
            onRemoveGuideline={removeGuideline}
            onRestoreDefaults={restoreDefaultGuidelines}
            onSave={saveGuidelines}
            onUpdateGuideline={updateGuideline}
            saveStatus={guidelineSaveStatus}
          />
        )}
      </div>
    </main>
  );
}
