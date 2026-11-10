import type { TextItem } from "./messages";

export type Guideline = {
  id: string;
  rule: string;
};

export type Finding = {
  nodeId: string;
  guidelineId: string;
  issue: string;
  suggestion: string;
};

export type AuditRequest = {
  items: TextItem[];
  guidelines: Guideline[];
};

export type AuditResponse = {
  findings: Finding[];
};

export const STARTER_GUIDELINES: readonly Guideline[] = [
  { id: "g1", rule: "Use sentence case for buttons, headings, and labels." },
  { id: "g2", rule: "Start button labels with a verb." },
  { id: "g3", rule: "Keep button labels to three words or fewer." },
  { id: "g4", rule: 'Link text names its destination. Never "click here".' },
  {
    id: "g5",
    rule: "Error messages say what happened and what to do next.",
  },
  {
    id: "g6",
    rule: 'Use one term per concept across the selection, such as "sign in" or "log in", not both.',
  },
  {
    id: "g7",
    rule: "Avoid internal jargon and abbreviations a customer would not know.",
  },
  { id: "g8", rule: "No exclamation marks in errors or warnings." },
];
