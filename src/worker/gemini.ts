import type {
  AuditRequest,
  AuditResponse,
  Finding,
} from "../shared/audit";
import { auditResponseSchema } from "./schemas";

const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.8-flash";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nodeId: {
            type: "string",
            description: "The exact node ID from the request.",
          },
          guidelineId: {
            type: "string",
            description: "The exact guideline ID from the request.",
          },
          issue: {
            type: "string",
            description: "A concise explanation of the copy problem.",
          },
          suggestion: {
            type: "string",
            description: "A replacement for the entire text layer.",
          },
        },
        required: ["nodeId", "guidelineId", "issue", "suggestion"],
      },
    },
  },
  required: ["findings"],
} as const;

export class ModelServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractOutputText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    return null;
  }

  for (let index = value.steps.length - 1; index >= 0; index -= 1) {
    const step = value.steps[index];
    if (!isRecord(step) || step.type !== "model_output") {
      continue;
    }

    if (!Array.isArray(step.content)) {
      continue;
    }

    for (const content of step.content) {
      if (
        isRecord(content) &&
        content.type === "text" &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }

  return null;
}

function removeInvalidFindings(
  findings: Finding[],
  request: AuditRequest,
): Finding[] {
  const itemTextById = new Map(
    request.items.map((item) => [item.id, item.text] as const),
  );
  const guidelineIds = new Set(
    request.guidelines.map((guideline) => guideline.id),
  );
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const originalText = itemTextById.get(finding.nodeId);
    const key = `${finding.nodeId}:${finding.guidelineId}`;

    if (
      originalText === undefined ||
      !guidelineIds.has(finding.guidelineId) ||
      finding.suggestion === originalText ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function auditWithGemini(
  request: AuditRequest,
  apiKey: string,
): Promise<AuditResponse> {
  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Api-Revision": "2026-05-20",
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      store: false,
      system_instruction:
        "You are a UX writing reviewer. Review only against the supplied guidelines. Use node IDs and guideline IDs exactly as provided. Report only meaningful problems. Suggestions must replace the entire text layer while preserving its intent. Return an empty findings array when the copy does not break a guideline.",
      input: JSON.stringify(request),
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: responseSchema,
      },
      generation_config: {
        max_output_tokens: 4_096,
      },
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error(
      "Gemini request failed",
      response.status,
      responseText.slice(0, 500),
    );
    throw new ModelServiceError("The model service could not complete the audit.");
  }

  const interaction: unknown = await response.json();
  const outputText = extractOutputText(interaction);

  if (outputText === null) {
    throw new ModelServiceError("The model service returned no text output.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(outputText);
  } catch {
    throw new ModelServiceError("The model service returned malformed JSON.");
  }

  const parsedResponse = auditResponseSchema.safeParse(parsedJson);
  if (!parsedResponse.success) {
    throw new ModelServiceError("The model service returned an invalid result.");
  }

  return {
    findings: removeInvalidFindings(parsedResponse.data.findings, request),
  };
}
