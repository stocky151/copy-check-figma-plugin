import { z } from "zod";
import type { AuditRequest, AuditResponse } from "../shared/audit";

const MAX_TOTAL_TEXT_CHARACTERS = 20_000;

const textItemSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    text: z.string().min(1).max(2_000),
    editable: z.boolean(),
  })
  .strict();

const guidelineSchema = z
  .object({
    id: z.string().min(1).max(100),
    rule: z.string().min(1).max(500),
  })
  .strict();

export const auditRequestSchema: z.ZodType<AuditRequest> = z
  .object({
    items: z.array(textItemSchema).min(1).max(100),
    guidelines: z.array(guidelineSchema).min(1).max(20),
  })
  .strict()
  .superRefine((request, context) => {
    const totalCharacters = request.items.reduce(
      (total, item) => total + item.text.length,
      0,
    );

    if (totalCharacters > MAX_TOTAL_TEXT_CHARACTERS) {
      context.addIssue({
        code: "custom",
        message: `Combined text must not exceed ${MAX_TOTAL_TEXT_CHARACTERS.toLocaleString()} characters.`,
        path: ["items"],
      });
    }

    const itemIds = new Set(request.items.map((item) => item.id));
    if (itemIds.size !== request.items.length) {
      context.addIssue({
        code: "custom",
        message: "Text item IDs must be unique.",
        path: ["items"],
      });
    }

    const guidelineIds = new Set(
      request.guidelines.map((guideline) => guideline.id),
    );
    if (guidelineIds.size !== request.guidelines.length) {
      context.addIssue({
        code: "custom",
        message: "Guideline IDs must be unique.",
        path: ["guidelines"],
      });
    }
  });

const findingSchema = z
  .object({
    nodeId: z.string().min(1).max(100),
    guidelineId: z.string().min(1).max(100),
    issue: z.string().min(1).max(500),
    suggestion: z.string().min(1).max(2_000),
  })
  .strict();

export const auditResponseSchema: z.ZodType<AuditResponse> = z
  .object({
    findings: z.array(findingSchema).max(200),
  })
  .strict();
