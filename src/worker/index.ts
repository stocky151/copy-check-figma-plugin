import { auditWithGemini, ModelServiceError } from "./gemini";
import { auditRequestSchema } from "./schemas";

const MAX_BODY_BYTES = 64 * 1_024;

export interface Env {
  GEMINI_API_KEY?: string;
  AUDIT_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Max-Age": "86400",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: HeadersInit = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function jsonResponse(
  value: unknown,
  status = 200,
  additionalHeaders: HeadersInit = {},
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...additionalHeaders,
    },
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
    throw new HttpError(413, "Request body is too large.");
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "Request body is too large.");
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function handleAudit(request: Request, env: Env) {
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }

  if (env.AUDIT_RATE_LIMITER) {
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.AUDIT_RATE_LIMITER.limit({ key: clientIp });

    if (!success) {
      throw new HttpError(
        429,
        "Too many audit requests. Please try again shortly.",
        { "Retry-After": "60" },
      );
    }
  }

  const body = await readJsonBody(request);
  const result = auditRequestSchema.safeParse(body);

  if (!result.success) {
    return jsonResponse(
      {
        error: "Invalid audit request.",
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, "The model service is not configured.");
  }

  const response = await auditWithGemini(result.data, env.GEMINI_API_KEY);
  return jsonResponse(response);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({ status: "ok" });
    }

    if (url.pathname !== "/audit") {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    try {
      return await handleAudit(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status, error.headers);
      }

      if (error instanceof ModelServiceError) {
        return jsonResponse({ error: error.message }, 502);
      }

      console.error("Unexpected Worker error", error);
      return jsonResponse({ error: "Unexpected server error." }, 500);
    }
  },
};
