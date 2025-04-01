import { z } from "zod";

// Define the schema for sequential thinking with renamed parameter and new externalToolResult field
export const SequentialThinkingSchema = z.object({
  // Renamed from "query" to make it clear this should evolve
  currentThinking: z
    .string()
    .describe(
      "The evolving thought process - MUST be different for each thought",
    ),
  thoughtNumber: z.number().int().positive().describe("Current thought number"),
  totalThoughts: z.number().int().positive().describe("Total thoughts needed"),
  nextThoughtNeeded: z.boolean().describe("Whether another thought is needed"),
  isRevision: z
    .boolean()
    .optional()
    .describe("Whether this thought revises a previous one"),
  revisesThought: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Which thought is being revised"),
  branchFromThought: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Which thought is the branching point"),
  branchId: z.string().optional().describe("Identifier for the current branch"),
  needsMoreThoughts: z
    .boolean()
    .optional()
    .describe("If more thoughts are needed"),
  reasoningMode: z
    .enum(["analytical", "creative", "critical", "reflective"])
    .default("analytical")
    .describe("The style of reasoning to apply"),
  externalToolResult: z
    .object({
      toolType: z.string(),
      query: z.string(),
      result: z.string(),
    })
    .optional()
    .describe("Results from an external tool to incorporate into thinking"),
});

// Interface for thought data
export interface ThoughtData {
  originalQuery: string;
  currentThinking: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  thought: string;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  reasoningMode?: string;
  suggestedToolUse?: {
    toolType: string;
    query: string;
  };
}

