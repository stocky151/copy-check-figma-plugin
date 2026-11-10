import type {
  AuditRequest,
  AuditResponse,
  Finding,
} from "../shared/audit";
import { auditResponseSchema } from "./schemas";

const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;
const PRIMARY_MODEL_ATTEMPTS = 2;
const FALLBACK_MODEL_ATTEMPTS = 1;
const MODEL_REQUEST_TIMEOUT_MS = 15_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
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

function retryDelayMilliseconds(response: Response, attempt: number) {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter !== null) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1_000, 2_000);
    }
  }

  return attempt * 250;
}

async function wait(milliseconds: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function requestGemini(
  apiKey: string,
  requestBody: Record<string, unknown>,
) {
  for (const [modelIndex, model] of GEMINI_MODELS.entries()) {
    const maxAttempts =
      modelIndex === 0 ? PRIMARY_MODEL_ATTEMPTS : FALLBACK_MODEL_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(GEMINI_INTERACTIONS_URL, {
          method: "POST",
          headers: {
            "Api-Revision": "2026-05-20",
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({ ...requestBody, model }),
          signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        const hasAnotherAttempt = attempt < maxAttempts;
        const hasFallbackModel = modelIndex < GEMINI_MODELS.length - 1;

        if (!hasAnotherAttempt && !hasFallbackModel) {
          console.error(`Gemini request failed for ${model}`, error);
          throw new ModelServiceError(
            "The model service could not complete the audit.",
          );
        }

        if (hasAnotherAttempt) {
          console.warn(
            `Gemini request timed out for ${model}; retrying (${attempt}/${maxAttempts}).`,
          );
          await wait(attempt * 250);
        } else {
          console.warn(
            `Gemini request timed out for ${model}; trying ${GEMINI_MODELS[modelIndex + 1]}.`,
          );
        }
        continue;
      }

      if (response.ok) {
        return response;
      }

      const responseText = await response.text();
      const isRetryable = RETRYABLE_STATUSES.has(response.status);
      const hasAnotherAttempt = attempt < maxAttempts;
      const hasFallbackModel = modelIndex < GEMINI_MODELS.length - 1;

      if (!isRetryable || (!hasAnotherAttempt && !hasFallbackModel)) {
        console.error(
          `Gemini request failed for ${model}`,
          response.status,
          responseText.slice(0, 500),
        );
        throw new ModelServiceError(
          "The model service could not complete the audit.",
        );
      }

      if (hasAnotherAttempt) {
        console.warn(
          `Gemini request returned ${response.status} for ${model}; retrying (${attempt}/${maxAttempts}).`,
        );
        await wait(retryDelayMilliseconds(response, attempt));
      } else {
        console.warn(
          `Gemini request returned ${response.status} for ${model}; trying ${GEMINI_MODELS[modelIndex + 1]}.`,
        );
      }
    }
  }

  throw new ModelServiceError("The model service could not complete the audit.");
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
  const requestBody = {
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
      thinking_level: "low",
    },
  };

  const response = await requestGemini(apiKey, requestBody);

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
