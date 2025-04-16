// src/modules/sequential/utils.ts
import { z } from "zod";
import { CodeContextSchema } from "../code/context";

export const SequentialThinkingSchema = z.object({
  currentThinking: z
    .string()
    .describe(
      "A structured representation of the evolving thought process. MUST be different than other thoughts, and incorporate previous thinking and explicitly follow the 5-step reasoning structure. For each thought, include: * Original question/problem statement * Current step number (1-n) and its purpose * Summary of previous step's conclusions * Current analysis formatted with clear section headers for each step * Key findings and insights accumulated so far * Any open questions or uncertainties remaining * Transition to the next logical step. Format each thought with markdown headers (###) to clearly delineate sections. Ensure each new thought builds upon previous thinking rather than simply repeating it. Always end the current thinking with at least two questions",
    ),
  thoughtNumber: z.number().int().min(1).describe("Current thought number"),
  totalThoughts: z.number().int().min(1).describe("Total thoughts needed"),
  nextThoughtNeeded: z.boolean().describe("Whether another thought is needed"),
  isRevision: z
    .boolean()
    .optional()
    .describe("Whether this thought revises a previous one"),
  revisesThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Which thought is being revised"),
  branchFromThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Which thought is the branching point"),
  branchId: z.string().optional().describe("Identifier for the current branch"),
  needsMoreThoughts: z
    .boolean()
    .optional()
    .describe("If more thoughts are needed"),
  reasoningMode: z
    .enum(["analytical", "creative", "critical", "reflective"])
    .default("reflective")
    .describe("The style of reasoning to apply"),
  externalToolResult: z
    .object({
      toolType: z.string().describe("The type of tool that was used"),
      query: z.string().describe("The query that was used with the tool"),
      result: z.string().describe("The result returned by the tool"),
    })
    .optional()
    .describe("Results from an external tool to incorporate into thinking"),
  // Updated userContext to support both string and CodeContext
  userContext: z
    .union([z.string(), CodeContextSchema])
    .optional()
    .describe(
      "Additional context provided by the user, such as code snippets, relevant documents, or background information",
    ),
});

// Update ThoughtData type to match
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
  userContext?: string | z.infer<typeof CodeContextSchema>; // Updated to support both types
};

export const detectToolRequest = (
  generatedThought: string,
): { needsTool: boolean; toolType: string; query: string } | null => {
  // Check for code retrieval request patterns (can be expanded for your specific needs)
  const codeMatch = generatedThought.match(
    /(?:need|should|must|require)s?\s+(?:to\s+)?(?:see|check|review|examine|analyze|retrieve|get|find|look\s+at)\s+(?:the\s+)?code(?:\s+for)?(?:\s+in)?:?\s+["']?([^"'\n.!?]+)["']?/i,
  );
  if (codeMatch) {
    return {
      needsTool: true,
      toolType: "code_retrieval",
      query: codeMatch[1].trim(),
    };
  }

  // Check for documentation lookup patterns
  const docMatch = generatedThought.match(
    /(?:need|should|must|require)s?\s+(?:to\s+)?(?:see|check|review|read|consult|examine|reference)\s+(?:the\s+)?documentation(?:\s+for|about)?:?\s+["']?([^"'\n.!?]+)["']?/i,
  );
  if (docMatch) {
    return {
      needsTool: true,
      toolType: "documentation",
      query: docMatch[1].trim(),
    };
  }

  const filePathMatch = generatedThought.match(
    /(?:need|should|must|require)s?\s+(?:to\s+)?(?:see|check|review)\s+(?:the\s+)?file(?:\s+at)?(?:\s+path)?:?\s+["']?([^"'\n.!?]+\.[a-zA-Z]+)["']?/i,
  );
  if (filePathMatch) {
    return {
      needsTool: true,
      toolType: "file_content",
      query: filePathMatch[1].trim(),
    };
  }

  const symbolMatch = generatedThought.match(
    /(?:need|should|must|require)s?\s+(?:to\s+)?(?:find|locate|see)\s+(?:the\s+)?(?:definition|implementation|declaration)\s+of\s+["']?([a-zA-Z0-9_]+)["']?/i,
  );
  if (symbolMatch) {
    return {
      needsTool: true,
      toolType: "symbol_definition",
      query: symbolMatch[1].trim(),
    };
  }

  // Check for file search patterns
  const fileMatch = generatedThought.match(
    /(?:need|should|must|require)s?\s+(?:to\s+)?(?:search|find|locate|list)\s+(?:all\s+)?files?(?:\s+that)?(?:\s+contain)?:?\s+["']?([^"'\n.!?]+)["']?/i,
  );
  if (fileMatch) {
    return {
      needsTool: true,
      toolType: "file_search",
      query: fileMatch[1].trim(),
    };
  }

  // Look for explicit tool usage indicators
  if (
    generatedThought.includes("I should use the file search tool") ||
    generatedThought.includes("we need to examine the code") ||
    generatedThought.includes("using the code retrieval tool") ||
    generatedThought.includes("need to look up the API")
  ) {
    const lines = generatedThought.split("\n");
    for (const line of lines) {
      if (
        line.toLowerCase().includes("search for") ||
        line.toLowerCase().includes("look for") ||
        line.toLowerCase().includes("find files") ||
        line.toLowerCase().includes("retrieve code")
      ) {
        return {
          needsTool: true,
          toolType: line.toLowerCase().includes("search")
            ? "file_search"
            : "code_retrieval",
          query: line.split(":").pop()?.trim() || "relevant code",
        };
      }
    }
  }

  return null;
};
