import { z } from "zod";

export const SequentialThinkingSchema = z.object({
  currentThinking: z.string().describe(
    "The evolving thought process - MUST be different for each thought. Use previous generated thought as input for next thought."
  ),
  thoughtNumber: z.number().int().min(1).describe("Current thought number"),
  totalThoughts: z.number().int().min(1).describe("Total thoughts needed"),
  nextThoughtNeeded: z.boolean().describe("Whether another thought is needed"),
  isRevision: z.boolean().optional().describe("Whether this thought revises a previous one"),
  revisesThought: z.number().int().min(1).optional().describe("Which thought is being revised"),
  branchFromThought: z.number().int().min(1).optional().describe("Which thought is the branching point"),
  branchId: z.string().optional().describe("Identifier for the current branch"),
  needsMoreThoughts: z.boolean().optional().describe("If more thoughts are needed"),
  reasoningMode: z.enum(["analytical", "creative", "critical", "reflective"])
    .default("analytical")
    .describe("The style of reasoning to apply"),
  externalToolResult: z.object({
    toolType: z.string().describe("The type of tool that was used"),
    query: z.string().describe("The query that was used with the tool"),
    result: z.string().describe("The result returned by the tool"),
  }).optional().describe("Results from an external tool to incorporate into thinking"),
  // Add the new userContext parameter
  userContext: z.string().optional().describe("Additional context provided by the user, such as code snippets, relevant documents, or background information. Highly encouraged to be utilized"),
});

export type ThoughtData = {
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
  userContext?: string; // Add userContext to ThoughtData type
};
